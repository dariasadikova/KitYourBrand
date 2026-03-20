import argparse, os, json
from dotenv import load_dotenv
from utils.file_utils import ensure_dir, slugify, hex_to_rgb_triplet
from utils.svg_tools import normalize_svg_palette_and_stroke
from utils.raster_tools import quantize_to_palette
from providers.recraft_official import RecraftClient

def load_tokens(path): 
    with open(path,'r',encoding='utf-8') as f: 
        return json.load(f)

def build_prompt(base_prompt, tokens, kind):
    pal = tokens.get('palette', {})
    icon = tokens.get('icon', {})
    tex = tokens.get('texture', {})
    ill = tokens.get('illustration', {})
    parts = [base_prompt]
    if kind=='icon':
        parts += [f"outline, rounded corners, stroke {icon.get('strokeWidth',2)}",
                  f"brand palette {pal.get('primary','')}/{pal.get('secondary','')}/{pal.get('accent','')}"]
    elif kind=='pattern':
        parts += [f"seamless background, motifs: {', '.join(tex.get('motifs', []))}, density: {tex.get('density','medium')}",
                  f"brand palette {pal.get('primary','')}/{pal.get('secondary','')}/{pal.get('accent','')}"]
    else:
        parts += [f"{ill.get('prompt_suffix','minimal')}",
                  f"brand palette {pal.get('primary','')}/{pal.get('secondary','')}/{pal.get('accent','')}"]
    return '; '.join([p for p in parts if p])

def colors_control(tokens):
    pal = tokens.get('palette', {})
    rgb = []
    for k in ('primary','secondary','accent'):
        if pal.get(k):
            rgb.append({'rgb': hex_to_rgb_triplet(pal[k])})
    return {'colors': rgb} if rgb else None

def postprocess_dirs(out_icons, out_patterns, out_ills, tokens):
    pal = tokens.get('palette', {})
    palette = [c for c in [pal.get('primary'), pal.get('secondary'), pal.get('accent')] if c]
    # SVG normalization
    for fn in os.listdir(out_icons):
        if fn.lower().endswith('.svg'):
            try:
                normalize_svg_palette_and_stroke(os.path.join(out_icons, fn),
                                                 target_palette=palette,
                                                 target_stroke_width=tokens.get('icon',{}).get('strokeWidth',2))
            except Exception as e:
                print('[warn] svg normalize:', fn, e)
    # Raster quantization
    for folder in (out_patterns, out_ills):
        for fn in os.listdir(folder):
            if fn.lower().endswith(('.png','.jpg','.jpeg','.webp')):
                try:
                    quantize_to_palette(os.path.join(folder, fn), palette_hex=palette,
                                        out_path=os.path.join(folder, fn))
                except Exception as e:
                    print('[warn] raster quantize:', fn, e)

def main():
    parser = argparse.ArgumentParser(description='BrandKit (Recraft-only, fixed)')
    parser.add_argument('--tokens', default='config/tokens.json')
    parser.add_argument('--out', default='out')
    parser.add_argument('--build-style', action='store_true', help='Создать style_id из ./references')
    parser.add_argument('--style-base', default='icon', choices=['icon','vector_illustration','digital_illustration','realistic_image'])
    parser.add_argument('--style-id', default=None, help='Если уже есть готовый style_id')
    parser.add_argument('--icons', type=int, default=8)
    parser.add_argument('--patterns', type=int, default=4)
    parser.add_argument('--illustrations', type=int, default=4)
    parser.add_argument('--model', default='recraftv3', choices=['recraftv3','recraftv2'])
    args = parser.parse_args()

    load_dotenv()
    client = RecraftClient()
    tokens = load_tokens(args.tokens)

    ensure_dir(args.out)
    out_icons = os.path.join(args.out, 'icons'); ensure_dir(out_icons)
    out_patterns = os.path.join(args.out, 'patterns'); ensure_dir(out_patterns)
    out_ills = os.path.join(args.out, 'illustrations'); ensure_dir(out_ills)

    style_id = args.style_id
    if args.build_style:
        refs = [os.path.join('references', f) for f in os.listdir('references') if f.lower().endswith(('.png','.jpg','.jpeg','.webp'))]
        refs = refs[:5]
        if not refs:
            print('[warn] Нет референсов в ./references — пропускаю создание стиля')
        else:
            style_id = client.create_style(style=args.style_base, files=refs)
            print('[ok] created style_id:', style_id)

    controls = colors_control(tokens)

    # ICONS — Recraft V3 НЕ поддерживает стиль `icon` (см. Appendix), поэтому принудительно используем V2
    icon_prompts = tokens.get('prompts',{}).get('icons', [])
    for subj in icon_prompts[:args.icons]:
        prompt = build_prompt(subj + ' icon', tokens, 'icon')
        icon_model = 'recraftv2'
        url = client.generate(prompt=prompt, model=icon_model,
                                    style_id=style_id if args.style_base=='icon' and style_id else None,
                                    style='icon' if not style_id else None,
                                    substyle=None,
                                    n=1, size='1024x1024', controls=controls)
        client.download_asset(url, os.path.join(out_icons, f"{slugify(subj)}"))

    # PATTERNS (digital_illustration), можно оставить v3
    pat_prompts = tokens.get('prompts',{}).get('patterns', [])
    substyle = tokens.get('texture',{}).get('substyle')
    for i, base in enumerate(pat_prompts[:args.patterns], 1):
        prompt = build_prompt(base, tokens, 'pattern')
        url = client.generate(prompt=prompt, model=args.model,
                                    style_id=style_id if args.style_base=='digital_illustration' and style_id else None,
                                    style='digital_illustration' if not style_id else None,
                                    substyle=substyle if not style_id else None,
                                    n=1, size='1024x1024', controls=controls)
        client.download_asset(url, os.path.join(out_patterns, f"pattern-{i:02d}"))

    # ILLUSTRATIONS
    ill_prompts = tokens.get('prompts',{}).get('illustrations', [])
    ill_vector = tokens.get('illustration',{}).get('vector', False)
    ill_style = 'vector_illustration' if ill_vector else 'digital_illustration'
    for i, base in enumerate(ill_prompts[:args.illustrations], 1):
        prompt = build_prompt(base, tokens, 'illustration')
        url = client.generate(prompt=prompt, model=args.model,
                                    style_id=style_id if args.style_base==ill_style and style_id else None,
                                    style=ill_style if not style_id else None,
                                    substyle=None,
                                    n=1, size='1024x1024', controls=controls)
        client.download_asset(url, os.path.join(out_ills, f"illustration-{i:02d}"))

    postprocess_dirs(out_icons, out_patterns, out_ills, tokens)
    print('[ok] Done. Assets saved to:', args.out)

if __name__ == '__main__':
    main()
