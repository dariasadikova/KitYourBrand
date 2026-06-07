#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Tuple

from dotenv import load_dotenv

from providers.alice_ai_art_client import AliceAIArtClient, AliceAIArtRequest

try:
    from PIL import Image

    PIL_OK = True
except Exception:
    PIL_OK = False

ROOT_ENV = Path(__file__).resolve().parents[3] / '.env'
load_dotenv(ROOT_ENV)

DEFAULT_MODEL = 'aliceai-image-art-3.0/latest'
DEFAULT_SIZE = '1024x1024'
PROVIDER_SLUG = 'alice_ai_art'
PROVIDER_LABEL = 'Alice AI ART'
MAX_PROMPT_CHARS = 500


def load_json(path: str) -> Dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def slugify(value: str) -> str:
    value = (value or '').strip().lower()
    value = re.sub(r'[^a-z0-9]+', '-', value)
    value = re.sub(r'-{2,}', '-', value).strip('-')
    return value or 'item'


def trim_prompt(prompt: str, limit: int = MAX_PROMPT_CHARS) -> str:
    cleaned = re.sub(r'\s+', ' ', (prompt or '').strip())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rstrip()


def palette_text(tokens: Dict) -> str:
    palette = tokens.get('palette') or {}
    if not isinstance(palette, dict):
        return ''
    parts = []
    for key in ('primary', 'secondary', 'accent'):
        if palette.get(key):
            parts.append(f'{key}:{palette[key]}')
    return 'Palette: ' + ', '.join(parts) + '.' if parts else ''


def style_text(tokens: Dict) -> Tuple[str, str]:
    style = tokens.get('style', {}) or {}
    if not isinstance(style, dict):
        return '', ''
    return (style.get('prompt') or '').strip(), (style.get('negative') or '').strip()


def build_logo_prompt(tokens: Dict, name: str) -> Tuple[str, str]:
    style_prompt, negative = style_text(tokens)
    prompt = (
        f'Brand logo for {name}. {style_prompt} {palette_text(tokens)} '
        'Centered mark, clean geometry, minimal vector-like style, transparent background, no text, no watermark.'
    )
    return trim_prompt(prompt), negative


def build_icon_prompt(tokens: Dict, name: str) -> Tuple[str, str]:
    style_prompt, negative = style_text(tokens)
    prompt = (
        f'UI icon for {name}. {style_prompt} {palette_text(tokens)} '
        'Centered, simple silhouette, high contrast, flat vector-like style, transparent background, no letters, no watermark.'
    )
    return trim_prompt(prompt), negative


def build_pattern_prompt(tokens: Dict, name: str) -> Tuple[str, str]:
    style_prompt, negative = style_text(tokens)
    prompt = (
        f'Seamless repeating brand pattern: {name}. {style_prompt} {palette_text(tokens)} '
        'Tileable wallpaper, ornamental repeat, clean composition, no text, no watermark.'
    )
    return trim_prompt(prompt), negative


def build_illustration_prompt(tokens: Dict, name: str) -> Tuple[str, str]:
    style_prompt, negative = style_text(tokens)
    prompt = (
        f'Brand illustration for UI: {name}. {style_prompt} {palette_text(tokens)} '
        'Single clear subject, modern friendly composition, not a pattern, no text, no watermark.'
    )
    return trim_prompt(prompt), negative


def build_prompts(tokens: Dict, kind: str, name: str) -> Tuple[str, str]:
    if kind == 'logos':
        return build_logo_prompt(tokens, name)
    if kind == 'icons':
        return build_icon_prompt(tokens, name)
    if kind == 'patterns':
        return build_pattern_prompt(tokens, name)
    return build_illustration_prompt(tokens, name)


def save_png(raw: bytes, out_path_base: str) -> str:
    out_path = out_path_base + '.png'
    if PIL_OK:
        try:
            img = Image.open(BytesIO(raw))
            if img.mode not in ('RGB', 'RGBA'):
                img = img.convert('RGBA')
            img.save(out_path, format='PNG')
            return out_path
        except Exception:
            pass
    with open(out_path, 'wb') as f:
        f.write(raw)
    return out_path


def take_n(items: List[str], n: int, fallback_prefix: str) -> List[str]:
    if n <= 0:
        return []
    items = items or []
    if len(items) >= n:
        return items[:n]
    output = list(items)
    for i in range(len(items) + 1, n + 1):
        output.append(f'{fallback_prefix}-{i:02d}')
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=f'BrandKit CLI generator via {PROVIDER_LABEL}')
    parser.add_argument('--tokens', required=True, help='Path to tokens.json')
    parser.add_argument('--out', default='out', help='Output root directory')
    parser.add_argument('--brand-id', default='', help='Brand ID subfolder inside out/')
    parser.add_argument('--logos', type=int, default=0, help='How many logos to generate')
    parser.add_argument('--icons', type=int, default=0, help='How many icons to generate')
    parser.add_argument('--patterns', type=int, default=0, help='How many patterns to generate')
    parser.add_argument('--illustrations', type=int, default=0, help='How many illustrations to generate')
    parser.add_argument('--model', default='', help='Override Alice AI ART model name')
    parser.add_argument('--size', default='', help='Image size, for example 1024x1024')
    parser.add_argument('--timeout', type=int, default=0, help='Request timeout seconds')
    parser.add_argument('--append-negative', action='store_true', help='Append tokens.style.negative into prompt as plain text')
    parser.add_argument('--force-png', action='store_true', help='Compatibility flag; Alice AI ART outputs are saved as PNG')
    args = parser.parse_args()

    api_key = os.getenv('YANDEX_CLOUD_API_KEY', '').strip()
    folder_id = os.getenv('YANDEX_CLOUD_FOLDER', '').strip()
    if not api_key:
        print('ERROR: set YANDEX_CLOUD_API_KEY env var', file=sys.stderr)
        return 2
    if not folder_id:
        print('ERROR: set YANDEX_CLOUD_FOLDER env var', file=sys.stderr)
        return 2

    tokens = load_json(args.tokens)
    alice_cfg = tokens.get('alice_ai_art') or {}
    if not isinstance(alice_cfg, dict):
        alice_cfg = {}

    model = (args.model or os.getenv('YANDEX_CLOUD_MODEL', '').strip() or alice_cfg.get('model') or DEFAULT_MODEL).strip()
    size = (args.size or alice_cfg.get('size') or DEFAULT_SIZE).strip()
    timeout_secs = args.timeout or int(alice_cfg.get('timeout_secs') or 240)

    client = AliceAIArtClient(api_key=api_key)

    brand_folder = args.out
    if args.brand_id:
        brand_folder = os.path.join(args.out, args.brand_id)

    output_dirs = {
        'logos': os.path.join(brand_folder, 'logos'),
        'icons': os.path.join(brand_folder, 'icons'),
        'patterns': os.path.join(brand_folder, 'patterns'),
        'illustrations': os.path.join(brand_folder, 'illustrations'),
    }
    for path in output_dirs.values():
        ensure_dir(path)

    prompts = tokens.get('prompts') or {}
    if not isinstance(prompts, dict):
        prompts = {}

    names_by_kind = {
        'logos': take_n(prompts.get('logos') or [], args.logos, 'logo'),
        'icons': take_n(prompts.get('icons') or [], args.icons, 'icon'),
        'patterns': take_n(prompts.get('patterns') or [], args.patterns, 'pattern'),
        'illustrations': take_n(prompts.get('illustrations') or [], args.illustrations, 'illustration'),
    }

    meta = {
        'provider': PROVIDER_SLUG,
        'transport': 'yandex_openai_images',
        'model': model,
        'folder_id': folder_id,
        'created_at': datetime.utcnow().isoformat() + 'Z',
        'size': size,
        'prompt_limit_chars': MAX_PROMPT_CHARS,
        'outputs': {'logos': [], 'icons': [], 'patterns': [], 'illustrations': []},
    }

    def generate_kind(kind: str, names: List[str]) -> None:
        for name in names:
            print(f'[{PROVIDER_SLUG}][{kind}] generating: {name}')
            prompt, negative = build_prompts(tokens, kind, name)
            if args.append_negative and negative:
                prompt = trim_prompt(f'{prompt}. Avoid: {negative}')

            request = AliceAIArtRequest(
                prompt=prompt,
                folder_id=folder_id,
                model=model,
                size=size,
                timeout_secs=timeout_secs,
            )
            raw, response_meta = client.generate(request)
            out_base = os.path.join(output_dirs[kind], slugify(name))
            saved_path = save_png(raw, out_base)
            meta['outputs'][kind].append({
                'name': name,
                'prompt': prompt,
                'negative': negative,
                'file': os.path.relpath(saved_path, brand_folder),
                'mime': 'image/png',
                'response': response_meta,
            })

    for kind in ('logos', 'icons', 'patterns', 'illustrations'):
        if names_by_kind[kind]:
            generate_kind(kind, names_by_kind[kind])

    meta_path = os.path.join(brand_folder, 'alice_ai_art_meta.json')
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print('[ok] done')
    print('[ok] output:', os.path.abspath(brand_folder))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
