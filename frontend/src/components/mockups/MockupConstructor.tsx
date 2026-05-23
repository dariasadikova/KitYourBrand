import type { ProjectResultsResponse, ResultAsset } from '../../types/results'
import { assetsForProvider, MOCKUP_SLOTS, type AssetKind } from './mockupAssets'

type MockupConstructorProps = {
  results: ProjectResultsResponse
  provider: string
  selection: Record<'logo' | 'pattern' | 'illustration' | 'icon', string>
  onChange: (slot: 'logo' | 'pattern' | 'illustration' | 'icon', url: string) => void
}

function slotAssets(results: ProjectResultsResponse, provider: string, kind: AssetKind): ResultAsset[] {
  return assetsForProvider(results.assets[kind], provider)
}

export function MockupConstructor({ results, provider, selection, onChange }: MockupConstructorProps) {
  const hasAnyChoice = MOCKUP_SLOTS.some((slot) => slotAssets(results, provider, slot.kind).length > 1)

  if (!hasAnyChoice) {
    return null
  }

  return (
    <div className="brand-mockups-constructor" aria-label="Конструктор превью">
      <p className="brand-mockups-constructor__lead">
        Соберите превью: выберите, какие варианты ассетов показать в каждом слоте.
      </p>
      <div className="brand-mockups-constructor__grid">
        {MOCKUP_SLOTS.map((slot) => {
          const options = slotAssets(results, provider, slot.kind)
          if (!options.length) {
            return (
              <div className="brand-mockups-constructor__row" key={slot.key}>
                <span className="brand-mockups-constructor__label">{slot.label}</span>
                <span className="brand-mockups-constructor__empty">Нет ассетов</span>
              </div>
            )
          }

          return (
            <div className="brand-mockups-constructor__row" key={slot.key}>
              <span className="brand-mockups-constructor__label">{slot.label}</span>
              <div className="brand-mockups-constructor__options" role="listbox" aria-label={slot.label}>
                {options.map((asset) => {
                  const active = selection[slot.key] === asset.url
                  return (
                    <button
                      key={asset.url}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`brand-mockups-constructor__option${active ? ' brand-mockups-constructor__option--active' : ''}`}
                      title={asset.name}
                      onClick={() => onChange(slot.key, asset.url)}
                    >
                      <img src={asset.url} alt="" />
                      <span>{asset.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
