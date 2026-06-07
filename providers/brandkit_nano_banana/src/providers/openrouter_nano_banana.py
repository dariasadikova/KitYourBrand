import base64
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_KIT = (os.environ.get('KITYOURBRAND_PROJECT_ROOT') or '').strip()
if not _KIT:
    _KIT = str(Path(__file__).resolve().parents[4])
if _KIT not in sys.path:
    sys.path.insert(0, _KIT)

from app.integrations.provider_http import request_with_retries

_DATA_IMAGE_RE = re.compile(r'data:image/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+', re.IGNORECASE)
_MAX_EMPTY_RESPONSE_DETAIL = 280


@dataclass
class NanoBananaRequest:
    prompt: str
    model: str = "google/gemini-2.5-flash-image"
    n: int = 1
    timeout_secs: int = 240
    referer: Optional[str] = None
    title: Optional[str] = None
    aspect_ratio: Optional[str] = None
    image_size: Optional[str] = None
    seed: Optional[int] = None


def _assistant_message(resp_json: Dict[str, Any]) -> Dict[str, Any]:
    choices = resp_json.get('choices') or []
    if not choices:
        return {}
    message = (choices[0] or {}).get('message') or {}
    return message if isinstance(message, dict) else {}


def _assistant_text(message: Dict[str, Any]) -> str:
    content = message.get('content')
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get('type') == 'text':
                text = item.get('text')
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
        return ' '.join(parts)
    return ''


def describe_empty_image_response(resp_json: Dict[str, Any]) -> str:
    message = _assistant_message(resp_json)
    text = _assistant_text(message)
    finish_reason = (resp_json.get('choices') or [{}])[0].get('finish_reason')
    error = resp_json.get('error')
    parts: List[str] = []
    if isinstance(error, dict):
        err_msg = error.get('message') or error.get('code')
        if err_msg:
            parts.append(f'API error: {err_msg}')
    if finish_reason:
        parts.append(f'finish_reason={finish_reason}')
    if text:
        parts.append(f'assistant text: {text[:_MAX_EMPTY_RESPONSE_DETAIL]}')
    elif not parts:
        parts.append('assistant returned no image and no text')
    return ' '.join(parts)


class OpenRouterNanoBananaClient:
    """OpenRouter image generation client for Nano Banana."""

    def __init__(self, api_key: str, base_url: str = "https://openrouter.ai/api/v1/chat/completions"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def _headers(self, referer: Optional[str], title: Optional[str]) -> Dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if referer:
            headers["HTTP-Referer"] = referer
        if title:
            headers["X-Title"] = title
        return headers

    @staticmethod
    def _extract_data_urls(resp_json: Dict[str, Any]) -> List[str]:
        urls: List[str] = []
        seen: set[str] = set()

        def add(url: str) -> None:
            candidate = (url or '').strip().replace('\n', '').replace('\r', '')
            if not candidate or candidate in seen:
                return
            if candidate.startswith('data:image/') or candidate.startswith(('http://', 'https://')):
                seen.add(candidate)
                urls.append(candidate)

        def walk(obj: Any) -> None:
            if isinstance(obj, dict):
                inline = obj.get('inline_data') or obj.get('inlineData')
                if isinstance(inline, dict):
                    data = inline.get('data')
                    mime = inline.get('mime_type') or inline.get('mimeType') or 'image/png'
                    if isinstance(data, str) and data.strip():
                        add(f'data:{mime};base64,{data.strip()}')

                for key in ('url', 'b64_json', 'b64'):
                    value = obj.get(key)
                    if not isinstance(value, str) or not value.strip():
                        continue
                    if value.startswith('data:image/') or value.startswith(('http://', 'https://')):
                        add(value)
                    elif key in {'b64_json', 'b64'}:
                        add(f'data:image/png;base64,{value.strip()}')

                image_url = obj.get('image_url') or obj.get('imageUrl')
                if isinstance(image_url, dict):
                    walk(image_url)
                elif isinstance(image_url, str):
                    add(image_url)

                for value in obj.values():
                    walk(value)
            elif isinstance(obj, list):
                for item in obj:
                    walk(item)
            elif isinstance(obj, str):
                for match in _DATA_IMAGE_RE.findall(obj):
                    add(match)

        message = _assistant_message(resp_json)
        walk(message.get('images'))
        walk(message.get('content'))
        if not urls:
            walk(resp_json)
        return urls

    def fetch_url_image(self, url: str, *, timeout_secs: int) -> Tuple[str, bytes]:
        response = request_with_retries(
            'GET',
            url,
            timeout=float(timeout_secs),
            label='openrouter.nano_banana.image',
        )
        if response.status_code >= 400:
            raise RuntimeError(f'Failed to download image ({response.status_code})')
        mime = (response.headers.get('content-type') or 'image/png').split(';')[0].strip() or 'image/png'
        return mime, response.content

    def generate_once(self, req: NanoBananaRequest) -> Tuple[List[str], Dict[str, Any]]:
        payload: Dict[str, Any] = {
            "model": req.model,
            "messages": [{"role": "user", "content": req.prompt}],
            "modalities": ["image", "text"],
            "stream": False,
        }
        if req.n and req.n > 1:
            payload["n"] = int(req.n)
        if req.seed is not None:
            payload["seed"] = int(req.seed)

        image_config: Dict[str, str] = {}
        if req.aspect_ratio:
            image_config["aspect_ratio"] = str(req.aspect_ratio)
        if req.image_size:
            image_config["image_size"] = str(req.image_size)
        if image_config:
            payload["image_config"] = image_config

        response = request_with_retries(
            'POST',
            self.base_url,
            headers=self._headers(req.referer, req.title),
            json=payload,
            timeout=float(req.timeout_secs),
            label='openrouter.nano_banana',
        )
        if response.status_code >= 400:
            raise RuntimeError(f"OpenRouter error ({response.status_code}): {response.text[:1000]}")
        data = response.json()
        return self._extract_data_urls(data), data

    def generate(
        self,
        req: NanoBananaRequest,
        *,
        max_attempts: int = 3,
        retry_pause_secs: float = 2.0,
    ) -> Tuple[List[str], Dict[str, Any]]:
        last_data: Dict[str, Any] = {}
        for attempt in range(max(1, max_attempts)):
            urls, last_data = self.generate_once(req)
            if urls:
                return urls, last_data
            if attempt < max_attempts - 1:
                time.sleep(retry_pause_secs * (attempt + 1))
        return [], last_data


def parse_data_url(data_url: str) -> Tuple[str, bytes]:
    if not data_url.startswith("data:image/"):
        raise ValueError("Not an image data URL")
    head, b64 = data_url.split("base64,", 1)
    mime = head.split("data:", 1)[1].split(";", 1)[0]
    raw = base64.b64decode(b64)
    return mime, raw


def mime_to_ext(mime: str) -> str:
    m = (mime or "").lower()
    if m == "image/png":
        return ".png"
    if m in ("image/jpeg", "image/jpg"):
        return ".jpg"
    if m == "image/webp":
        return ".webp"
    return ".bin"
