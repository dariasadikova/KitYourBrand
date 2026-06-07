from __future__ import annotations

from pathlib import Path

from PIL import Image

from app.services.asset_palette import (
    extract_brand_palette_hex,
    process_brand_rasters_palette,
    quantize_raster_to_palette,
)


def test_extract_brand_palette_hex_uses_active_palette_keys() -> None:
    tokens = {
        'palette': {'primary': '#112233', 'secondary': '#AABBCC', 'accent': '#FF00AA'},
        'palette_slots': {'primary': '#112233', 'secondary': '#AABBCC', 'accent': '#FF00AA', 'tertiary': '#010203'},
        'generation': {'active_palette_keys': ['primary', 'tertiary']},
    }
    assert extract_brand_palette_hex(tokens) == ['#112233', '#010203']


def test_quantize_raster_to_palette_snaps_colors(tmp_path: Path) -> None:
    image = Image.new('RGBA', (16, 16), (200, 40, 40, 255))
    path = tmp_path / 'test-quantize.png'
    image.save(path)
    assert quantize_raster_to_palette(path, ['#FF0000', '#00FF00']) is True
    with Image.open(path) as processed:
        rgb = processed.convert('RGB').getpixel((8, 8))
        assert rgb in {(255, 0, 0), (0, 255, 0)}


def test_process_brand_rasters_palette_skips_recraft(tmp_path: Path) -> None:
    brand_id = 'brand-palette'
    palette = ['#FF0000', '#00FF00', '#0000FF']

    recraft_dir = tmp_path / 'recraft' / brand_id / 'patterns'
    seedream_dir = tmp_path / 'seedream' / brand_id / 'patterns'
    recraft_dir.mkdir(parents=True)
    seedream_dir.mkdir(parents=True)

    recraft_image = Image.new('RGBA', (8, 8), (200, 40, 40, 255))
    seedream_image = Image.new('RGBA', (8, 8), (200, 40, 40, 255))
    recraft_image.save(recraft_dir / 'pattern.png')
    seedream_image.save(seedream_dir / 'pattern.png')

    converted = process_brand_rasters_palette(tmp_path, brand_id, palette)
    assert converted == 0

    with Image.open(recraft_dir / 'pattern.png') as recraft_after:
        assert recraft_after.getpixel((4, 4))[:3] == (200, 40, 40)

    with Image.open(seedream_dir / 'pattern.png') as seedream_after:
        assert seedream_after.getpixel((4, 4))[:3] == (200, 40, 40)
