"""Постобработка логотипов и иконок: PNG с прозрачным фоном."""

from __future__ import annotations

import logging
from collections import deque
from pathlib import Path

from PIL import Image

from app.core.providers import ASSET_PROVIDER_SLUGS

logger = logging.getLogger(__name__)

_RASTER_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp'}
_MAX_MASK_SIDE = 768
# Recraft CLI уже вызывает remove_flat_background в postprocess_dirs.
_SKIP_TRANSPARENCY_PROVIDERS = frozenset({'recraft'})


def _corner_background_rgb(image: Image.Image) -> tuple[int, int, int]:
    rgba = image.convert('RGBA')
    width, height = rgba.size
    if width == 0 or height == 0:
        return (255, 255, 255)
    samples = [
        rgba.getpixel((0, 0))[:3],
        rgba.getpixel((width - 1, 0))[:3],
        rgba.getpixel((0, height - 1))[:3],
        rgba.getpixel((width - 1, height - 1))[:3],
    ]
    return tuple(sum(channel) // len(samples) for channel in zip(*samples, strict=True))


def _edges_already_transparent(image: Image.Image, *, min_alpha: int = 12) -> bool:
    rgba = image.convert('RGBA')
    width, height = rgba.size
    if width == 0 or height == 0:
        return False
    corners = (
        rgba.getpixel((0, 0))[3],
        rgba.getpixel((width - 1, 0))[3],
        rgba.getpixel((0, height - 1))[3],
        rgba.getpixel((width - 1, height - 1))[3],
    )
    return all(alpha <= min_alpha for alpha in corners)


def _color_close(first: tuple[int, int, int], second: tuple[int, int, int], tolerance: int) -> bool:
    return all(abs(int(first[i]) - int(second[i])) <= tolerance for i in range(3))


def _flood_fill_flat_background(image: Image.Image, *, tolerance: int = 34) -> Image.Image:
    rgba = image.convert('RGBA')
    width, height = rgba.size
    if width == 0 or height == 0:
        return rgba

    background = _corner_background_rgb(rgba)
    pixels = rgba.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= width or y >= height:
            continue
        index = y * width + x
        if visited[index]:
            continue
        red, green, blue, alpha = pixels[x, y]
        if alpha == 0 or not _color_close((red, green, blue), background, tolerance):
            continue
        visited[index] = 1
        pixels[x, y] = (red, green, blue, 0)
        queue.append((x + 1, y))
        queue.append((x - 1, y))
        queue.append((x, y + 1))
        queue.append((x, y - 1))

    return rgba


def remove_flat_background(image: Image.Image, *, tolerance: int = 34) -> Image.Image:
    """Убирает однотонный фон, связанный с краями кадра (flood fill)."""
    rgba = image.convert('RGBA')
    if _edges_already_transparent(rgba):
        return rgba

    width, height = rgba.size
    longest = max(width, height)
    if longest <= _MAX_MASK_SIDE:
        return _flood_fill_flat_background(rgba, tolerance=tolerance)

    scale = _MAX_MASK_SIDE / longest
    small_size = (max(1, int(width * scale)), max(1, int(height * scale)))
    small = rgba.resize(small_size, Image.Resampling.BILINEAR)
    processed_small = _flood_fill_flat_background(small, tolerance=tolerance)
    alpha = processed_small.split()[3].resize((width, height), Image.Resampling.BILINEAR)
    result = rgba.copy()
    result.putalpha(alpha)
    return result


def process_raster_asset_transparency(path: Path, *, tolerance: int = 34) -> Path | None:
    if path.suffix.lower() not in _RASTER_SUFFIXES:
        return None
    try:
        with Image.open(path) as image:
            processed = remove_flat_background(image, tolerance=tolerance)
            target = path.with_suffix('.png')
            processed.save(target, format='PNG', optimize=True)
        if target != path and path.exists():
            path.unlink(missing_ok=True)
        return target
    except Exception as exc:
        logger.warning('transparency postprocess skipped for %s: %s', path, exc)
        return None


def process_brand_logos_icons_transparency(
    out_root: Path,
    brand_id: str,
    *,
    only_providers: frozenset[str] | None = None,
) -> int:
    converted = 0
    for provider in ASSET_PROVIDER_SLUGS:
        if provider in _SKIP_TRANSPARENCY_PROVIDERS:
            continue
        if only_providers is not None and provider not in only_providers:
            continue
        for kind in ('logos', 'icons'):
            folder = out_root / provider / brand_id / kind
            if not folder.is_dir():
                continue
            for file_path in sorted(folder.iterdir()):
                if not file_path.is_file() or file_path.suffix.lower() not in _RASTER_SUFFIXES:
                    continue
                if process_raster_asset_transparency(file_path) is not None:
                    converted += 1
    return converted
