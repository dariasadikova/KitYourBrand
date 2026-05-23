import { type CSSProperties, useCallback, useEffect, useMemo, useState, type ImgHTMLAttributes } from 'react'
import { GENERATION_PROVIDERS, providerLabel } from '../../constants/generationProviders'
import type { ProjectResultsResponse } from '../../types/results'
import { MockupConstructor } from './MockupConstructor'
import {
  loadMockupSelection,
  mockupSelectionStorageKey,
  normalizeMockupSelection,
  saveMockupSelection,
  type MockupSelection,
} from './mockupAssets'
import { buildMockupCopy, type MockupCopy } from './mockupCopy'
import { TrimmedMockupLogo } from './TrimmedMockupLogo'

type MockupKind = 'landing' | 'business-card' | 'instagram'
type AssetKind = 'logos' | 'icons' | 'patterns' | 'illustrations'

export type BrandPreviewData = {
  name: string
  description: string
  copy: MockupCopy
  provider: string
  primary: string
  secondary: string
  accent: string
  tertiary: string
  neutral: string
  logo: string
  pattern: string
  illustration: string
  icon: string
}

const MOCKUPS: { key: MockupKind; label: string }[] = [
  { key: 'landing', label: 'Лендинг' },
  { key: 'business-card', label: 'Визитка' },
  { key: 'instagram', label: 'Instagram' },
]

const ASSET_KINDS: AssetKind[] = ['logos', 'icons', 'patterns', 'illustrations']

const DEFAULT_COLORS = {
  primary: '#5B7C99',
  secondary: '#E3E7ED',
  accent: '#1E2A33',
  tertiary: '#8FA3B8',
  neutral: '#111827',
}

function providerHasAssets(results: ProjectResultsResponse, provider: string): boolean {
  return ASSET_KINDS.some((kind) => results.assets[kind].some((asset) => asset.provider === provider))
}

function getSelectedGenerationProviders(results: ProjectResultsResponse): string[] {
  if (results.generation_provider_slugs?.length) {
    return results.generation_provider_slugs
  }
  const fromAssets = new Set<string>()
  for (const kind of ASSET_KINDS) {
    for (const asset of results.assets[kind]) {
      if (asset.provider) fromAssets.add(asset.provider)
    }
  }
  return GENERATION_PROVIDERS.map((item) => item.slug).filter((slug) => fromAssets.has(slug))
}

function buildBrandPreviewData(
  results: ProjectResultsResponse,
  provider: string,
  copy: MockupCopy,
  selection: MockupSelection,
): BrandPreviewData {
  const byKey = Object.fromEntries(results.palette_items.map((item) => [item.key, item.value]))
  const pick = (key: keyof typeof DEFAULT_COLORS) => byKey[key] || DEFAULT_COLORS[key]
  const description = (results.project.brand_description || '').trim()

  return {
    name: results.project.name,
    description,
    copy,
    provider,
    primary: pick('primary'),
    secondary: pick('secondary'),
    accent: pick('accent'),
    tertiary: pick('tertiary'),
    neutral: pick('neutral'),
    logo: selection.logo,
    pattern: selection.pattern,
    illustration: selection.illustration,
    icon: selection.icon,
  }
}

function brandStyle(brand: BrandPreviewData): CSSProperties {
  return {
    '--brand-primary': brand.primary,
    '--brand-secondary': brand.secondary,
    '--brand-accent': brand.accent,
    '--brand-tertiary': brand.tertiary,
    '--brand-neutral': brand.neutral,
  } as CSSProperties
}

function MockupIcon({
  src,
  className,
  ...props
}: {
  src: string
  className?: string
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'className'>) {
  return (
    <img
      src={src}
      alt=""
      className={className ? `brand-mockup-icon ${className}` : 'brand-mockup-icon'}
      {...props}
    />
  )
}

function LandingBrandMark({ brand }: { brand: BrandPreviewData }) {
  const src = brand.logo || brand.icon
  const iconOnly = !brand.logo && Boolean(brand.icon)
  if (src) {
    return (
      <TrimmedMockupLogo
        src={src}
        className={`brand-mockup-landing__logo${iconOnly ? ' brand-mockup-landing__logo--icon-only' : ''}`}
        wrapClassName="brand-mockup-landing__logo-wrap"
      />
    )
  }
  return <strong className="brand-mockup-landing__logo">{brand.name}</strong>
}

function InstagramAvatar({ brand }: { brand: BrandPreviewData }) {
  if (brand.logo) {
    return <img src={brand.logo} alt="" className="brand-mockup-instagram__avatar brand-mockup-instagram__avatar--logo" />
  }
  if (brand.icon) {
    return (
      <span className="brand-mockup-instagram__avatar-ring">
        <MockupIcon src={brand.icon} />
      </span>
    )
  }
  return <strong className="brand-mockup-instagram__avatar">{brand.name}</strong>
}

function BusinessCardBrandMark({ brand }: { brand: BrandPreviewData }) {
  if (brand.logo) {
    return <img src={brand.logo} alt="" className="brand-mockup-card__logo" />
  }
  if (brand.icon) {
    return <MockupIcon src={brand.icon} className="brand-mockup-card__icon-mark" />
  }
  return <strong className="brand-mockup-card__logo">{brand.name}</strong>
}

function LandingMockup({ brand }: { brand: BrandPreviewData }) {
  const showNavIcon = Boolean(brand.icon && brand.logo && brand.icon !== brand.logo)

  return (
    <div className="brand-mockup brand-mockup--landing" style={brandStyle(brand)}>
      <LandingBrandMark brand={brand} />
      <nav className="brand-mockup-landing__nav" aria-label="Навигация">
        {showNavIcon ? <MockupIcon src={brand.icon} className="brand-mockup-landing__nav-icon" aria-hidden="true" /> : null}
        <span>Product</span>
        <span>Pricing</span>
        <span>Contact</span>
      </nav>
      <div className="brand-mockup-landing__copy">
        <p className="brand-mockup-eyebrow">{brand.name}</p>
        <h3>{brand.copy.landingHeadline}</h3>
        <button type="button">{brand.copy.landingButton}</button>
      </div>
      <div
        className="brand-mockup-landing__visual"
        style={brand.pattern ? { backgroundImage: `url(${brand.pattern})`, backgroundSize: 'cover' } : undefined}
      >
        {brand.illustration ? <img src={brand.illustration} alt="" /> : null}
      </div>
    </div>
  )
}

function BusinessCardMockup({ brand }: { brand: BrandPreviewData }) {
  return (
    <div className="brand-mockup brand-mockup--business-card" style={brandStyle(brand)}>
      <div
        className="brand-mockup-card__sheet"
        style={brand.pattern ? { backgroundImage: `linear-gradient(rgba(255,255,255,0.92), rgba(255,255,255,0.92)), url(${brand.pattern})`, backgroundSize: 'cover' } : undefined}
      >
        <div className="brand-mockup-card__accent" aria-hidden="true" />
        <BusinessCardBrandMark brand={brand} />
        <p className="brand-mockup-card__name">{brand.name}</p>
        <p className="brand-mockup-card__role">{brand.copy.businessRole}</p>
        <div className="brand-mockup-card__contacts">
          <span>hello@{brand.name.toLowerCase().replace(/\s+/g, '')}.com</span>
          <span>+7 (900) 000-00-00</span>
        </div>
      </div>
    </div>
  )
}

function InstagramMockup({ brand }: { brand: BrandPreviewData }) {
  return (
    <div className="brand-mockup brand-mockup--instagram" style={brandStyle(brand)}>
      <div className="brand-mockup-instagram__phone">
        <div className="brand-mockup-instagram__top">
          <InstagramAvatar brand={brand} />
          <span>{brand.name.toLowerCase().replace(/\s+/g, '_')}</span>
        </div>
        <div
          className="brand-mockup-instagram__media"
          style={brand.pattern ? { backgroundImage: `url(${brand.pattern})`, backgroundSize: 'cover' } : undefined}
        >
          {brand.illustration ? <img src={brand.illustration} alt="" /> : brand.icon ? <MockupIcon src={brand.icon} /> : null}
        </div>
        <div className="brand-mockup-instagram__actions" aria-hidden="true">
          <span>♡</span>
          <span>◎</span>
          <span>↗</span>
        </div>
        <p className="brand-mockup-instagram__caption">
          <strong>{brand.name.toLowerCase().replace(/\s+/g, '_')}</strong> {brand.copy.instagramCaption}
        </p>
      </div>
    </div>
  )
}

export function BrandMockupsPreview({ results }: { results: ProjectResultsResponse }) {
  const [activeMockup, setActiveMockup] = useState<MockupKind>('landing')
  const mockupCopy = useMemo(
    () => buildMockupCopy(results.project.name, results.project.brand_description || ''),
    [results.project.name, results.project.brand_description],
  )
  const mockupProviders = useMemo(
    () => getSelectedGenerationProviders(results).filter((slug) => providerHasAssets(results, slug)),
    [results],
  )
  const [activeProvider, setActiveProvider] = useState('')
  const [assetSelection, setAssetSelection] = useState<MockupSelection>({
    logo: '',
    pattern: '',
    illustration: '',
    icon: '',
  })

  const selectionStorageKey = useMemo(() => {
    if (!activeProvider) return ''
    return mockupSelectionStorageKey(
      results.project.slug,
      activeProvider,
      results.selected_generation_job_id,
    )
  }, [activeProvider, results.project.slug, results.selected_generation_job_id])

  useEffect(() => {
    if (!mockupProviders.length) {
      setActiveProvider('')
      return
    }
    if (!mockupProviders.includes(activeProvider)) {
      setActiveProvider(mockupProviders[0])
    }
  }, [mockupProviders, activeProvider])

  useEffect(() => {
    if (!activeProvider) return
    const stored = selectionStorageKey ? loadMockupSelection(selectionStorageKey) : null
    setAssetSelection(normalizeMockupSelection(results, activeProvider, stored))
  }, [activeProvider, results, selectionStorageKey])

  const handleAssetSelectionChange = useCallback(
    (slot: keyof MockupSelection, url: string) => {
      setAssetSelection((current) => {
        const next = { ...current, [slot]: url }
        if (selectionStorageKey) saveMockupSelection(selectionStorageKey, next)
        return next
      })
    },
    [selectionStorageKey],
  )

  const brand = useMemo(
    () => (activeProvider ? buildBrandPreviewData(results, activeProvider, mockupCopy, assetSelection) : null),
    [results, activeProvider, mockupCopy, assetSelection],
  )

  if (!mockupProviders.length || !brand) {
    return (
      <section className="results-card results-card--mockups">
        <div className="results-card__head results-card__head--stacked">
          <div className="results-card__title">
            <h2>Превью бренда</h2>
          </div>
          <p className="brand-mockups-lead">Превью появится после генерации ассетов выбранными провайдерами.</p>
        </div>
        <div className="results-empty">Нет ассетов от провайдеров, выбранных при генерации.</div>
      </section>
    )
  }

  return (
    <section className="results-card results-card--mockups">
      <div className="results-card__head results-card__head--stacked">
        <div className="results-card__title">
          <h2>Превью бренда</h2>
        </div>
        <p className="brand-mockups-lead">
          {results.project.brand_description?.trim()
            ? 'Превью собрано из описания бренда, палитры и ассетов выбранного провайдера. Несколько вариантов — в конструкторе ниже.'
            : 'Посмотрите, как бренд-комплект выглядит в реальных сценариях. Если сгенерировано несколько вариантов — соберите превью в конструкторе.'}
        </p>
      </div>

      <div className="brand-mockups-provider-tabs" role="tablist" aria-label="Провайдер для превью">
        {mockupProviders.map((slug) => (
          <button
            key={slug}
            type="button"
            role="tab"
            aria-selected={activeProvider === slug}
            className={`brand-mockups-provider-tab${activeProvider === slug ? ' brand-mockups-provider-tab--active' : ''}`}
            onClick={() => setActiveProvider(slug)}
          >
            {providerLabel(slug)}
          </button>
        ))}
      </div>

      <div className="brand-mockups-tabs" role="tablist" aria-label="Тип превью бренда">
        {MOCKUPS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={activeMockup === item.key}
            className={`brand-mockups-tab${activeMockup === item.key ? ' brand-mockups-tab--active' : ''}`}
            onClick={() => setActiveMockup(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <MockupConstructor
        results={results}
        provider={activeProvider}
        selection={assetSelection}
        onChange={handleAssetSelectionChange}
      />

      <div className="brand-mockups-stage" role="tabpanel">
        {activeMockup === 'landing' ? <LandingMockup brand={brand} /> : null}
        {activeMockup === 'business-card' ? <BusinessCardMockup brand={brand} /> : null}
        {activeMockup === 'instagram' ? <InstagramMockup brand={brand} /> : null}
      </div>
    </section>
  )
}
