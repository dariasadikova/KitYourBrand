import { describe, expect, it } from 'vitest'

import type { ProjectResultsResponse, ResultAsset } from '../../types/results'
import {
  assetsForProvider,
  availableUrlsForSlot,
  defaultMockupSelection,
  loadMockupSelection,
  mockupSelectionStorageKey,
  normalizeMockupSelection,
  saveMockupSelection,
} from './mockupAssets'

function asset(provider: string, kind: string, name: string): ResultAsset {
  return {
    provider,
    name,
    filename: `${name}.png`,
    url: `/${provider}/${kind}/${name}.png`,
  }
}

function results(): ProjectResultsResponse {
  return {
    ok: true,
    project: { slug: 'demo-brand', name: 'Demo Brand', brand_id: 'demo-brand' },
    palette_items: [],
    assets: {
      logos: [asset('recraft', 'logos', 'logo-a'), asset('seedream', 'logos', 'logo-b')],
      icons: [asset('recraft', 'icons', 'icon-a')],
      patterns: [asset('recraft', 'patterns', 'pattern-a'), asset('recraft', 'patterns', 'pattern-b')],
      illustrations: [asset('recraft', 'illustrations', 'illustration-a')],
    },
    active_generation_job_id: '',
    selected_generation_job_id: '',
  }
}

describe('mockup asset helpers', () => {
  it('filters assets by provider', () => {
    expect(assetsForProvider(results().assets.logos, 'recraft')).toEqual([
      asset('recraft', 'logos', 'logo-a'),
    ])
  })

  it('builds default mockup selections from the first asset per slot', () => {
    expect(defaultMockupSelection(results(), 'recraft')).toEqual({
      logo: '/recraft/logos/logo-a.png',
      pattern: '/recraft/patterns/pattern-a.png',
      illustration: '/recraft/illustrations/illustration-a.png',
      icon: '/recraft/icons/icon-a.png',
    })
  })

  it('returns allowed urls for a mockup slot', () => {
    expect(availableUrlsForSlot(results(), 'recraft', 'pattern')).toEqual([
      '/recraft/patterns/pattern-a.png',
      '/recraft/patterns/pattern-b.png',
    ])
  })

  it('normalizes saved selections by keeping only currently available assets', () => {
    expect(normalizeMockupSelection(results(), 'recraft', {
      logo: '/seedream/logos/logo-b.png',
      pattern: '/recraft/patterns/pattern-b.png',
    })).toEqual({
      logo: '/recraft/logos/logo-a.png',
      pattern: '/recraft/patterns/pattern-b.png',
      illustration: '/recraft/illustrations/illustration-a.png',
      icon: '/recraft/icons/icon-a.png',
    })
  })

  it('builds stable storage keys and reads/writes selections from localStorage', () => {
    const key = mockupSelectionStorageKey('demo-brand', 'recraft', 'job-1')
    expect(key).toBe('kybby-mockup-selection:demo-brand:job-1:recraft')

    saveMockupSelection(key, {
      logo: '/logo.png',
      pattern: '/pattern.png',
      illustration: '/illustration.png',
      icon: '/icon.png',
    })

    expect(loadMockupSelection(key)).toEqual({
      logo: '/logo.png',
      pattern: '/pattern.png',
      illustration: '/illustration.png',
      icon: '/icon.png',
    })
  })

  it('returns null for missing or invalid localStorage values', () => {
    expect(loadMockupSelection('missing')).toBeNull()
    localStorage.setItem('invalid', 'not-json')
    expect(loadMockupSelection('invalid')).toBeNull()
  })
})
