export type MockupCopy = {
  landingHeadline: string
  landingButton: string
  businessRole: string
  vkCaption: string
}

function truncate(text: string, maxLength: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) return trimmed
  const breakAt = trimmed.lastIndexOf(' ', maxLength - 1)
  const index = breakAt > maxLength * 0.5 ? breakAt : maxLength - 1
  return `${trimmed.slice(0, index).trim()}…`
}

export function buildMockupCopy(name: string, description: string): MockupCopy {
  const desc = description.trim().replace(/\s+/g, ' ')
  if (!desc) {
    return {
      landingHeadline: 'Визуальный стиль, который запоминается',
      landingButton: 'Начать',
      businessRole: 'Представитель бренда',
      vkCaption: `Новый визуальный язык бренда ${name} — палитра, паттерн и графика в одном комплекте.`,
    }
  }

  const firstSentence = desc.split(/(?<=[.!?])\s+/)[0]?.replace(/[.!?]+$/, '') || desc
  const headline = truncate(firstSentence, 96)

  return {
    landingHeadline: headline,
    landingButton: 'Подробнее',
    businessRole: truncate(headline, 72),
    vkCaption: truncate(desc, 220),
  }
}
