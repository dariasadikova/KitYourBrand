from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path, PurePosixPath
from typing import Any, Callable
from urllib.parse import quote

from PIL import Image

from app.core.paths import OUT_DIR
from app.core.providers import (
    ASSET_PROVIDER_SLUGS,
    PROVIDERS,
    iter_asset_providers,
    iter_standard_cli_providers,
    parse_generation_provider_slugs,
)
from app.services.generation_error_summary import ProviderGenerationError, summarize_generation_failure
from app.services.project_service import ProjectService

logger = logging.getLogger("kityourbrand.generation")
PROVIDER_TIMEOUT_SECONDS = 300

# Доли шкалы 0–100 для этапов генерации (остальное — поровну между CLI-провайдерами).
_PROGRESS_SETUP_END = 20
_PROGRESS_RECRAFT_LO = 21
_PROGRESS_RECRAFT_HI = 38
_PROGRESS_NEW_STYLE = 40
_PROGRESS_STD_LO = 43
_PROGRESS_STD_HI = 78
_PROGRESS_WEBP = 82
_PROGRESS_MANIFEST_DEFAULT = 90


def _progress_setup_step_pct(step_index: int, total_steps: int) -> int:
    """Шаги подготовки заполняют [0, _PROGRESS_SETUP_END]. step_index от 1 до total_steps."""
    if total_steps <= 0:
        return 0
    return max(0, min(_PROGRESS_SETUP_END, _PROGRESS_SETUP_END * step_index // total_steps))


def _split_progress_band(start: int, end: int, n: int) -> list[tuple[int, int]]:
    """Делит inclusive [start, end] на n непрерывных отрезков; в каждом (lo, hi) включительно."""
    if n <= 0:
        return []
    span = end - start + 1
    parts: list[tuple[int, int]] = []
    pos = start
    for i in range(n):
        chunk = span // n + (1 if i < (span % n) else 0)
        lo = pos
        hi = pos + chunk - 1
        parts.append((lo, hi))
        pos = hi + 1
    return parts


def _figma_entry_url_for_storage(
    base_host: str,
    project_slug: str,
    brand_id: str,
    storage_path: str,
) -> str:
    """Публичный URL ассета для Figma manifest (как на странице результатов)."""
    rel = PurePosixPath(str(storage_path).replace('\\', '/'))
    parts = rel.parts
    if len(parts) >= 5 and parts[0] == 'generation_results':
        job_id, provider, kind, filename = parts[1], parts[2], parts[3], parts[-1]
        return (
            f'{base_host}/projects/{quote(project_slug)}/result-assets/{quote(job_id)}/'
            f'{quote(provider)}/{quote(kind)}/{quote(filename)}'
        )
    if len(parts) >= 5 and parts[0] == 'out':
        provider, stored_brand_id, kind, filename = parts[1], parts[2], parts[3], parts[-1]
        bid = stored_brand_id or brand_id
        return f'{base_host}/assets/{quote(bid)}/{quote(provider)}/{quote(kind)}/{quote(filename)}'
    return f'{base_host}/assets/{quote(brand_id)}/{quote("/".join(parts))}'


class GenerationCancelledError(RuntimeError):
    """Raised when user cancels current generation job."""


class ProviderExecutionTimeoutError(RuntimeError):
    """Raised when provider process exceeds allowed execution time."""

    def __init__(self, provider: str, timeout_seconds: int, stdout: str = '', stderr: str = '') -> None:
        provider_name = str(provider or '').strip() or 'provider'
        super().__init__(f'Таймаут выполнения провайдера {provider_name}: {timeout_seconds} сек.')
        self.provider = provider_name
        self.timeout_seconds = int(timeout_seconds)
        self.stdout = stdout
        self.stderr = stderr


class GenerationService:
    def __init__(self, project_service: ProjectService) -> None:
        self.project_service = project_service
        self.out_root = OUT_DIR
        self.providers = PROVIDERS
        self.meta_out_root = OUT_DIR / '_meta'

        self.recraft = self.providers['recraft']
        self.recraft_out_root = self.recraft.out_root
        self.recraft_dir = self.recraft.provider_dir
        if self.recraft.main_path is None:
            raise ValueError('Не настроен CLI entrypoint для провайдера Recraft.')
        self.recraft_main = self.recraft.main_path
        self.recraft_tokens = self.recraft_dir / 'config' / 'tokens.json'
        self.recraft_refs = self.recraft_dir / 'references'

        for path in [
            self.out_root,
            *[provider.out_root for provider in iter_asset_providers()],
            self.meta_out_root,
        ]:
            path.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _provider_subprocess_env(user_id: int | None = None) -> dict[str, str]:
        """Переменные для CLI провайдеров: корень проекта и пользовательские ключи из профиля."""
        from app.core.settings import settings
        from app.db import auth_service

        env = dict(os.environ)
        env['KITYOURBRAND_PROJECT_ROOT'] = str(settings.project_root.resolve())

        recraft_api_key = (settings.recraft_api_key or '').strip()
        openrouter_api_key = (settings.openrouter_api_key or '').strip()
        yandex_cloud_api_key = (settings.yandex_cloud_api_key or '').strip()
        yandex_cloud_folder = (settings.yandex_cloud_folder or '').strip()

        if user_id is not None:
            user_keys = auth_service.get_user_api_keys(user_id)
            recraft_api_key = user_keys.get('recraft_api_key') or recraft_api_key
            openrouter_api_key = user_keys.get('openrouter_api_key') or openrouter_api_key
            yandex_cloud_api_key = user_keys.get('yandex_cloud_api_key') or yandex_cloud_api_key
            yandex_cloud_folder = user_keys.get('yandex_cloud_folder') or yandex_cloud_folder

        if recraft_api_key:
            env['RECRAFT_API_KEY'] = recraft_api_key
        if openrouter_api_key:
            env['OPENROUTER_API_KEY'] = openrouter_api_key
        if yandex_cloud_api_key:
            env['YANDEX_CLOUD_API_KEY'] = yandex_cloud_api_key
        if yandex_cloud_folder:
            env['YANDEX_CLOUD_FOLDER'] = yandex_cloud_folder
        if settings.openrouter_referer:
            env['OPENROUTER_REFERER'] = settings.openrouter_referer
        if settings.openrouter_title:
            env['OPENROUTER_TITLE'] = settings.openrouter_title
        return env

    def convert_webp_to_png_in_dir(self, dir_path: Path) -> int:
        if not dir_path.exists():
            return 0
        converted = 0
        for p in dir_path.rglob('*.webp'):
            try:
                with Image.open(p) as im:
                    im.load()
                    if im.mode not in ('RGB', 'RGBA'):
                        im = im.convert('RGBA')
                    out = p.with_suffix('.png')
                    im.save(out, format='PNG', optimize=True)
                p.unlink(missing_ok=True)
                converted += 1
            except Exception:
                continue
        return converted

    def convert_webp_to_png_for_brand(self, brand_id: str, *, only_providers: frozenset[str] | None = None) -> dict[str, int]:
        summary: dict[str, int] = {}
        for provider in iter_asset_providers():
            if only_providers is not None and provider.slug not in only_providers:
                continue
            root = provider.out_root / brand_id
            n = (
                self.convert_webp_to_png_in_dir(root / 'logos')
                + self.convert_webp_to_png_in_dir(root / 'patterns')
                + self.convert_webp_to_png_in_dir(root / 'illustrations')
            )
            if n:
                summary[provider.slug] = n
        return summary

    def scan_dir(self, dir_path: Path, exts: tuple[str, ...]) -> list[tuple[str, str]]:
        if not dir_path.is_dir():
            return []
        items = []
        for fn in sorted(os.listdir(dir_path)):
            if fn.lower().endswith(exts):
                items.append((Path(fn).stem, fn))
        return items

    def clear_brand_outputs(self, brand_id: str, *, only_providers: frozenset[str] | None = None) -> None:
        """Remove previous generation files for this brand only (optionally — только выбранные провайдеры)."""
        if not brand_id:
            return
        targets = iter_asset_providers()
        if only_providers is not None:
            targets = tuple(p for p in targets if p.slug in only_providers)
        for provider in targets:
            brand_root = provider.out_root / brand_id
            for section in ('logos', 'icons', 'patterns', 'illustrations'):
                section_dir = brand_root / section
                if section_dir.exists():
                    shutil.rmtree(section_dir, ignore_errors=True)
                section_dir.mkdir(parents=True, exist_ok=True)

    def build_and_save_figma_manifest(
        self,
        user_id: int,
        project_slug: str,
        brand_id: str,
        base_host: str,
        progress_callback: Callable[[int, str, str | None, str | None, dict[str, Any] | None], None] | None = None,
        *,
        manifest_progress: int = _PROGRESS_MANIFEST_DEFAULT,
    ) -> tuple[dict[str, Any], dict[str, int], Path]:
        def report(
            progress: int,
            message: str,
            provider: str | None = None,
            provider_status: str | None = None,
            provider_error: dict[str, Any] | None = None,
        ) -> None:
            if progress_callback:
                progress_callback(progress, message, provider, provider_status, provider_error)

        report(manifest_progress, 'Сборка Figma manifest')

        tokens = self.project_service.load_tokens(user_id, project_slug)
        effective_brand_id = (brand_id or tokens.get('brand_id') or '').strip()
        if not effective_brand_id:
            raise ValueError('Не указан brand_id для сборки Figma manifest.')

        brand = {
            'name': tokens.get('name', 'Brand'),
            'style_id': tokens.get('style_id', ''),
            'brand_id': effective_brand_id,
        }
        palette = tokens.get('palette', {})
        refs = tokens.get('references', {}).get('style_images', [])
        base_host = (base_host or '').rstrip('/').replace('127.0.0.1', 'localhost')
        base_url = f'{base_host}/assets/{effective_brand_id}'
        provider_roots = [
            (provider.slug, provider.out_root / effective_brand_id, provider.slug)
            for provider in iter_asset_providers()
        ]
        logos: list[dict[str, Any]] = []
        icons: list[dict[str, Any]] = []
        patterns: list[dict[str, Any]] = []
        illustrations: list[dict[str, Any]] = []

        for provider, root_dir, url_prefix in provider_roots:
            prefix = f'{url_prefix}/' if url_prefix else ''
            for n, fn in self.scan_dir(root_dir / 'logos', ('.png', '.svg', '.jpg', '.jpeg')):
                logos.append({
                    'name': f'{provider}-{n}',
                    'provider': provider,
                    'url': f'{base_url}/{prefix}logos/{fn}',
                })
            for n, fn in self.scan_dir(root_dir / 'icons', ('.png', '.svg', '.jpg', '.jpeg')):
                icons.append({
                    'name': f'{provider}-{n}',
                    'provider': provider,
                    'url': f'{base_url}/{prefix}icons/{fn}',
                    'sizes': [16, 24, 32],
                })
            for n, fn in self.scan_dir(root_dir / 'patterns', ('.png', '.jpg', '.jpeg')):
                patterns.append({
                    'name': f'{provider}-{n}',
                    'provider': provider,
                    'url': f'{base_url}/{prefix}patterns/{fn}',
                    'tile': 'seamless',
                })
            for n, fn in self.scan_dir(root_dir / 'illustrations', ('.png', '.jpg', '.jpeg')):
                illustrations.append({
                    'name': f'{provider}-{n}',
                    'provider': provider,
                    'url': f'{base_url}/{prefix}illustrations/{fn}',
                })

        style_images_urls = []
        for p in refs:
            if isinstance(p, str) and p.startswith('http'):
                style_images_urls.append(p)
            else:
                filename = Path(str(p)).name
                style_images_urls.append(f'{base_host}/projects/{project_slug}/refs/{filename}')

        manifest = {
            'brand': brand,
            'palette': palette,
            'logos': logos,
            'icons': icons,
            'patterns': patterns,
            'illustrations': illustrations,
            'tokens': {'icon': tokens.get('icon', {})},
            'references': {'style_images': style_images_urls},
            'provenance': {
                'generator': 'KitYourBrand FastAPI',
                'note': 'Ассеты доступны по /assets/<brand_id>/<provider>/...; референсы — по /projects/<project_slug>/refs/*',
                'available_providers': list(ASSET_PROVIDER_SLUGS),
            },
        }

        meta_dir = self.meta_out_root / effective_brand_id
        meta_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = meta_dir / 'figma_plugin_manifest.json'
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

        for provider_name in ASSET_PROVIDER_SLUGS:
            m2 = dict(manifest)
            m2['brand'] = dict(brand)
            m2['brand']['provider'] = provider_name
            m2['logos'] = [x for x in logos if x.get('provider') == provider_name]
            m2['icons'] = [x for x in icons if x.get('provider') == provider_name]
            m2['patterns'] = [x for x in patterns if x.get('provider') == provider_name]
            m2['illustrations'] = [x for x in illustrations if x.get('provider') == provider_name]
            (meta_dir / f'figma_plugin_manifest_{provider_name}.json').write_text(
                json.dumps(m2, ensure_ascii=False, indent=2),
                encoding='utf-8',
            )

        export_dir = self.project_service.exports_dir(user_id, project_slug)
        export_path = export_dir / 'figma_plugin_manifest.json'
        export_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

        counts = {
            'logos': len(logos),
            'icons': len(icons),
            'patterns': len(patterns),
            'illustrations': len(illustrations),
        }
        return manifest, counts, export_path

    def build_and_save_figma_manifest_for_job(
        self,
        user_id: int,
        project_slug: str,
        brand_id: str,
        base_host: str,
        generation_job_id: str,
    ) -> tuple[dict[str, Any], dict[str, int], Path]:
        """Figma manifest по снимку ассетов конкретного запуска (generation_results / out в БД)."""
        job_row = self.project_service.get_generation_history_job(user_id, project_slug, generation_job_id)
        if not job_row:
            raise ValueError('Запуск генерации не найден.')

        live_tokens = self.project_service.load_tokens(user_id, project_slug)
        past_tokens = self.project_service.tokens_at_generation_start(
            user_id,
            project_slug,
            tokens_snapshot_json=job_row.get('tokens_snapshot'),
            started_at=job_row.get('started_at'),
        )
        palette_tokens: dict[str, Any] = past_tokens if past_tokens else live_tokens

        effective_brand_id = (brand_id or palette_tokens.get('brand_id') or live_tokens.get('brand_id') or '').strip()
        if not effective_brand_id:
            raise ValueError('Не указан brand_id для сборки Figma manifest.')

        base_host_norm = (base_host or '').rstrip('/').replace('127.0.0.1', 'localhost')
        rows = self.project_service.list_assets_for_generation(user_id, project_slug, generation_job_id)

        logos: list[dict[str, Any]] = []
        icons: list[dict[str, Any]] = []
        patterns: list[dict[str, Any]] = []
        illustrations: list[dict[str, Any]] = []
        grouped: dict[str, list[dict[str, Any]]] = {
            'logos': logos,
            'icons': icons,
            'patterns': patterns,
            'illustrations': illustrations,
        }

        for row in rows:
            kind = str(row.get('kind') or '')
            if kind not in grouped:
                continue
            storage = str(row.get('storage_path') or '')
            filename = str(row.get('filename') or PurePosixPath(storage).name)
            provider = str(row.get('provider') or '')
            name_stem = PurePosixPath(filename).stem
            url = _figma_entry_url_for_storage(base_host_norm, project_slug, effective_brand_id, storage)
            entry: dict[str, Any] = {
                'name': f'{provider}-{name_stem}',
                'provider': provider,
                'url': url,
            }
            if kind == 'icons':
                entry['sizes'] = [16, 24, 32]
            if kind == 'patterns':
                entry['tile'] = 'seamless'
            grouped[kind].append(entry)

        brand = {
            'name': palette_tokens.get('name', 'Brand'),
            'style_id': palette_tokens.get('style_id', ''),
            'brand_id': effective_brand_id,
        }
        palette = palette_tokens.get('palette', {}) or {}
        refs = (palette_tokens.get('references') or {}).get('style_images', []) or []

        style_images_urls: list[str] = []
        for p in refs:
            if isinstance(p, str) and p.startswith('http'):
                style_images_urls.append(p)
            else:
                filename = Path(str(p)).name
                style_images_urls.append(f'{base_host_norm}/projects/{project_slug}/refs/{filename}')

        manifest: dict[str, Any] = {
            'brand': brand,
            'palette': palette,
            'logos': logos,
            'icons': icons,
            'patterns': patterns,
            'illustrations': illustrations,
            'tokens': {'icon': palette_tokens.get('icon', {})},
            'references': {'style_images': style_images_urls},
            'provenance': {
                'generator': 'KitYourBrand FastAPI',
                'generation_job_id': generation_job_id,
                'note': 'Ассеты привязаны к запуску генерации (URL из снимка / result-assets).',
                'available_providers': list(ASSET_PROVIDER_SLUGS),
            },
        }

        export_dir = self.project_service.exports_dir(user_id, project_slug)
        export_name = f'figma_plugin_manifest_{generation_job_id}.json'
        export_path = export_dir / export_name
        export_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

        counts = {
            'logos': len(logos),
            'icons': len(icons),
            'patterns': len(patterns),
            'illustrations': len(illustrations),
        }
        return manifest, counts, export_path

    def _prepare_recraft_references(self, user_id: int, project_slug: str, tokens: dict[str, Any]) -> list[Path]:
        ref_src_paths: list[Path] = []
        for rel in tokens.get('references', {}).get('style_images', []):
            src = self.project_service.project_dir(user_id, project_slug) / rel
            if src.exists() and src.is_file():
                ref_src_paths.append(src)
        ref_src_paths = ref_src_paths[:5]

        self.recraft_refs.mkdir(parents=True, exist_ok=True)
        for name in self.recraft_refs.iterdir():
            if name.is_file():
                name.unlink()

        for src in ref_src_paths:
            shutil.copy(src, self.recraft_refs / src.name)

        return ref_src_paths

    def _emit_cli_output(self, label: str, stdout: str | None, stderr: str | None) -> None:
        """Печатает захваченный вывод CLI в консоль процесса сервера (терминал uvicorn)."""
        out = (stdout or '').strip()
        err = (stderr or '').strip()
        if not out and not err:
            return
        logger.warning('[KitYourBrand][%s] ошибка CLI — полный stdout/stderr ниже (консоль)', label)
        print(f'[KitYourBrand][{label}] --- вывод CLI ---', flush=True)
        if out:
            print(out, flush=True)
        if err:
            print(err, file=sys.stderr, flush=True)
        print(f'[KitYourBrand][{label}] --- конец вывода ---', flush=True)

    def _run_checked(
        self,
        cmd: list[str],
        cwd: Path,
        *,
        label: str = 'cli',
        should_cancel: Callable[[], bool] | None = None,
        provider: str | None = None,
        timeout_seconds: int | None = None,
        user_id: int | None = None,
    ) -> tuple[str, str]:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            env=self._provider_subprocess_env(user_id),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        stdout_lines: list[str] = []
        stderr_lines: list[str] = []

        def collect_stream(stream, sink: list[str]) -> None:
            if stream is None:
                return
            try:
                for line in iter(stream.readline, ''):
                    if not line:
                        break
                    sink.append(line)
            finally:
                try:
                    stream.close()
                except Exception:
                    pass

        stdout_thread = threading.Thread(target=collect_stream, args=(proc.stdout, stdout_lines), daemon=True)
        stderr_thread = threading.Thread(target=collect_stream, args=(proc.stderr, stderr_lines), daemon=True)
        stdout_thread.start()
        stderr_thread.start()

        def collected_output() -> tuple[str, str]:
            stdout_thread.join(timeout=2)
            stderr_thread.join(timeout=2)
            return ''.join(stdout_lines), ''.join(stderr_lines)

        started_monotonic = time.monotonic()
        while True:
            if should_cancel and should_cancel():
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)
                collected_output()
                raise GenerationCancelledError('Генерация прервана пользователем.')
            if timeout_seconds:
                elapsed = time.monotonic() - started_monotonic
                if elapsed >= int(timeout_seconds):
                    proc.terminate()
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait(timeout=5)
                    stdout, stderr = collected_output()
                    raise ProviderExecutionTimeoutError(
                        provider=provider or label,
                        timeout_seconds=int(timeout_seconds),
                        stdout=stdout or '',
                        stderr=stderr or '',
                    )
            if proc.poll() is not None:
                break
            threading.Event().wait(0.2)

        stdout, stderr = collected_output()
        if proc.returncode != 0:
            err = subprocess.CalledProcessError(proc.returncode, cmd, output=stdout, stderr=stderr)
            self._emit_cli_output(label, stdout, stderr)
            raise err
        return (stdout or '').strip(), (stderr or '').strip()

    def _raise_provider_error(
        self,
        provider: str,
        exc: BaseException,
        *,
        stdout: str | None = None,
        stderr: str | None = None,
    ) -> None:
        primary, hint = summarize_generation_failure(exc, provider=provider)
        raise ProviderGenerationError(
            provider=provider,
            user_message=primary,
            hint=hint,
            stdout=stdout,
            stderr=stderr,
        ) from exc

    def _run_provider_command(
        self,
        *,
        provider: str,
        cmd: list[str],
        cwd: Path,
        cli_label: str,
        should_cancel: Callable[[], bool] | None = None,
        user_id: int | None = None,
    ) -> tuple[str, str]:
        try:
            return self._run_checked(
                cmd,
                cwd,
                label=cli_label,
                should_cancel=should_cancel,
                provider=provider,
                timeout_seconds=PROVIDER_TIMEOUT_SECONDS,
                user_id=user_id,
            )
        except ProviderExecutionTimeoutError as exc:
            self._emit_cli_output(cli_label, exc.stdout, exc.stderr)
            provider_label = provider[:1].upper() + provider[1:]
            raise ProviderGenerationError(
                provider=provider,
                user_message=(
                    f'Провайдер {provider_label} не ответил в течение 5 минут, генерация остановлена.'
                ),
                hint=(
                    f'Проверьте API-ключ и баланс {provider_label}, затем повторите запуск.'
                ),
            )
        except GenerationCancelledError:
            raise
        except subprocess.CalledProcessError as exc:
            self._raise_provider_error(
                provider,
                exc,
                stdout=(exc.stdout or '').strip(),
                stderr=(exc.stderr or '').strip(),
            )
        except Exception as exc:
            self._raise_provider_error(provider, exc)

    def _run_standard_provider(
        self,
        *,
        provider: str,
        main_path: Path,
        project_dir: Path,
        provider_out_root: Path,
        tokens_path: Path,
        brand_id: str,
        logos_count: int,
        icons_count: int,
        patterns_count: int,
        illustrations_count: int,
        cli_label: str = 'cli',
        should_cancel: Callable[[], bool] | None = None,
        user_id: int | None = None,
    ) -> dict[str, Any]:
        if not main_path.exists():
            raise ProviderGenerationError(
                provider=provider,
                user_message=f'CLI не найден: {main_path}',
                hint='Проверьте наличие файлов провайдера и корректность путей.',
            )

        cmd = [
            sys.executable,
            str(main_path),
            '--tokens', str(tokens_path),
            '--out', str(provider_out_root),
            '--brand-id', brand_id,
            '--logos', str(logos_count),
            '--icons', str(icons_count),
            '--patterns', str(patterns_count),
            '--illustrations', str(illustrations_count),
            '--force-png',
        ]
        stdout, stderr = self._run_provider_command(
            provider=provider,
            cmd=cmd,
            cwd=project_dir,
            cli_label=cli_label,
            should_cancel=should_cancel,
            user_id=user_id,
        )
        return {
            'ok': True,
            'error': '',
            'error_hint': None,
            'stdout': stdout,
            'stderr': stderr,
        }

    def generate_assets(
        self,
        user_id: int,
        project_slug: str,
        payload: dict[str, Any],
        base_host: str,
        progress_callback: Callable[[int, str, str | None, str | None, dict[str, Any] | None], None] | None = None,
        should_cancel: Callable[[], bool] | None = None,
        generation_job_id: str | None = None,
    ) -> dict[str, Any]:
        def report(
            progress: int,
            message: str,
            provider: str | None = None,
            provider_status: str | None = None,
            provider_error: dict[str, Any] | None = None,
        ) -> None:
            if progress_callback:
                progress_callback(progress, message, provider, provider_status, provider_error)

        logger.info("generate_project(project_slug=%s)", project_slug)

        def ensure_not_cancelled() -> None:
            if should_cancel and should_cancel():
                raise GenerationCancelledError('Генерация прервана пользователем.')

        tokens = self.project_service.load_tokens(user_id, project_slug)
        brand_id = (payload.get('brand_id') or tokens.get('brand_id') or '').strip()
        if not brand_id:
            raise ValueError('Не указан brand_id.')

        style_id = (payload.get('style_id') or tokens.get('style_id') or '').strip()
        logos_count = int(payload.get('logos_count') or 0)
        icons_count = int(payload.get('icons_count') or 0)
        patterns_count = int(payload.get('patterns_count') or 0)
        illustrations_count = int(payload.get('illustrations_count') or 0)
        build_style = bool(payload.get('build_style'))
        active_providers = parse_generation_provider_slugs(payload)

        if build_style and 'recraft' not in active_providers:
            raise ValueError(
                'Создание стиля Recraft несовместимо с отключённым провайдером Recraft. '
                'Включите Recraft или отключите опцию «Создать новый стиль».'
            )

        setup_steps = 5 if build_style else 3
        si = 0

        si += 1
        report(_progress_setup_step_pct(si, setup_steps), 'Загрузка конфигурации проекта')
        ensure_not_cancelled()
        self.clear_brand_outputs(brand_id, only_providers=active_providers)
        si += 1
        report(_progress_setup_step_pct(si, setup_steps), 'Очистка результатов прошлой генерации')

        generation_cfg = tokens.get('generation', {}) if isinstance(tokens.get('generation'), dict) else {}
        active_palette_keys = generation_cfg.get('active_palette_keys') if isinstance(generation_cfg.get('active_palette_keys'), list) else []
        active_palette_keys = [key for key in active_palette_keys if isinstance(key, str)]
        if active_palette_keys and len(active_palette_keys) < 2:
            raise ValueError('Нужно выбрать минимум 2 цвета палитры для генерации.')

        token_path = self.project_service.tokens_path(user_id, project_slug)
        if not token_path.exists():
            raise FileNotFoundError(f'Файл tokens.json не найден: {token_path}')
        if 'recraft' in active_providers and not self.recraft_main.exists():
            raise FileNotFoundError(f'Не найден генератор артефактов (Recraft): {self.recraft_main}')

        self.recraft_tokens.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(token_path, self.recraft_tokens)
        si += 1
        report(_progress_setup_step_pct(si, setup_steps), 'Проект сохранён и подготовлен для генерации')
        ensure_not_cancelled()

        provider_successes: dict[str, dict[str, Any]] = {}
        provider_failures: dict[str, dict[str, str | None]] = {}

        recraft_stdout = ''
        recraft_stderr = ''
        new_style_id = ''
        effective_style_id = style_id
        ref_src_paths: list[Path] = []

        if 'recraft' in active_providers:
            recraft_out_abs = self.recraft_out_root / brand_id
            recraft_out_abs.mkdir(parents=True, exist_ok=True)

            if build_style:
                si += 1
                report(_progress_setup_step_pct(si, setup_steps), 'Подготовка референсов для Recraft')
                ref_src_paths = self._prepare_recraft_references(user_id, project_slug, tokens)
                if ref_src_paths:
                    si += 1
                    report(_progress_setup_step_pct(si, setup_steps), f'Референсы подготовлены: {len(ref_src_paths)} шт.')
                else:
                    si += 1
                    report(_progress_setup_step_pct(si, setup_steps), 'Референсов нет, создание нового стиля будет пропущено')

            recraft_cmd = [sys.executable, str(self.recraft_main), '--tokens', str(self.recraft_tokens)]
            if style_id:
                recraft_cmd.extend(['--style-id', style_id])
            if build_style:
                recraft_cmd.append('--build-style')
            recraft_cmd.extend([
                '--logos', str(logos_count),
                '--icons', str(icons_count),
                '--patterns', str(patterns_count),
                '--illustrations', str(illustrations_count),
                '--out', str(recraft_out_abs),
            ])

            report(_PROGRESS_RECRAFT_LO, 'Запуск провайдера Recraft', 'recraft', 'running')
            try:
                recraft_stdout, recraft_stderr = self._run_provider_command(
                    provider='recraft',
                    cmd=recraft_cmd,
                    cwd=self.recraft_dir,
                    cli_label='recraft',
                    should_cancel=should_cancel,
                    user_id=user_id,
                )
                report(_PROGRESS_RECRAFT_HI, 'Recraft завершён успешно', 'recraft', 'success')
                provider_successes['recraft'] = {
                    'ok': True,
                    'error': '',
                    'error_hint': None,
                    'stdout': recraft_stdout,
                    'stderr': recraft_stderr,
                }
            except ProviderGenerationError as exc:
                report(
                    _PROGRESS_RECRAFT_HI,
                    exc.user_message or 'Recraft завершился с ошибкой',
                    'recraft',
                    'error',
                    {'message': exc.user_message, 'hint': exc.hint},
                )
                provider_failures['recraft'] = {
                    'message': exc.user_message,
                    'hint': exc.hint,
                }
                recraft_stdout = ''
                recraft_stderr = ''
            ensure_not_cancelled()

            if recraft_stdout:
                m = re.search(r'created style_id:\s*([0-9a-fA-F\-]+)', recraft_stdout)
                if m:
                    new_style_id = m.group(1).strip()
            effective_style_id = new_style_id or style_id

            if new_style_id:
                report(_PROGRESS_NEW_STYLE, f'Получен новый style_id: {new_style_id}')
                tokens['style_id'] = new_style_id
                self.project_service.save_tokens(user_id, project_slug, tokens)
                meta_brand_dir = self.meta_out_root / brand_id
                meta_brand_dir.mkdir(parents=True, exist_ok=True)
                (meta_brand_dir / 'style_id.txt').write_text(new_style_id, encoding='utf-8')

            if ref_src_paths:
                refs_out_dir = self.meta_out_root / brand_id / 'references'
                refs_out_dir.mkdir(parents=True, exist_ok=True)
                for src in ref_src_paths:
                    shutil.copy(src, refs_out_dir / src.name)
        else:
            report(_PROGRESS_RECRAFT_HI, 'Провайдер Recraft пропущен (не выбран в форме)', 'recraft', 'skipped')

        runnable_std = [
            p for p in iter_standard_cli_providers()
            if p.slug != 'recraft' and p.main_path is not None and p.slug in active_providers
        ]
        std_segments = _split_progress_band(_PROGRESS_STD_LO, _PROGRESS_STD_HI, len(runnable_std))
        std_progress_by_slug = {p.slug: std_segments[i] for i, p in enumerate(runnable_std)}

        standard_provider_results: dict[str, dict[str, Any]] = {}

        for provider in iter_standard_cli_providers():
            if provider.slug == 'recraft' or provider.slug not in active_providers:
                continue
            if provider.main_path is None:
                provider_failures[provider.slug] = {
                    'message': f'CLI не настроен для провайдера {provider.label}',
                    'hint': 'Проверьте ProviderConfig.main_path.',
                }
                continue

            start_progress, end_progress = std_progress_by_slug[provider.slug]
            report(start_progress, f'Запуск провайдера {provider.label}', provider.slug, 'running')
            try:
                result = self._run_standard_provider(
                    provider=provider.slug,
                    main_path=provider.main_path,
                    project_dir=provider.provider_dir,
                    provider_out_root=provider.out_root,
                    tokens_path=self.recraft_tokens,
                    brand_id=brand_id,
                    logos_count=logos_count,
                    icons_count=icons_count,
                    patterns_count=patterns_count,
                    illustrations_count=illustrations_count,
                    cli_label=provider.slug,
                    should_cancel=should_cancel,
                    user_id=user_id,
                )
                report(end_progress, f'{provider.label} завершён успешно', provider.slug, 'success')
                provider_successes[provider.slug] = result
                standard_provider_results[provider.slug] = result
            except ProviderGenerationError as exc:
                report(
                    end_progress,
                    exc.user_message or f'{provider.label} завершился с ошибкой',
                    provider.slug,
                    'error',
                    {'message': exc.user_message, 'hint': exc.hint},
                )
                provider_failures[provider.slug] = {
                    'message': exc.user_message,
                    'hint': exc.hint,
                }
                standard_provider_results[provider.slug] = {
                    'ok': False,
                    'error': exc.user_message or f'{provider.label} завершился с ошибкой',
                    'error_hint': exc.hint,
                    'stdout': '',
                    'stderr': '',
                }
            ensure_not_cancelled()

        if not provider_successes:
            failed_active = [k for k in provider_failures if k in active_providers]
            last_provider = failed_active[-1] if failed_active else 'recraft'
            last_error = provider_failures.get(last_provider) or {}
            raise ProviderGenerationError(
                provider=last_provider,
                user_message=(
                    (last_error.get('message') or 'Все провайдеры завершились с ошибкой.')
                    if isinstance(last_error, dict)
                    else 'Все провайдеры завершились с ошибкой.'
                ),
                hint='Проверьте ключи, баланс и доступность провайдеров, затем повторите запуск.',
            )

        report(_PROGRESS_WEBP, 'Постобработка изображений WEBP → PNG')
        webp_converted = self.convert_webp_to_png_for_brand(brand_id, only_providers=active_providers)

        if logos_count or icons_count:
            from app.services.asset_transparency import process_brand_logos_icons_transparency

            report(_PROGRESS_WEBP + 1, 'Прозрачный фон для логотипов и иконок')
            process_brand_logos_icons_transparency(
                self.out_root,
                brand_id,
                only_providers=active_providers,
            )

        if patterns_count or illustrations_count:
            from app.services.asset_palette import extract_brand_palette_hex, process_brand_rasters_palette

            palette_hex = extract_brand_palette_hex(tokens)
            if palette_hex:
                palette_progress = _PROGRESS_WEBP + (2 if (logos_count or icons_count) else 1)
                report(palette_progress, 'Подгонка паттернов к палитре бренда')
                process_brand_rasters_palette(
                    self.out_root,
                    brand_id,
                    palette_hex,
                    only_providers=active_providers,
                )

        manifest, counts, export_path = self.build_and_save_figma_manifest(
            user_id,
            project_slug,
            brand_id,
            base_host,
            progress_callback=progress_callback,
        )

        try:
            export_rel = str(export_path.relative_to(self.project_service.project_dir(user_id, project_slug)))
        except ValueError:
            export_rel = export_path.name
        self.project_service.record_figma_asset_manifest(
            user_id,
            project_slug,
            manifest=manifest,
            export_rel_path=export_rel,
            job_id=generation_job_id,
        )
        self.project_service.record_generated_assets_for_brand(
            user_id,
            project_slug,
            brand_id,
            self.out_root,
            job_id=generation_job_id,
            provider_slugs=active_providers,
        )

        report(100, 'Генерация завершена')

        has_errors = bool([k for k in provider_failures if k in active_providers])
        completion_message = (
            'Генерация завершена с ошибками провайдеров'
            if has_errors
            else 'Бренд-комплект успешно сгенерирован'
        )
        top_error_message = None
        top_error_hint = None
        if has_errors:
            first_failed = next(
                (s for s in ASSET_PROVIDER_SLUGS if s in provider_failures and s in active_providers),
                next(iter(provider_failures.keys()), 'recraft'),
            )
            first_err = provider_failures.get(first_failed) or {}
            provider_label = first_failed[:1].upper() + first_failed[1:]
            first_msg = str((first_err or {}).get('message') or '').strip()
            top_error_message = (
                f'Ошибка у провайдера {provider_label}: {first_msg}'
                if first_msg
                else f'Ошибка у провайдера {provider_label}.'
            )
            top_error_hint = str((first_err or {}).get('hint') or '').strip() or None

        providers_response = {}
        for provider_slug in ASSET_PROVIDER_SLUGS:
            if provider_slug not in active_providers:
                providers_response[provider_slug] = {
                    'ok': True,
                    'skipped': True,
                    'error': '',
                    'error_hint': None,
                    'stdout': '',
                    'stderr': '',
                }
                continue
            providers_response[provider_slug] = provider_successes.get(
                provider_slug,
                {
                    'ok': False,
                    'error': (provider_failures.get(provider_slug) or {}).get('message') if provider_failures.get(provider_slug) else '',
                    'error_hint': (provider_failures.get(provider_slug) or {}).get('hint') if provider_failures.get(provider_slug) else None,
                    'stdout': '',
                    'stderr': '',
                },
            )

        return {
            'ok': True,
            'message': completion_message,
            'style_id': effective_style_id,
            'providers_root': str(self.recraft_dir.parent),
            'output_root': str(self.out_root),
            'webp_converted': webp_converted,
            'has_errors': has_errors,
            'error': top_error_message,
            'error_hint': top_error_hint,
            'provider_errors': provider_failures,
            'recraft': provider_successes.get(
                'recraft',
                {
                    'ok': False,
                    'error': (provider_failures.get('recraft') or {}).get('message') if provider_failures.get('recraft') else '',
                    'error_hint': (provider_failures.get('recraft') or {}).get('hint') if provider_failures.get('recraft') else None,
                    'stdout': '',
                    'stderr': '',
                },
            ),
            'seedream': standard_provider_results.get('seedream', providers_response.get('seedream')),
            'flux': standard_provider_results.get('flux', providers_response.get('flux')),
            'providers': providers_response,
            'figma_manifest': {
                'ok': True,
                'url': f'/assets/{brand_id}/figma_plugin_manifest.json',
                'urls': {
                    'combined': f'/assets/{brand_id}/figma_plugin_manifest.json',
                    **{
                        provider_slug: f'/assets/{brand_id}/figma_plugin_manifest_{provider_slug}.json'
                        for provider_slug in ASSET_PROVIDER_SLUGS
                    },
                },
                'counts': counts,
            },
            'active_palette_keys': active_palette_keys or list((tokens.get('palette') or {}).keys()),
        }
