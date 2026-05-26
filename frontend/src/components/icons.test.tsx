import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CopyIcon, LandingFeatureIcon } from './icons'

describe('icon components', () => {
  it('renders landing feature image icons with decorative alt text', () => {
    const { container } = render(<LandingFeatureIcon name="assets" />)

    const icon = container.querySelector('img')
    expect(icon).toHaveClass('feature-icon__img')
    expect(icon).toHaveAttribute('src', '/app/static/img/landing/stars.png')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders SVG icons without requiring page context', () => {
    const { container } = render(<CopyIcon />)

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg?.querySelectorAll('path, rect')).toHaveLength(2)
  })
})
