import { describe, expect, it } from 'vitest'

import { horizontalTrimOffset, trimShiftStyle, type OpaqueBounds } from './trimImageBounds'

function imageWithWidth(offsetWidth: number, naturalWidth: number): HTMLImageElement {
  const img = document.createElement('img')
  Object.defineProperty(img, 'offsetWidth', { configurable: true, value: offsetWidth })
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: naturalWidth })
  return img
}

describe('trim image bounds helpers', () => {
  it('returns no horizontal offset when opaque content already starts at the left edge', () => {
    const bounds: OpaqueBounds = { left: 0, top: 4, naturalWidth: 100, naturalHeight: 80 }

    expect(horizontalTrimOffset(imageWithWidth(50, 100), bounds)).toBe(0)
  })

  it('scales horizontal trim offset to rendered image width', () => {
    const bounds: OpaqueBounds = { left: 20, top: 4, naturalWidth: 100, naturalHeight: 80 }

    expect(horizontalTrimOffset(imageWithWidth(50, 100), bounds)).toBe(-10)
  })

  it('returns style only when a shift is needed', () => {
    expect(trimShiftStyle(0)).toBeUndefined()
    expect(trimShiftStyle(-10)).toEqual({ marginLeft: '-10px' })
  })
})
