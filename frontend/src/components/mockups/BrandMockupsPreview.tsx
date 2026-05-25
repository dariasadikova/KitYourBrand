import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState, type ImgHTMLAttributes } from 'react'
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

type MockupKind = 'landing' | 'business-card' | 'vk'
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
  { key: 'vk', label: 'ВКонтакте' },
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

function VkAvatar({ brand }: { brand: BrandPreviewData }) {
  if (brand.logo) {
    return <img src={brand.logo} alt="" className="brand-mockup-vk__avatar brand-mockup-vk__avatar--logo" />
  }
  if (brand.icon) {
    return (
      <span className="brand-mockup-vk__avatar brand-mockup-vk__avatar--icon">
        <MockupIcon src={brand.icon} />
      </span>
    )
  }
  return <strong className="brand-mockup-vk__avatar brand-mockup-vk__avatar--initial">{brand.name.charAt(0)}</strong>
}

function VkActionIcon({ children }: { children: ReactNode }) {
  return <span className="brand-mockup-vk__action-icon" aria-hidden="true">{children}</span>
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

function VkMockup({ brand }: { brand: BrandPreviewData }) {
  return (
    <div className="brand-mockup brand-mockup--vk" style={brandStyle(brand)}>
      <article className="brand-mockup-vk__post">
        <header className="brand-mockup-vk__header">
          <VkAvatar brand={brand} />
          <div className="brand-mockup-vk__meta">
            <strong className="brand-mockup-vk__name">{brand.name}</strong>
            <span className="brand-mockup-vk__time">сейчас</span>
          </div>
        </header>
        <div
          className="brand-mockup-vk__media"
          style={
            brand.illustration && brand.pattern
              ? { backgroundImage: `url(${brand.pattern})`, backgroundSize: 'cover' }
              : undefined
          }
        >
          {brand.illustration ? (
            <img src={brand.illustration} alt="" />
          ) : brand.pattern ? (
            <img src={brand.pattern} alt="" />
          ) : brand.icon ? (
            <MockupIcon src={brand.icon} />
          ) : null}
        </div>
        <p className="brand-mockup-vk__text">{brand.copy.vkCaption}</p>
        <footer className="brand-mockup-vk__actions" aria-hidden="true">
          <span className="brand-mockup-vk__action">
            <VkActionIcon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
              </svg>
            </VkActionIcon>
            Нравится
          </span>
          <span className="brand-mockup-vk__action">
            <VkActionIcon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4H8.4L3 21V11.5A8.4 8.4 0 0 1 11.4 3h.7A8.4 8.4 0 0 1 21 11.5z" />
              </svg>
            </VkActionIcon>
            Комментировать
          </span>
          <span className="brand-mockup-vk__action">
            <VkActionIcon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 21L18 6" />
                <path d="M13.5 6H18V10.5" />
              </svg>
            </VkActionIcon>
            Поделиться
          </span>
        </footer>
      </article>
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

      <div
        className="asset-tabs brand-mockups-provider-tabs"
        role="tablist"
        aria-label="Провайдер для превью"
        style={{ gridTemplateColumns: `repeat(${mockupProviders.length}, minmax(0, 1fr))` }}
      >
        {mockupProviders.map((slug) => (
          <button
            key={slug}
            type="button"
            role="tab"
            aria-selected={activeProvider === slug}
            className={`asset-tab${activeProvider === slug ? ' asset-tab--active' : ''}`}
            onClick={() => setActiveProvider(slug)}
          >
            {providerLabel(slug)}
          </button>
        ))}
      </div>

      <div className="illustration-format-row brand-mockups-format-row" role="radiogroup" aria-label="Тип превью бренда">
        {MOCKUPS.map((item) => (
          <label key={item.key} className="illustration-format-check">
            <input
              type="radio"
              name={`mockup-kind-${results.project.slug}`}
              value={item.key}
              checked={activeMockup === item.key}
              onChange={() => setActiveMockup(item.key)}
            />
            <span>{item.label}</span>
          </label>
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
        {activeMockup === 'vk' ? <VkMockup brand={brand} /> : null}
      </div>
    </section>
  )
}
