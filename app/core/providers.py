from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.paths import FLUX_DIR, OUT_DIR, PROVIDERS_DIR, RECRAFT_DIR, SEEDREAM_DIR


@dataclass(frozen=True)
class ProviderConfig:
    slug: str
    label: str
    kind: str
    provider_dir: Path
    out_root: Path
    main_path: Path | None = None
    enabled: bool = True
    standard_cli: bool = True
    supports_references: bool = False
    supports_style_build: bool = False


PROVIDERS: dict[str, ProviderConfig] = {
    'recraft': ProviderConfig(
        slug='recraft',
        label='Recraft',
        kind='recraft',
        provider_dir=RECRAFT_DIR,
        out_root=OUT_DIR / 'recraft',
        main_path=RECRAFT_DIR / 'src' / 'main.py',
        standard_cli=False,
        supports_references=True,
        supports_style_build=True,
    ),
    'seedream': ProviderConfig(
        slug='seedream',
        label='Seedream',
        kind='openrouter',
        provider_dir=SEEDREAM_DIR,
        out_root=OUT_DIR / 'seedream',
        main_path=SEEDREAM_DIR / 'src' / 'main.py',
        standard_cli=True,
    ),
    'flux': ProviderConfig(
        slug='flux',
        label='Flux',
        kind='openrouter',
        provider_dir=FLUX_DIR,
        out_root=OUT_DIR / 'flux',
        main_path=FLUX_DIR / 'src' / 'main.py',
        standard_cli=True,
    ),
    'nano_banana': ProviderConfig(
        slug='nano_banana',
        label='Nano Banana',
        kind='openrouter',
        provider_dir=PROVIDERS_DIR / 'brandkit_nano_banana',
        out_root=OUT_DIR / 'nano_banana',
        main_path=PROVIDERS_DIR / 'brandkit_nano_banana' / 'src' / 'main.py',
        standard_cli=True,
    ),
    'gpt5_image': ProviderConfig(
        slug='gpt5_image',
        label='GPT-5 Image Mini',
        kind='openrouter',
        provider_dir=PROVIDERS_DIR / 'brandkit_gpt5_image',
        out_root=OUT_DIR / 'gpt5_image',
        main_path=PROVIDERS_DIR / 'brandkit_gpt5_image' / 'src' / 'main.py',
        standard_cli=True,
    ),
    'alice_ai_art': ProviderConfig(
        slug='alice_ai_art',
        label='Alice AI ART',
        kind='yandex_image',
        provider_dir=PROVIDERS_DIR / 'brandkit_alice_ai_art',
        out_root=OUT_DIR / 'alice_ai_art',
        main_path=PROVIDERS_DIR / 'brandkit_alice_ai_art' / 'src' / 'main.py',
        standard_cli=True,
    ),
}


ASSET_PROVIDER_SLUGS: tuple[str, ...] = tuple(PROVIDERS.keys())


def parse_generation_provider_slugs(payload: dict[str, Any]) -> frozenset[str]:
    """Читает payload[\"provider_slugs\"]. Нет ключа — все провайдеры; пустой список — ошибка."""
    raw = payload.get('provider_slugs')
    if raw is None:
        return frozenset(ASSET_PROVIDER_SLUGS)
    if not isinstance(raw, list):
        return frozenset(ASSET_PROVIDER_SLUGS)
    allowed_set = set(ASSET_PROVIDER_SLUGS)
    seen: list[str] = []
    for item in raw:
        s = str(item).strip()
        if s in allowed_set and s not in seen:
            seen.append(s)
    if not seen:
        raise ValueError('Выберите хотя бы одного провайдера для генерации.')
    return frozenset(seen)


def get_provider(slug: str) -> ProviderConfig:
    return PROVIDERS[slug]


def iter_asset_providers() -> tuple[ProviderConfig, ...]:
    return tuple(provider for provider in PROVIDERS.values() if provider.enabled)


def iter_standard_cli_providers() -> tuple[ProviderConfig, ...]:
    return tuple(provider for provider in iter_asset_providers() if provider.standard_cli)
