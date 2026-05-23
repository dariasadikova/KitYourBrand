import type { CSSProperties } from 'react'

export type OpaqueBounds = {
  left: number
  top: number
  naturalWidth: number
  naturalHeight: number
}

export function measureOpaqueBounds(img: HTMLImageElement, alphaThreshold = 12): OpaqueBounds | null {
  const { naturalWidth, naturalHeight } = img
  if (!naturalWidth || !naturalHeight) return null

  const canvas = document.createElement('canvas')
  canvas.width = naturalWidth
  canvas.height = naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  let data: Uint8ClampedArray
  try {
    ctx.drawImage(img, 0, 0)
    data = ctx.getImageData(0, 0, naturalWidth, naturalHeight).data
  } catch {
    return null
  }

  let minX = naturalWidth
  let minY = naturalHeight
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < naturalHeight; y += 1) {
    for (let x = 0; x < naturalWidth; x += 1) {
      const alpha = data[(y * naturalWidth + x) * 4 + 3]
      if (alpha > alphaThreshold) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) return null
  return { left: minX, top: minY, naturalWidth, naturalHeight }
}

export function horizontalTrimOffset(img: HTMLImageElement, bounds: OpaqueBounds): number {
  if (!bounds.left) return 0
  const scale = img.offsetWidth / bounds.naturalWidth
  return -bounds.left * scale
}

export function trimShiftStyle(offsetX: number): CSSProperties | undefined {
  if (!offsetX) return undefined
  return { marginLeft: `${offsetX}px` }
}
