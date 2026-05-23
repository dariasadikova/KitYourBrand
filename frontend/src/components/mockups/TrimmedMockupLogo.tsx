import { useCallback, useEffect, useRef, useState } from 'react'
import { horizontalTrimOffset, measureOpaqueBounds, trimShiftStyle } from './trimImageBounds'

type TrimmedMockupLogoProps = {
  src: string
  className?: string
  wrapClassName?: string
}

export function TrimmedMockupLogo({ src, className, wrapClassName }: TrimmedMockupLogoProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [offsetX, setOffsetX] = useState(0)

  const updateTrim = useCallback(() => {
    const img = imgRef.current
    if (!img?.complete || !img.naturalWidth) return
    const bounds = measureOpaqueBounds(img)
    if (!bounds) {
      setOffsetX(0)
      return
    }
    setOffsetX(horizontalTrimOffset(img, bounds))
  }, [])

  useEffect(() => {
    setOffsetX(0)
  }, [src])

  useEffect(() => {
    const img = imgRef.current
    if (!img) return undefined
    const observer = new ResizeObserver(updateTrim)
    observer.observe(img)
    return () => observer.disconnect()
  }, [src, updateTrim])

  return (
    <span className={wrapClassName}>
      <img
        ref={imgRef}
        src={src}
        alt=""
        className={className}
        onLoad={updateTrim}
        style={trimShiftStyle(offsetX)}
      />
    </span>
  )
}
