import base64
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_KIT = (os.environ.get('KITYOURBRAND_PROJECT_ROOT') or '').strip()
if not _KIT:
    _KIT = str(Path(__file__).resolve().parents[4])
if _KIT not in sys.path:
    sys.path.insert(0, _KIT)

from app.integrations.provider_http import request_with_retries


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
        choices = resp_json.get("choices") or []
        if not choices:
            return urls

        msg = (choices[0] or {}).get("message") or {}

        images = msg.get("images") or []
        for image in images:
            image_url = image.get("image_url") or image.get("imageUrl") or {}
            url = image_url.get("url")
            if isinstance(url, str) and url.startswith("data:image/"):
                urls.append(url)

        content = msg.get("content")
        if isinstance(content, list):
            for item in content:
                if not isinstance(item, dict):
                    continue
                image_url = item.get("image_url") or item.get("imageUrl") or {}
                url = image_url.get("url") if isinstance(image_url, dict) else None
                if isinstance(url, str) and url.startswith("data:image/"):
                    urls.append(url)
        return urls

    def generate(self, req: NanoBananaRequest) -> Tuple[List[str], Dict[str, Any]]:
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
