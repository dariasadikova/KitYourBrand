from __future__ import annotations

import threading
import traceback
import uuid
from datetime import datetime
from typing import Any

from app.services.generation_error_summary import ProviderGenerationError, summarize_generation_failure


class GenerationJobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def _stamp(self) -> str:
        return datetime.now().strftime('%H:%M:%S')

    def create_job(self, *, user_id: int, project_slug: str) -> dict[str, Any]:
        job_id = uuid.uuid4().hex[:12]
        provider_map = {
            'recraft': 'pending',
            'seedream': 'pending',
            'flux': 'pending',
        }
        job = {
            'id': job_id,
            'user_id': user_id,
            'project_slug': project_slug,
            'status': 'pending',
            'progress': 0,
            'message': 'Ожидание запуска',
            'error': None,
            'error_hint': None,
            'logs': [f'[{self._stamp()}] Задача создана'],
            'result': None,
            'providers': dict(provider_map),
            'provider_statuses': dict(provider_map),
            'provider_errors': {
                'recraft': None,
                'seedream': None,
                'flux': None,
            },
            'current_provider': None,
            'failed_provider': None,
        }
        with self._lock:
            self._jobs[job_id] = job
        return dict(job)

    def append_log(self, job_id: str, message: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job['logs'].append(f'[{self._stamp()}] {message}')

    def update(self, job_id: str, **changes: Any) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return

            providers = changes.pop('providers', None)
            provider_statuses = changes.pop('provider_statuses', None)
            merged_statuses = providers or provider_statuses
            if merged_statuses:
                job['providers'].update(merged_statuses)
                job['provider_statuses'].update(merged_statuses)

            provider_errors = changes.pop('provider_errors', None)
            if provider_errors:
                job['provider_errors'].update(provider_errors)

            job.update(changes)

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def start_generation(
        self,
        *,
        job_id: str,
        generation_service,
        user_id: int,
        project_slug: str,
        payload: dict[str, Any],
        base_host: str,
    ) -> None:
        def runner() -> None:
            self.update(job_id, status='running', progress=3, message='Инициализация генерации')
            self.append_log(job_id, 'Инициализация генерации...')

            def report(
                progress: int,
                message: str,
                provider: str | None = None,
                provider_status: str | None = None,
                provider_error: dict[str, Any] | None = None,
            ) -> None:
                changes: dict[str, Any] = {'progress': progress, 'message': message}

                if provider and provider_status:
                    changes['providers'] = {provider: provider_status}
                    if provider_status == 'running':
                        changes['current_provider'] = provider
                    elif provider_status == 'error':
                        changes['failed_provider'] = provider

                if provider and provider_error:
                    changes['provider_errors'] = {provider: provider_error}
                    if provider_error.get('message'):
                        changes['error'] = provider_error.get('message')
                    if provider_error.get('hint'):
                        changes['error_hint'] = provider_error.get('hint')

                self.update(job_id, **changes)
                self.append_log(job_id, message)

            try:
                result = generation_service.generate_assets(
                    user_id,
                    project_slug,
                    payload,
                    base_host,
                    progress_callback=report,
                )
                self.update(
                    job_id,
                    status='completed',
                    progress=100,
                    message='Завершено',
                    result=result,
                    current_provider=None,
                )
                self.append_log(job_id, 'Генерация завершена успешно!')
            except Exception as exc:
                tb = traceback.format_exc()
                snapshot = self.get_job(job_id) or {}

                failed_provider = (
                    getattr(exc, 'provider', None)
                    or snapshot.get('failed_provider')
                    or snapshot.get('current_provider')
                )

                if isinstance(exc, ProviderGenerationError):
                    user_msg = exc.user_message
                    hint = exc.hint
                else:
                    user_msg, hint = summarize_generation_failure(exc, provider=failed_provider)

                changes: dict[str, Any] = {
                    'status': 'failed',
                    'progress': 100,
                    'message': 'Ошибка генерации',
                    'error': user_msg,
                    'error_hint': hint,
                    'result': {'traceback': tb},
                    'current_provider': None,
                    'failed_provider': failed_provider,
                }

                if failed_provider:
                    changes['providers'] = {failed_provider: 'error'}
                    changes['provider_errors'] = {
                        failed_provider: {
                            'message': user_msg,
                            'hint': hint,
                        }
                    }

                self.update(job_id, **changes)
                self.append_log(job_id, user_msg or 'Ошибка генерации')
                if hint:
                    self.append_log(job_id, hint)

        thread = threading.Thread(target=runner, daemon=True)
        thread.start()


generation_jobs = GenerationJobStore()
