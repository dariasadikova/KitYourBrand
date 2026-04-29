/** Краткий вид проекта в списке */
export interface Project {
  id: number
  slug: string
  name: string
  brand_id: string
  created_at: string
  deleted: boolean
}

/** Детальный вид проекта с токенами */
export interface ProjectDetail extends Project {
  tokens: TokensJson
  refs: RefItem[]
}

/** Референс-изображение */
export interface RefItem {
  filename: string
  url: string
}

/** Структура tokens.json — основной конфиг проекта */
export interface TokensJson {
  name?: string
  brand_id?: string
  style_id?: string
  palette?: Record<string, string>
  palette_slots?: Record<string, string>
  generation?: GenerationConfig
  icon?: IconConfig
  illustration?: IllustrationConfig
  [key: string]: unknown
}

export interface GenerationConfig {
  logos_count?: number
  icons_count?: number
  patterns_count?: number
  illustrations_count?: number
  logos_themes?: string[]
  icons_themes?: string[]
  patterns_themes?: string[]
  illustrations_themes?: string[]
  active_palette_keys?: string[]
  build_style?: boolean
}

export interface IconConfig {
  strokeWidth?: number
  corner?: 'rounded' | 'square' | 'butt'
  fill?: 'outline' | 'filled' | 'duotone'
}

export interface IllustrationConfig {
  vector?: boolean
  raster?: boolean
}

/** Payload для PUT /api/projects/{slug}/tokens */
export type TokensSavePayload = TokensJson
