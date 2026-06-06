#!/usr/bin/env python3
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

from providers.openrouter_nano_banana import (
    NanoBananaRequest,
    OpenRouterNanoBananaClient,
    mime_to_ext,
    parse_data_url,
)

try:
    from PIL import Image

    PIL_OK = True
except Exception:
    PIL_OK = False

ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(ROOT_ENV)

DEFAULT_MODEL = "google/gemini-2.5-flash-image"
PROVIDER_SLUG = "nano_banana"
PROVIDER_LABEL = "Nano Banana"


def load_json(path: str) -> Dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or "item"


def palette_text(tokens: Dict) -> str:
    palette = tokens.get("palette") or {}
    if not isinstance(palette, dict):
        return ""
    parts = []
    for key in ("primary", "secondary", "accent"):
        if palette.get(key):
            parts.append(f"{key}:{palette[key]}")
    return "Palette: " + ", ".join(parts) + "." if parts else ""


def style_text(tokens: Dict) -> Tuple[str, str]:
    style = tokens.get("style", {}) or {}
    if not isinstance(style, dict):
        return "", ""
    return (style.get("prompt") or "").strip(), (style.get("negative") or "").strip()


def build_logo_prompt(tokens: Dict, name: str) -> Tuple[str, str]:
    style_prompt, negative = style_text(tokens)
    icon_cfg = tokens.get("icon") or {}
    transparent_bg = (
        "Isolated on fully transparent background (PNG alpha). "
        "No solid background, no colored backdrop, no gradient fill, no floor, no shadow plate, no mockup, no scene."
    )
    prompt = (
        f"Create a brand logo concept for: {name}. "
        f"{style_prompt} {palette_text(tokens)} "
        f"Centered logo mark, clean geometry, minimal details, vector-like style. "
        f"{transparent_bg} No text, no watermark, no mockup."
    )
    if icon_cfg:
        prompt += f" Logo details: {json.dumps(icon_cfg, ensure_ascii=False)}."
    return prompt.strip(), negative


def build_icon_prompt(tokens: Dict, name: str) -> Tuple[str, str]:
    style_prompt, negative = style_text(tokens)
    icon_cfg = tokens.get("icon") or {}
    transparent_bg = (
        "Isolated on fully transparent background (PNG alpha). "
        "No solid background, no colored backdrop, no gradient fill, no floor, no shadow plate, no mockup, no scene."
    )
    prompt = (
        f"Design a simple UI icon for: {name}. "
        f"{style_prompt} {palette_text(tokens)} "
        f"Centered composition, high contrast, clean silhouette. "
        f"Flat vector-like look, minimal details. {transparent_bg} "
        f"No letters, no words, no watermark."
    )
    if icon_cfg:
        prompt += f" Icon details: {json.dumps(icon_cfg, ensure_ascii=False)}."
    return prompt.strip(), negative


def build_pattern_prompt(tokens: Dict, name: str) -> Tuple[str, str]:
    style_prompt, negative = style_text(tokens)
    prompt = (
        f"Create a seamless repeating pattern texture: {name}. "
        f"{style_prompt} {palette_text(tokens)} "
        f"Tileable wallpaper, seamless edges, ornamental repeat, minimal, clean. No text, no watermark."
    )
    return prompt.strip(), negative


def build_illustration_prompt(tokens: Dict, name: str) -> Tuple[str, str]:
    style_prompt, negative = style_text(tokens)
    prompt = (
        f"Create a single standalone brand illustration scene for UI: {name}. "
        f"{style_prompt} {palette_text(tokens)} "
        f"One clear subject or scene, not a seamless pattern, not tileable, not wallpaper. "
        f"Modern, friendly, clean composition. No text, no watermark."
    )
    return prompt.strip(), negative


def build_prompts(tokens: Dict, kind: str, name: str) -> Tuple[str, str]:
    if kind == "logos":
        return build_logo_prompt(tokens, name)
    if kind == "icons":
        return build_icon_prompt(tokens, name)
    if kind == "patterns":
        return build_pattern_prompt(tokens, name)
    return build_illustration_prompt(tokens, name)


def save_image_bytes(raw: bytes, mime: str, out_path_base: str, force_png: bool = False) -> str:
    ext = mime_to_ext(mime)
    out_path = out_path_base + ext

    if force_png and PIL_OK and ext != ".png":
        try:
            img = Image.open(BytesIO(raw)).convert("RGBA")
            out_path = out_path_base + ".png"
            img.save(out_path, format="PNG")
            return out_path
        except Exception:
            pass

    with open(out_path, "wb") as f:
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
        output.append(f"{fallback_prefix}-{i:02d}")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=f"BrandKit CLI generator via OpenRouter {PROVIDER_LABEL}")
    parser.add_argument("--tokens", required=True, help="Path to tokens.json")
    parser.add_argument("--out", default="out", help="Output root directory")
    parser.add_argument("--brand-id", default="", help="Brand ID subfolder inside out/")
    parser.add_argument("--logos", type=int, default=0, help="How many logos to generate")
    parser.add_argument("--icons", type=int, default=0, help="How many icons to generate")
    parser.add_argument("--patterns", type=int, default=0, help="How many patterns to generate")
    parser.add_argument("--illustrations", type=int, default=0, help="How many illustrations to generate")
    parser.add_argument("--model", default="", help="Override OpenRouter model")
    parser.add_argument("--n", type=int, default=1, help="How many images per prompt if supported")
    parser.add_argument("--timeout", type=int, default=0, help="Request timeout seconds")
    parser.add_argument("--aspect-ratio", default="", help="OpenRouter image_config.aspect_ratio")
    parser.add_argument("--image-size", default="", help="OpenRouter image_config.image_size")
    parser.add_argument("--seed", type=int, default=None, help="Best-effort seed")
    parser.add_argument("--append-negative", action="store_true", help="Append tokens.style.negative into prompt as plain text")
    parser.add_argument("--force-png", action="store_true", help="Try to convert outputs to PNG")
    args = parser.parse_args()

    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        print("ERROR: set OPENROUTER_API_KEY env var", file=sys.stderr)
        return 2

    tokens = load_json(args.tokens)
    openrouter_cfg = tokens.get("openrouter") or {}
    if not isinstance(openrouter_cfg, dict):
        openrouter_cfg = {}

    model = (args.model or openrouter_cfg.get("model") or DEFAULT_MODEL).strip()
    timeout_secs = args.timeout or int(openrouter_cfg.get("timeout_secs") or 240)
    referer = os.getenv("OPENROUTER_REFERER", "").strip() or openrouter_cfg.get("referer")
    title = os.getenv("OPENROUTER_TITLE", "").strip() or openrouter_cfg.get("title")

    image_cfg = openrouter_cfg.get("image_config") if isinstance(openrouter_cfg.get("image_config"), dict) else {}
    aspect_ratio = (args.aspect_ratio or image_cfg.get("aspect_ratio") or "").strip() or None
    image_size = (args.image_size or image_cfg.get("image_size") or "").strip() or None

    client = OpenRouterNanoBananaClient(api_key=api_key)

    brand_folder = args.out
    if args.brand_id:
        brand_folder = os.path.join(args.out, args.brand_id)

    output_dirs = {
        "logos": os.path.join(brand_folder, "logos"),
        "icons": os.path.join(brand_folder, "icons"),
        "patterns": os.path.join(brand_folder, "patterns"),
        "illustrations": os.path.join(brand_folder, "illustrations"),
    }
    for path in output_dirs.values():
        ensure_dir(path)

    prompts = tokens.get("prompts") or {}
    if not isinstance(prompts, dict):
        prompts = {}

    names_by_kind = {
        "logos": take_n(prompts.get("logos") or [], args.logos, "logo"),
        "icons": take_n(prompts.get("icons") or [], args.icons, "icon"),
        "patterns": take_n(prompts.get("patterns") or [], args.patterns, "pattern"),
        "illustrations": take_n(prompts.get("illustrations") or [], args.illustrations, "illustration"),
    }

    meta = {
        "provider": PROVIDER_SLUG,
        "transport": "openrouter",
        "model": model,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "image_config": {"aspect_ratio": aspect_ratio, "image_size": image_size},
        "seed": args.seed,
        "outputs": {"logos": [], "icons": [], "patterns": [], "illustrations": []},
    }

    def generate_kind(kind: str, names: List[str]) -> None:
        for name in names:
            print(f"[{PROVIDER_SLUG}][{kind}] generating: {name}")
            prompt, negative = build_prompts(tokens, kind, name)
            if args.append_negative and negative:
                prompt = f"{prompt}\n\nNegative prompt: {negative}"

            request = NanoBananaRequest(
                prompt=prompt,
                model=model,
                n=max(1, int(args.n)),
                timeout_secs=timeout_secs,
                referer=referer,
                title=title,
                aspect_ratio=aspect_ratio,
                image_size=image_size,
                seed=args.seed,
            )
            urls, _raw_response = client.generate(request)
            if not urls:
                raise RuntimeError(f"No images in response for {kind}:{name}.")

            for index, data_url in enumerate(urls, start=1):
                mime, raw = parse_data_url(data_url)
                base_name = slugify(name)
                if len(urls) > 1:
                    base_name = f"{base_name}-{index:02d}"
                out_base = os.path.join(output_dirs[kind], base_name)
                saved_path = save_image_bytes(raw, mime, out_base, force_png=args.force_png)
                meta["outputs"][kind].append({
                    "name": name,
                    "prompt": prompt,
                    "negative": negative,
                    "file": os.path.relpath(saved_path, brand_folder),
                    "mime": mime,
                })

    for kind in ("logos", "icons", "patterns", "illustrations"):
        if names_by_kind[kind]:
            generate_kind(kind, names_by_kind[kind])

    meta_path = os.path.join(brand_folder, "openrouter_nano_banana_meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print("[ok] done")
    print("[ok] output:", os.path.abspath(brand_folder))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
