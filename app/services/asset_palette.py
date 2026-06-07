"""Постобработка растров: подгонка паттернов к палитре бренда."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from PIL import Image

from app.core.providers import ASSET_PROVIDER_SLUGS

logger = logging.getLogger(__name__)

_RASTER_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp'}
# Иллюстрации оставляем как сгенерировала модель: жёсткая квантизация
# к 2–3 цветам палитры убивает фотореализм и даёт «залитую краской» картинку.
_PALETTE_QUANTIZE_KINDS = ('patterns',)
# Recraft CLI уже выполняет quantize_to_palette в postprocess_dirs.
_SKIP_PALETTE_PROVIDERS = frozenset({'recraft'})


def normalize_palette_hex(value: str) -> str | None:
    raw = (value or '').strip()
    if not raw:
        return None
    if re.fullmatch(r'#[0-9a-fA-F]{3}', raw):
        chars = raw[1:]
        return f'#{"".join(ch * 2 for ch in chars).upper()}'
    if re.fullmatch(r'#[0-9a-fA-F]{6}', raw):
        return raw.upper()
    return None


def extract_brand_palette_hex(tokens: dict[str, Any]) -> list[str]:
    """Собирает HEX-цвета палитры проекта из design tokens."""
    palette = tokens.get('palette') if isinstance(tokens.get('palette'), dict) else {}
    palette_slots = tokens.get('palette_slots') if isinstance(tokens.get('palette_slots'), dict) else {}
    generation = tokens.get('generation') if isinstance(tokens.get('generation'), dict) else {}
    active_keys = generation.get('active_palette_keys')

    keys: list[str] = []
    if isinstance(active_keys, list):
        keys = [str(item) for item in active_keys if isinstance(item, str)]
    if not keys:
        keys = ['primary', 'secondary', 'accent']

    source = palette_slots if palette_slots else palette
    colors: list[str] = []
    seen: set[str] = set()
    for key in keys:
        raw = source.get(key) or palette.get(key)
        normalized = normalize_palette_hex(str(raw or ''))
        if normalized and normalized not in seen:
            seen.add(normalized)
            colors.append(normalized)
    return colors


def _build_palette_bytes(palette_hex: list[str]) -> list[int]:
    palette_bytes: list[int] = []
    for hex_color in palette_hex:
        value = hex_color.lstrip('#')
        palette_bytes.extend([int(value[i : i + 2], 16) for i in (0, 2, 4)])
    while len(palette_bytes) < 768:
        palette_bytes.extend(palette_bytes[: min(3, len(palette_bytes))] or [0, 0, 0])
    return palette_bytes[:768]


def quantize_raster_to_palette(path: Path, palette_hex: list[str]) -> bool:
    if not palette_hex or path.suffix.lower() not in _RASTER_SUFFIXES:
        return False
    try:
        with Image.open(path) as image:
            rgba = image.convert('RGBA')
            pal_img = Image.new('P', (1, 1))
            pal_img.putpalette(_build_palette_bytes(palette_hex))
            quantized = rgba.convert('RGB').quantize(palette=pal_img, dither=0).convert('RGBA')
            alpha = rgba.split()[3]
            quantized.putalpha(alpha)
            target = path.with_suffix('.png')
            quantized.save(target, format='PNG', optimize=True)
        if target != path and path.exists():
            path.unlink(missing_ok=True)
        return True
    except Exception as exc:
        logger.warning('palette postprocess skipped for %s: %s', path, exc)
        return False


def process_brand_rasters_palette(
    out_root: Path,
    brand_id: str,
    palette_hex: list[str],
    *,
    only_providers: frozenset[str] | None = None,
) -> int:
    if not palette_hex:
        return 0

    converted = 0
    for provider in ASSET_PROVIDER_SLUGS:
        if provider in _SKIP_PALETTE_PROVIDERS:
            continue
        if only_providers is not None and provider not in only_providers:
            continue
        for kind in _PALETTE_QUANTIZE_KINDS:
            folder = out_root / provider / brand_id / kind
            if not folder.is_dir():
                continue
            for file_path in sorted(folder.iterdir()):
                if not file_path.is_file() or file_path.suffix.lower() not in _RASTER_SUFFIXES:
                    continue
                if quantize_raster_to_palette(file_path, palette_hex):
                    converted += 1
    return converted
