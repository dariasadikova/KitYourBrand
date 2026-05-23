export const GENERATION_PROVIDERS = [
  { slug: 'recraft', label: 'Recraft' },
  { slug: 'seedream', label: 'Seedream' },
  { slug: 'flux', label: 'Flux' },
  { slug: 'nano_banana', label: 'Nano Banana' },
  { slug: 'gpt5_image', label: 'GPT-5 Image' },
] as const

export function providerLabel(slug: string): string {
  return GENERATION_PROVIDERS.find((item) => item.slug === slug)?.label
    || slug.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}
