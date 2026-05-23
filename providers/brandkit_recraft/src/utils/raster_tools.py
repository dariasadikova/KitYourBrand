from collections import deque

from PIL import Image


def _build_palette_bytes(palette_hex):
    pal = []
    for h in palette_hex:
        h = h.lstrip('#')
        pal.extend([int(h[i : i + 2], 16) for i in (0, 2, 4)])
    while len(pal) < 768:
        pal.extend(pal[: min(3, len(pal))] or [0, 0, 0])
    return pal[:768]


def _corner_background_rgb(image: Image.Image):
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
    return tuple(sum(channel) // len(samples) for channel in zip(*samples))


def _color_close(first, second, tolerance: int) -> bool:
    return all(abs(int(first[i]) - int(second[i])) <= tolerance for i in range(3))


def remove_flat_background(image: Image.Image, tolerance: int = 34) -> Image.Image:
    rgba = image.convert('RGBA')
    width, height = rgba.size
    if width == 0 or height == 0:
        return rgba
    background = _corner_background_rgb(rgba)
    pixels = rgba.load()
    visited = bytearray(width * height)
    queue = deque()
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


def remove_flat_background_file(path_in: str, tolerance: int = 34):
    import os

    with Image.open(path_in) as img:
        processed = remove_flat_background(img, tolerance=tolerance)
        base, _ = os.path.splitext(path_in)
        out_path = base + '.png'
        processed.save(out_path, format='PNG', optimize=True)
    if out_path != path_in and os.path.exists(path_in):
        os.remove(path_in)


def quantize_to_palette(path_in: str, palette_hex, out_path: str):
    if not palette_hex:
        return
    img = Image.open(path_in).convert('RGBA')
    pal_img = Image.new('P', (1, 1))
    pal_img.putpalette(_build_palette_bytes(palette_hex))
    q = img.convert('RGB').quantize(palette=pal_img, dither=0).convert('RGBA')
    q.save(out_path)
