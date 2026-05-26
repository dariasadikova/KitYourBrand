import { describe, expect, it } from 'vitest'

import { buildMockupCopy } from './mockupCopy'

describe('mockup copy helpers', () => {
  it('uses default marketing copy when description is empty', () => {
    expect(buildMockupCopy('NOVA', '')).toEqual({
      landingHeadline: 'Визуальный стиль, который запоминается',
      landingButton: 'Начать',
      businessRole: 'Представитель бренда',
      vkCaption: 'Новый визуальный язык бренда NOVA — палитра, паттерн и графика в одном комплекте.',
    })
  })

  it('uses the first sentence as landing headline and normalizes whitespace', () => {
    expect(buildMockupCopy('NOVA', '  Умный дом для спокойной жизни.  Второе предложение.  ')).toEqual({
      landingHeadline: 'Умный дом для спокойной жизни',
      landingButton: 'Подробнее',
      businessRole: 'Умный дом для спокойной жизни',
      vkCaption: 'Умный дом для спокойной жизни. Второе предложение.',
    })
  })

  it('truncates long generated copy on word boundaries', () => {
    const copy = buildMockupCopy(
      'NOVA',
      'Очень длинное описание бренда с большим количеством слов, которое должно аккуратно обрезаться для использования в мокапах лендинга и социальной сети.',
    )

    expect(copy.landingHeadline.endsWith('…')).toBe(true)
    expect(copy.landingHeadline.length).toBeLessThanOrEqual(96)
    expect(copy.businessRole.length).toBeLessThanOrEqual(72)
    expect(copy.vkCaption).not.toContain('  ')
  })
})
