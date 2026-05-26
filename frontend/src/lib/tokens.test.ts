import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ASSET_COUNTS,
  DEFAULT_PALETTE,
  expandPromptFieldForCount,
  getActivePaletteKeys,
  getAssetCounts,
  getGenerationProviderSlugsFromTokens,
  getPaletteSlots,
  normalizeHexColor,
  referencesToAssetRefs,
  tokensToPromptFields,
} from './tokens'

describe('token helpers', () => {
  it('normalizes hex colors and rejects invalid values', () => {
    expect(normalizeHexColor('#abc')).toBe('#AABBCC')
    expect(normalizeHexColor('#00aeff')).toBe('#00AEFF')
    expect(normalizeHexColor('00aeff')).toBe('')
  })

  it('reads palette slots from explicit slots before legacy palette values', () => {
    const palette = getPaletteSlots({
      palette: { primary: '#111111', secondary: '#222222' },
      palette_slots: { primary: '#abcdef' },
    })

    expect(palette.primary).toBe('#ABCDEF')
    expect(palette.secondary).toBe('#222222')
    expect(palette.accent).toBe(DEFAULT_PALETTE.accent)
  })

  it('falls back to default active palette keys unless at least two valid keys are present', () => {
    expect(getActivePaletteKeys({ generation: { active_palette_keys: ['primary'] } })).toEqual([
      'primary',
      'secondary',
      'accent',
    ])
    expect(getActivePaletteKeys({ generation: { active_palette_keys: ['primary', 'extra', 'bad'] } })).toEqual([
      'primary',
      'extra',
    ])
  })

  it('converts prompt arrays into single form fields', () => {
    expect(tokensToPromptFields({ prompts: { logos: ['mark', 'mark'], icons: ['one', 'two'] } })).toMatchObject({
      logos: 'mark',
      icons: 'one\ntwo',
      patterns: '',
      illustrations: '',
    })
    expect(expandPromptFieldForCount('  brand mark  ', 3)).toEqual(['brand mark', 'brand mark', 'brand mark'])
  })

  it('clamps asset counts and preserves defaults for missing values', () => {
    expect(getAssetCounts({ generation: { logos_count: 0, icons_count: 99, patterns_count: '3' } })).toEqual({
      logos: 1,
      icons: 20,
      patterns: 3,
      illustrations: DEFAULT_ASSET_COUNTS.illustrations,
    })
  })

  it('keeps valid generation provider slugs in token order and removes duplicates', () => {
    expect(getGenerationProviderSlugsFromTokens({
      generation: { provider_slugs: ['seedream', 'unknown', 'recraft', 'seedream'] },
    })).toEqual(['seedream', 'recraft'])
  })

  it('maps references per asset type and supports legacy style images', () => {
    expect(referencesToAssetRefs({
      references: {
        logos: [{ path: 'uploads/logo.png', url: '/custom/logo.png' }],
        icons: ['uploads/icon.png'],
      },
    }, 'brand')).toMatchObject({
      logos: [{ name: 'logo.png', path: 'uploads/logo.png', url: '/custom/logo.png' }],
      icons: [{ name: 'icon.png', path: 'uploads/icon.png', url: '/projects/brand/refs/icon.png' }],
      patterns: [],
      illustrations: [],
    })

    expect(referencesToAssetRefs({
      references: { style_images: ['uploads/style.png'] },
    }, 'brand').patterns).toEqual([
      { name: 'style.png', path: 'uploads/style.png', url: '/projects/brand/refs/style.png' },
    ])
  })
})
