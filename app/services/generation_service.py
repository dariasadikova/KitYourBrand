from __future__ import annotations

import logging
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

from PIL import Image

from app.core.paths import FLUX_DIR, OUT_DIR, RECRAFT_DIR, SEEDREAM_DIR
from app.services.project_service import ProjectService

logger = logging.getLogger("kityourbrand.generation")


class GenerationService:
    def __init__(self, project_service: ProjectService) -> None:
        self.project_service = project_service
        self.out_root = OUT_DIR
        self.recraft_out_root = OUT_DIR / 'recraft'
        self.seedream_out_root = OUT_DIR / 'seedream'
        self.flux_out_root = OUT_DIR / 'flux'
        self.meta_out_root = OUT_DIR / '_meta'

        self.recraft_dir = RECRAFT_DIR
        self.seedream_dir = SEEDREAM_DIR
        self.flux_dir = FLUX_DIR

        self.recraft_main = self.recraft_dir / 'src' / 'main.py'
        self.recraft_tokens = self.recraft_dir / 'config' / 'tokens.json'
        self.recraft_refs = self.recraft_dir / 'references'
        self.seedream_main = self.seedream_dir / 'src' / 'main.py'
        self.flux_main = self.flux_dir / 'src' / 'main.py'

        for path in [
            self.out_root,
            self.recraft_out_root,
            self.seedream_out_root,
            self.flux_out_root,
            self.meta_out_root,
        ]:
            path.mkdir(parents=True, exist_ok=True)

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

    def convert_webp_to_png_for_brand(self, brand_id: str) -> dict[str, int]:
        summary: dict[str, int] = {}
        for provider in ('recraft', 'seedream', 'flux'):
            root = self.out_root / provider / brand_id
            n = self.convert_webp_to_png_in_dir(root / 'patterns') + self.convert_webp_to_png_in_dir(root / 'illustrations')
            if n:
                summary[provider] = n
        return summary

    def scan_dir(self, dir_path: Path, exts: tuple[str, ...]) -> list[tuple[str, str]]:
        if not dir_path.is_dir():
            return []
        items = []
        for fn in sorted(os.listdir(dir_path)):
            if fn.lower().endswith(exts):
                items.append((Path(fn).stem, fn))
        return items

    def build_and_save_figma_manifest(
        self,
        user_id: int,
        project_slug: str,
        brand_id: str,
        base_host: str,
        progress_callback: Callable[[int, str, str | None, str | None], None] | None = None,
    ) -> tuple[dict[str, Any], dict[str, int], Path]:
        def report(progress: int, message: str, provider: str | None = None, provider_status: str | None = None) -> None:
            if progress_callback:
                progress_callback(progress, message, provider, provider_status)

        report(95, 'Сборка Figma manifest')

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
            ('recraft', self.recraft_out_root / effective_brand_id, 'recraft'),
            ('seedream', self.seedream_out_root / effective_brand_id, 'seedream'),
            ('flux', self.flux_out_root / effective_brand_id, 'flux'),
        ]
        icons: list[dict[str, Any]] = []
        patterns: list[dict[str, Any]] = []
        illustrations: list[dict[str, Any]] = []

        for provider, root_dir, url_prefix in provider_roots:
            prefix = f'{url_prefix}/' if url_prefix else ''
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
            'icons': icons,
            'patterns': patterns,
            'illustrations': illustrations,
            'tokens': {'icon': tokens.get('icon', {})},
            'references': {'style_images': style_images_urls},
            'provenance': {
                'generator': 'KitYourBrand FastAPI',
                'note': 'Ассеты доступны по /assets/<brand_id>/recraft|seedream|flux/...; референсы — по /projects/<project_slug>/refs/*',
            },
        }

        meta_dir = self.meta_out_root / effective_brand_id
        meta_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = meta_dir / 'figma_plugin_manifest.json'
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

        for provider_name in ('recraft', 'seedream', 'flux'):
            m2 = dict(manifest)
            m2['brand'] = dict(brand)
            m2['brand']['provider'] = provider_name
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

    def _run_checked(self, cmd: list[str], cwd: Path, *, label: str = 'cli') -> tuple[str, str]:
        try:
            proc = subprocess.run(
                cmd,
                cwd=str(cwd),
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as exc:
            self._emit_cli_output(label, exc.stdout, exc.stderr)
            raise
        return (proc.stdout or '').strip(), (proc.stderr or '').strip()

    def _run_optional_provider(
        self,
        *,
        main_path: Path,
        project_dir: Path,
        provider_out_root: Path,
        tokens_path: Path,
        brand_id: str,
        icons_count: int,
        patterns_count: int,
        illustrations_count: int,
        cli_label: str = 'cli',
    ) -> dict[str, Any]:
        if not main_path.exists():
            return {'ok': False, 'error': f'CLI не найден: {main_path}', 'stdout': '', 'stderr': ''}

        cmd = [
            sys.executable,
            str(main_path),
            '--tokens', str(tokens_path),
            '--out', str(provider_out_root),
            '--brand-id', brand_id,
            '--icons', str(icons_count),
            '--patterns', str(patterns_count),
            '--illustrations', str(illustrations_count),
        ]
        try:
            stdout, stderr = self._run_checked(cmd, project_dir, label=cli_label)
            return {'ok': True, 'error': '', 'stdout': stdout, 'stderr': stderr}
        except subprocess.CalledProcessError as exc:
            return {
                'ok': False,
                'error': (exc.stderr or exc.stdout or str(exc)).strip(),
                'stdout': (exc.stdout or '').strip(),
                'stderr': (exc.stderr or '').strip(),
            }
        except Exception as exc:
            return {'ok': False, 'error': str(exc), 'stdout': '', 'stderr': ''}

    def generate_assets(
        self,
        user_id: int,
        project_slug: str,
        payload: dict[str, Any],
        base_host: str,
        progress_callback: Callable[[int, str, str | None, str | None], None] | None = None,
    ) -> dict[str, Any]:
        def report(progress: int, message: str, provider: str | None = None, provider_status: str | None = None) -> None:
            if progress_callback:
                progress_callback(progress, message, provider, provider_status)

        logger.info("generate_project(project_slug=%s)", project_slug)

        tokens = self.project_service.load_tokens(user_id, project_slug)
        brand_id = (payload.get('brand_id') or tokens.get('brand_id') or '').strip()
        if not brand_id:
            raise ValueError('Не указан brand_id.')

        report(5, 'Загрузка конфигурации проекта')

        style_id = (payload.get('style_id') or tokens.get('style_id') or '').strip()
        icons_count = int(payload.get('icons_count') or 0)
        patterns_count = int(payload.get('patterns_count') or 0)
        illustrations_count = int(payload.get('illustrations_count') or 0)
        build_style = bool(payload.get('build_style'))

        generation_cfg = tokens.get('generation', {}) if isinstance(tokens.get('generation'), dict) else {}
        active_palette_keys = generation_cfg.get('active_palette_keys') if isinstance(generation_cfg.get('active_palette_keys'), list) else []
        active_palette_keys = [key for key in active_palette_keys if isinstance(key, str)]
        if active_palette_keys and len(active_palette_keys) < 2:
            raise ValueError('Нужно выбрать минимум 2 цвета палитры для генерации.')

        token_path = self.project_service.tokens_path(user_id, project_slug)
        if not token_path.exists():
            raise FileNotFoundError(f'Файл tokens.json не найден: {token_path}')
        if not self.recraft_main.exists():
            raise FileNotFoundError(f'Не найден генератор артефактов (Recraft): {self.recraft_main}')

        self.recraft_tokens.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(token_path, self.recraft_tokens)
        report(12, 'Проект сохранён и подготовлен для генерации')

        recraft_out_abs = self.recraft_out_root / brand_id
        recraft_out_abs.mkdir(parents=True, exist_ok=True)

        ref_src_paths: list[Path] = []
        if build_style:
            report(18, 'Подготовка референсов для Recraft')
            ref_src_paths = self._prepare_recraft_references(user_id, project_slug, tokens)
            if ref_src_paths:
                report(22, f'Референсы подготовлены: {len(ref_src_paths)} шт.')
            else:
                report(22, 'Референсов нет, создание нового стиля будет пропущено')

        recraft_cmd = [sys.executable, str(self.recraft_main), '--tokens', str(self.recraft_tokens)]
        if style_id:
            recraft_cmd.extend(['--style-id', style_id])
        if build_style:
            recraft_cmd.append('--build-style')
        recraft_cmd.extend([
            '--icons', str(icons_count),
            '--patterns', str(patterns_count),
            '--illustrations', str(illustrations_count),
            '--out', str(recraft_out_abs),
        ])

        report(28, 'Запуск провайдера Recraft', 'recraft', 'running')
        try:
            recraft_stdout, recraft_stderr = self._run_checked(recraft_cmd, self.recraft_dir, label='recraft')
            report(48, 'Recraft завершён успешно', 'recraft', 'success')
        except subprocess.CalledProcessError as exc:
            report(48, 'Recraft завершился с ошибкой', 'recraft', 'error')
            raise

        new_style_id = ''
        m = re.search(r'created style_id:\s*([0-9a-fA-F\-]+)', recraft_stdout)
        if m:
            new_style_id = m.group(1).strip()
        effective_style_id = new_style_id or style_id

        if new_style_id:
            report(52, f'Получен новый style_id: {new_style_id}')
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

        report(55, 'Запуск провайдера Seedream', 'seedream', 'running')
        seedream = self._run_optional_provider(
            main_path=self.seedream_main,
            project_dir=self.seedream_dir,
            provider_out_root=self.seedream_out_root,
            tokens_path=self.recraft_tokens,
            brand_id=brand_id,
            icons_count=icons_count,
            patterns_count=patterns_count,
            illustrations_count=illustrations_count,
            cli_label='seedream',
        )
        report(
            68,
            'Seedream завершён успешно' if seedream.get('ok') else 'Seedream завершён с ошибкой',
            'seedream',
            'success' if seedream.get('ok') else 'error',
        )

        report(72, 'Запуск провайдера Flux', 'flux', 'running')
        flux = self._run_optional_provider(
            main_path=self.flux_main,
            project_dir=self.flux_dir,
            provider_out_root=self.flux_out_root,
            tokens_path=self.recraft_tokens,
            brand_id=brand_id,
            icons_count=icons_count,
            patterns_count=patterns_count,
            illustrations_count=illustrations_count,
            cli_label='flux',
        )
        report(
            85,
            'Flux завершён успешно' if flux.get('ok') else 'Flux завершён с ошибкой',
            'flux',
            'success' if flux.get('ok') else 'error',
        )

        report(90, 'Постобработка изображений WEBP → PNG')
        webp_converted = self.convert_webp_to_png_for_brand(brand_id)

        _, counts, _ = self.build_and_save_figma_manifest(
            user_id,
            project_slug,
            brand_id,
            base_host,
            progress_callback=progress_callback,
        )

        report(100, 'Генерация завершена')

        return {
            'ok': True,
            'message': 'Бренд-комплект успешно сгенерирован',
            'style_id': effective_style_id,
            'providers_root': str(self.recraft_dir.parent),
            'output_root': str(self.out_root),
            'webp_converted': webp_converted,
            'recraft': {'stdout': recraft_stdout, 'stderr': recraft_stderr},
            'seedream': seedream,
            'flux': flux,
            'figma_manifest': {
                'ok': True,
                'url': f'/assets/{brand_id}/figma_plugin_manifest.json',
                'urls': {
                    'combined': f'/assets/{brand_id}/figma_plugin_manifest.json',
                    'recraft': f'/assets/{brand_id}/figma_plugin_manifest_recraft.json',
                    'seedream': f'/assets/{brand_id}/figma_plugin_manifest_seedream.json',
                    'flux': f'/assets/{brand_id}/figma_plugin_manifest_flux.json',
                },
                'counts': counts,
            },
            'active_palette_keys': active_palette_keys or list((tokens.get('palette') or {}).keys()),
        }
