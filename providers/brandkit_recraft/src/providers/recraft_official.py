import os, requests
from typing import Optional, List, Tuple
import json as _json

from cli_log import info, warn, error, debug


class RecraftClient:
    """Официальный клиент Recraft API (минимальный).

    ВАЖНО:
    Раньше мы пытались угадывать формат (PNG/SVG) по расширению в URL.
    На Windows это часто ломается: Recraft может вернуть SVG (или WebP) без .svg в ссылке,
    и тогда файл сохранялся как .png, но содержал SVG-текст → Paint/Figma ругались.

    Поэтому теперь формат определяется по HTTP Content-Type и/или по сигнатуре первых байтов.
    """

    def __init__(self, base_url: Optional[str]=None, api_key: Optional[str]=None):
        self.base = base_url or os.getenv('RECRAFT_BASE_URL','https://external.api.recraft.ai/v1')
        self.key = api_key or os.getenv('RECRAFT_API_KEY')
        if not self.key:
            error('RECRAFT_API_KEY не задан — задайте ключ в .env или переменной окружения')
            raise RuntimeError('RECRAFT_API_KEY не задан')
        info('RecraftClient: base_url=%s, API key: %s', self.base, '***' if self.key else '(empty)')
        self.headers = {'Authorization': f'Bearer {self.key}'}

    def create_style(self, style: str, files: List[str]) -> str:
        url = f"{self.base}/styles"
        file_paths = list(files[:5])
        info('create_style: POST %s, style=%s, files=%s', url, style, [os.path.basename(p) for p in file_paths])
        mfiles = {}
        for i, path in enumerate(file_paths, 1):
            mfiles[f'file{i}'] = open(path, 'rb')
        data = {'style': style}
        try:
            r = requests.post(url, headers=self.headers, files=mfiles, data=data, timeout=60)
            try:
                r.raise_for_status()
            except Exception:
                self._debug_http_error(r, label="create_style", data=data, files=file_paths)
                raise
            style_id = r.json()['id']
            info('create_style: OK, style_id=%s', style_id)
            return style_id
        finally:
            for f in mfiles.values():
                try: f.close()
                except: pass

    def generate(self, prompt: str, model: str='recraftv3', style_id: Optional[str]=None,
                 style: Optional[str]=None, substyle: Optional[str]=None, n:int=1,
                 size: str='1024x1024', controls: Optional[dict]=None) -> str:
        """Возвращает URL на сгенерированный ассет."""
        url = f"{self.base}/images/generations"
        body = {'prompt': prompt, 'n': n, 'model': model, 'size': size}
        if style_id: body['style_id'] = style_id
        if style and not style_id: body['style'] = style
        if substyle and not style_id: body['substyle'] = substyle
        if controls: body['controls'] = controls

        prompt_preview = (prompt[:200] + '…') if len(prompt) > 200 else prompt
        info(
            'generate: POST %s model=%s style_id=%s style=%s substyle=%s',
            url, model, style_id or '-', style or '-', substyle or '-',
        )
        debug('generate: prompt (preview): %s', prompt_preview)

        r = requests.post(url, headers={**self.headers,'Content-Type':'application/json'}, json=body, timeout=120)
        try:
            r.raise_for_status()
        except Exception:
            warn('generate: HTTP error status=%s', r.status_code)
            self._debug_http_error(r, label="generate", payload=body)
            raise

        js = r.json()
        asset_url = js['data'][0]['url']
        info('generate: OK, asset URL получен (длина=%s)', len(asset_url))
        return asset_url

    @staticmethod
    def _detect_ext_and_mime(content_type: str, data: bytes) -> Tuple[str, str]:
        ct = (content_type or '').split(';',1)[0].strip().lower()

        # 1) Header-based
        if ct in ('image/svg+xml', 'image/svg'):
            return 'svg', 'image/svg+xml'
        if ct == 'image/png':
            return 'png', 'image/png'
        if ct in ('image/jpeg', 'image/jpg'):
            return 'jpg', 'image/jpeg'
        if ct == 'image/webp':
            return 'webp', 'image/webp'

        # 2) Signature-based (на случай неверных/пустых заголовков)
        head = data[:64].lstrip()
        if head.startswith(b'<svg') or b'<svg' in head[:32]:
            return 'svg', 'image/svg+xml'
        if data.startswith(b'\x89PNG\r\n\x1a\n'):
            return 'png', 'image/png'
        if data.startswith(b'\xff\xd8\xff'):
            return 'jpg', 'image/jpeg'
        if len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
            return 'webp', 'image/webp'

        # fallback
        return 'bin', ct or 'application/octet-stream'

    def _debug_http_error(self, r, *, label: str, payload=None, files=None, data=None):
        """
        Печатает максимум полезной информации при ошибке HTTP.
        payload — dict для JSON (generate)
        data — dict/str для form-data (create_style)
        files — список путей (create_style), чтобы не печатать бинарь
        """
        try:
            error('[%s] HTTP ERROR', label)
            error('status: %s', r.status_code)
            error('url   : %s', getattr(r.request, "url", r.url))
            rid = r.headers.get("x-request-id") or r.headers.get("x-trace-id") or r.headers.get("request-id")
            if rid:
                error('request-id: %s', rid)

            ct = r.headers.get("content-type", "")
            error('resp content-type: %s', ct)

            if payload is not None:
                try:
                    error('request json: %s', _json.dumps(payload, ensure_ascii=False)[:4000])
                except Exception:
                    error('request json: %s', str(payload)[:4000])

            if data is not None:
                try:
                    error('request data: %s', _json.dumps(data, ensure_ascii=False)[:4000])
                except Exception:
                    error('request data: %s', str(data)[:4000])

            if files is not None:
                error('request files: %s', files)

            txt = ""
            try:
                txt = r.text or ""
            except Exception:
                txt = ""
            if txt:
                error('response text (head): %s', txt[:4000])

            try:
                js = r.json()
                error('response json: %s', _json.dumps(js, ensure_ascii=False)[:8000])
            except Exception:
                pass

            error('[%s] end HTTP error dump', label)
        except Exception as ex:
            error('_debug_http_error: не удалось вывести детали: %s', ex)

    def download_asset(self, url: str, out_path_base: str) -> Tuple[str, str]:
        """Скачивает ассет и сохраняет с правильным расширением.

        out_path_base — путь БЕЗ расширения (например .../icons/bell)
        Возвращает (final_path, mime).
        """
        info('download_asset: GET %s', url[:200] + ('…' if len(url) > 200 else ''))
        r = requests.get(url, timeout=120)
        try:
            r.raise_for_status()
        except Exception:
            warn('download_asset: HTTP error status=%s', r.status_code)
            self._debug_http_error(r, label="download_asset", data={"url": url, "out": out_path_base})
            raise
        data = r.content
        ext, mime = self._detect_ext_and_mime(r.headers.get('Content-Type',''), data)

        # если base уже с расширением — не дублируем
        if out_path_base.lower().endswith('.' + ext):
            out_path = out_path_base
        else:
            out_path = out_path_base + '.' + ext

        with open(out_path, 'wb') as f:
            f.write(data)

        info('download_asset: сохранено %s (%s байт, mime=%s)', out_path, len(data), mime)
        return out_path, mime
