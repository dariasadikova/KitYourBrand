from __future__ import annotations

import threading
import traceback
import uuid
from datetime import datetime
from typing import Any

from app.services.generation_error_summary import summarize_generation_failure


class GenerationJobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def _stamp(self) -> str:
        return datetime.now().strftime('%H:%M:%S')

    def create_job(self, *, user_id: int, project_slug: str) -> dict[str, Any]:
        job_id = uuid.uuid4().hex[:12]
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
            'providers': {
                'recraft': 'pending',
                'seedream': 'pending',
                'flux': 'pending',
            },
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
            if providers:
                job['providers'].update(providers)
            job.update(changes)

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def start_generation(self, *, job_id: str, generation_service, user_id: int, project_slug: str, payload: dict[str, Any], base_host: str) -> None:
        def runner() -> None:
            self.update(job_id, status='running', progress=3, message='Инициализация генерации')
            self.append_log(job_id, 'Инициализация генерации...')

            def report(progress: int, message: str, provider: str | None = None, provider_status: str | None = None) -> None:
                changes: dict[str, Any] = {'progress': progress, 'message': message}
                if provider and provider_status:
                    changes['providers'] = {provider: provider_status}
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
                final_status = 'completed'
                if not result.get('seedream', {}).get('ok', True) or not result.get('flux', {}).get('ok', True):
                    final_status = 'completed_with_errors'
                self.update(
                    job_id,
                    status=final_status,
                    progress=100,
                    message='Завершено' if final_status == 'completed' else 'Завершено с ошибками',
                    result=result,
                )
                self.append_log(job_id, 'Генерация завершена успешно!' if final_status == 'completed' else 'Генерация завершена с ошибками.')
            except Exception as exc:
                tb = traceback.format_exc()
                user_msg, hint = summarize_generation_failure(exc)
                self.update(
                    job_id,
                    status='failed',
                    progress=100,
                    message='Ошибка генерации',
                    error=user_msg,
                    error_hint=hint,
                    result={'traceback': tb},
                )
                self.append_log(job_id, 'Ошибка генерации')

        thread = threading.Thread(target=runner, daemon=True)
        thread.start()


generation_jobs = GenerationJobStore()
