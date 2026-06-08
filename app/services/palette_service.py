from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from material_color_utilities import Variant, theme_from_color

PALETTE_KEYS = ("primary", "secondary", "accent", "tertiary", "neutral", "extra")
HEX_RE = re.compile(r"^#?(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$")
PaletteVariantName = Literal["soft", "balanced", "contrast"]


@dataclass(frozen=True)
class MaterialPalettePreset:
    """Mapping between KYBBY palette presets and Material Color Utilities variants."""

    material_variant: Variant
    contrast_level: float


MATERIAL_PRESETS: dict[PaletteVariantName, MaterialPalettePreset] = {
    # Спокойная системная схема Material: меньше визуального шума, хорошо подходит как мягкий брендовый вариант.
    "soft": MaterialPalettePreset(material_variant=Variant.TONALSPOT, contrast_level=-0.25),
    # Более выразительный, но всё ещё универсальный вариант для основной палитры бренда.
    "balanced": MaterialPalettePreset(material_variant=Variant.VIBRANT, contrast_level=0.0),
    # Самый активный вариант: Material смещает вспомогательные семейства сильнее и даёт более контрастную палитру.
    "contrast": MaterialPalettePreset(material_variant=Variant.EXPRESSIVE, contrast_level=0.25),
}


class PaletteService:
    def normalize_hex(self, color: str) -> str:
        value = str(color or "").strip()
        if not HEX_RE.match(value):
            raise ValueError("Передан некорректный цвет. Используйте формат #RRGGBB.")
        value = value.lstrip("#")
        if len(value) == 3:
            value = "".join(ch * 2 for ch in value)
        return f"#{value.upper()}"

    def suggest_variants(self, seed_color: str) -> dict[str, dict[str, str]]:
        seed = self.normalize_hex(seed_color)
        return {name: self._build_material_variant(seed, preset) for name, preset in MATERIAL_PRESETS.items()}

    def _build_material_variant(self, seed_hex: str, preset: MaterialPalettePreset) -> dict[str, str]:
        theme = theme_from_color(
            seed_hex,
            contrast_level=preset.contrast_level,
            variant=preset.material_variant,
        )
        light = theme.schemes.light

        # KYBBY оставляет выбранный пользователем цвет как Primary, чтобы автоподбор
        # не менял главный брендовый цвет. Остальные роли берутся из готовой
        # light-схемы Material Color Utilities.
        return {
            "primary": seed_hex,
            "secondary": self._normalize_material_hex(light.secondary),
            "accent": self._normalize_material_hex(light.tertiary),
            "tertiary": self._pick_tertiary(light, preset),
            "neutral": self._pick_neutral(light, preset),
            "extra": self._pick_extra(light, preset),
        }

    def _pick_tertiary(self, light, preset: MaterialPalettePreset) -> str:
        if preset.material_variant == Variant.TONALSPOT:
            return self._normalize_material_hex(light.tertiary_container)
        if preset.material_variant == Variant.EXPRESSIVE:
            return self._normalize_material_hex(light.primary)
        return self._normalize_material_hex(light.primary_container)

    def _pick_neutral(self, light, preset: MaterialPalettePreset) -> str:
        if preset.material_variant == Variant.EXPRESSIVE:
            return self._normalize_material_hex(light.surface_container)
        if preset.material_variant == Variant.TONALSPOT:
            return self._normalize_material_hex(light.surface_container_high)
        return self._normalize_material_hex(light.surface_variant)

    def _pick_extra(self, light, preset: MaterialPalettePreset) -> str:
        if preset.material_variant == Variant.EXPRESSIVE:
            return self._normalize_material_hex(light.on_surface)
        if preset.material_variant == Variant.TONALSPOT:
            return self._normalize_material_hex(light.on_surface_variant)
        return self._normalize_material_hex(light.inverse_surface)

    def _normalize_material_hex(self, color: str) -> str:
        # material-color-utilities возвращает hex в нижнем регистре; в KYBBY цвета
        # в форме и tokens.json обычно отображаются как #RRGGBB.
        return self.normalize_hex(color)
