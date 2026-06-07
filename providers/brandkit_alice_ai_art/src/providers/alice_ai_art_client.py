import base64
from dataclasses import dataclass
from typing import Optional

from openai import OpenAI


@dataclass
class AliceAIArtRequest:
    prompt: str
    folder_id: str
    model: str = 'aliceai-image-art-3.0/latest'
    size: str = '1024x1024'
    timeout_secs: int = 240


class AliceAIArtClient:
    """OpenAI-compatible Images API client for Yandex Alice AI ART."""

    def __init__(self, api_key: str, *, base_url: str = 'https://ai.api.cloud.yandex.net/v1') -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')

    def generate(self, req: AliceAIArtRequest) -> tuple[bytes, dict]:
        folder_id = (req.folder_id or '').strip()
        if not folder_id:
            raise RuntimeError('YANDEX_CLOUD_FOLDER is empty.')
        model_name = (req.model or '').strip() or 'aliceai-image-art-3.0/latest'
        model_uri = f'art://{folder_id}/{model_name}'

        client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            project=folder_id,
            timeout=float(req.timeout_secs),
        )
        img = client.images.generate(
            model=model_uri,
            prompt=req.prompt,
            size=req.size,
        )
        if not img.data:
            raise RuntimeError('Alice AI ART response does not contain image data.')
        b64_json: Optional[str] = getattr(img.data[0], 'b64_json', None)
        if not b64_json:
            raise RuntimeError('Alice AI ART response does not contain b64_json image data.')
        raw = base64.b64decode(b64_json)
        meta = {
            'model_uri': model_uri,
            'size': req.size,
        }
        return raw, meta
