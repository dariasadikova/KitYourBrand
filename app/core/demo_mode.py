from __future__ import annotations

GUEST_USER_ID = 0
DEMO_PROVIDER_SLUG = 'recraft'
DEMO_PROVIDER_LABEL = 'KYBBY Demo'

DEMO_ASSET_COUNTS = {
    'logos_count': 1,
    'icons_count': 2,
    'patterns_count': 1,
    'illustrations_count': 0,
}

DEMO_PALETTE_KEYS = frozenset({'primary', 'secondary', 'accent'})
DEMO_MAX_REFERENCES = 1
DEMO_MAX_REFERENCE_BYTES = 2 * 1024 * 1024

DEMO_LIMITS_PAYLOAD = {
    'asset_counts': DEMO_ASSET_COUNTS,
    'palette_keys': sorted(DEMO_PALETTE_KEYS),
    'max_references': DEMO_MAX_REFERENCES,
    'max_reference_bytes': DEMO_MAX_REFERENCE_BYTES,
    'provider_slug': DEMO_PROVIDER_SLUG,
    'provider_label': DEMO_PROVIDER_LABEL,
    'illustrations_locked': True,
    'provider_selection_locked': True,
    'palette_assistant_locked': True,
    'extended_palette_locked': True,
    'generation_runs': 1,
    'downloads_locked': True,
    'figma_export_locked': True,
    'save_project_locked': True,
    'generation_history_locked': True,
    'regenerate_locked': True,
}
