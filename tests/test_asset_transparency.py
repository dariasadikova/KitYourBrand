from __future__ import annotations

from pathlib import Path

from PIL import Image

from app.services.asset_transparency import (
    _edges_already_transparent,
    process_brand_logos_icons_transparency,
    remove_flat_background,
)


def test_edges_already_transparent_detects_alpha_corners() -> None:
    image = Image.new('RGBA', (32, 32), (10, 20, 30, 0))
    assert _edges_already_transparent(image) is True


def test_remove_flat_background_keeps_already_transparent_image() -> None:
    image = Image.new('RGBA', (64, 64), (10, 20, 30, 0))
    image.putpixel((32, 32), (200, 40, 40, 255))
    result = remove_flat_background(image)
    assert result.getpixel((0, 0))[3] == 0
    assert result.getpixel((32, 32))[3] == 255


def test_remove_flat_background_removes_flat_white_border() -> None:
    image = Image.new('RGBA', (64, 64), (255, 255, 255, 255))
    for x in range(20, 44):
        for y in range(20, 44):
            image.putpixel((x, y), (12, 34, 56, 255))
    result = remove_flat_background(image)
    assert result.getpixel((0, 0))[3] == 0
    assert result.getpixel((32, 32))[3] == 255


def test_process_brand_logos_icons_skips_recraft(tmp_path: Path) -> None:
    brand_id = 'brand-test'
    recraft_logo = tmp_path / 'recraft' / brand_id / 'logos'
    seedream_icon = tmp_path / 'seedream' / brand_id / 'icons'
    recraft_logo.mkdir(parents=True)
    seedream_icon.mkdir(parents=True)

    white_logo = Image.new('RGB', (32, 32), (255, 255, 255))
    white_logo.putpixel((16, 16), (10, 20, 30))
    white_logo.save(recraft_logo / 'logo.png')

    white_icon = Image.new('RGB', (32, 32), (255, 255, 255))
    white_icon.putpixel((16, 16), (10, 20, 30))
    white_icon.save(seedream_icon / 'icon.png')

    converted = process_brand_logos_icons_transparency(tmp_path, brand_id)
    assert converted == 1

    with Image.open(recraft_logo / 'logo.png') as recraft_image:
        assert recraft_image.mode == 'RGB'

    with Image.open(seedream_icon / 'icon.png') as seedream_image:
        assert seedream_image.mode == 'RGBA'
        assert seedream_image.getpixel((0, 0))[3] == 0
