export type FeatureIconName = 'assets' | 'collab' | 'mockups' | 'figma'

const LANDING_FEATURE_ICONS: Record<FeatureIconName, string> = {
  assets: '/app/static/img/landing/stars.png',
  collab: '/app/static/img/landing/together.png',
  mockups: '/app/static/img/landing/preview.png',
  figma: '/app/static/img/landing/export.png',
}

export function LandingFeatureIcon({ name }: { name: FeatureIconName }) {
  return (
    <img
      className="feature-icon__img"
      src={LANDING_FEATURE_ICONS[name]}
      alt=""
      width={28}
      height={28}
      aria-hidden="true"
    />
  )
}

export function HeroCtaArrow() {
  return (
    <svg
      className="hero-cta__arrow"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M6 26L26 6M26 6H8M26 6V24"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ProjectCardDeleteIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8V6" />
      <path d="M19 6l-.8 13.2a1.8 1.8 0 0 1-1.8 1.6H7.6a1.8 1.8 0 0 1-1.8-1.6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}

export function ProjectCardEditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M6.5 19a5.5 5.5 0 0 1 11 0" />
    </svg>
  )
}

export function EmailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.6" />
      <path d="M4.8 7.3 12 12.7l7.2-5.4" />
    </svg>
  )
}

export function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="9" rx="2.6" />
      <path d="M8 11V8.3a4 4 0 1 1 8 0V11" />
    </svg>
  )
}

export function DemoTabLockIcon() {
  return (
    <svg className="asset-tab__lock-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4.75 7V5.5a3.25 3.25 0 1 1 6.5 0V7h.75c.69 0 1.25.56 1.25 1.25v5.5c0 .69-.56 1.25-1.25 1.25h-7.5c-.69 0-1.25-.56-1.25-1.25v-5.5c0-.69.56-1.25 1.25-1.25h.75zm2 0h2.5V5.5a1.25 1.25 0 1 0-2.5 0V7z"
      />
    </svg>
  )
}

export function QuestionIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" />
      <path d="M9.5 9.4a2.6 2.6 0 0 1 4.6 1.3c0 1.6-2.1 2-2.1 3.7" />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CopyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}
