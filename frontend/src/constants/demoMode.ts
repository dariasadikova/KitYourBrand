export const DEMO_ASSET_COUNTS = {
  logos: 1,
  icons: 2,
  patterns: 1,
  illustrations: 0,
} as const

export const DEMO_PALETTE_KEYS = ['primary', 'secondary', 'accent'] as const
export const DEMO_PROVIDER_LABEL = 'KYBBY Demo'
export const DEMO_MAX_REFERENCES = 1

export type DemoLimits = {
  asset_counts: Record<string, number>
  palette_keys: string[]
  max_references: number
  provider_label: string
  illustrations_locked: boolean
}
