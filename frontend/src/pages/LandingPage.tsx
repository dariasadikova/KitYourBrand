import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuthMeResponse } from '../types/auth'
import { startDemoProject } from '../services/demoApi'
import { type FeatureIconName, HeroCtaArrow, LandingFeatureIcon } from '../components/icons'
import { LandingHeader } from '../components/layout/AppLayout'

export function LandingPage({
  session,
  onLogout,
  onSessionRefresh,
}: {
  session: AuthMeResponse | null
  onLogout: () => Promise<void>
  onSessionRefresh: () => Promise<void>
}) {
  useEffect(() => {
    document.body.classList.add('page-landing')
    return () => document.body.classList.remove('page-landing')
  }, [])

  return (
    <div className="landing-shell">
      <LandingHeader session={session} onLogout={onLogout} />
      <LandingBackdrop session={session} onSessionRefresh={onSessionRefresh} />
      <footer className="site-footer">
        <div className="container footer-inner">
          <p className="footer-wordmark" aria-label="KYBBY">
            <span className="footer-wordmark__accent">KYB</span>BY
          </p>
          <p>© 2026 KYBBY. Генерация бренд-комплектов с помощью ИИ.</p>
        </div>
      </footer>
    </div>
  )
}

type Feature = {
  title: string
  descriptionLines: readonly [string, string, string]
  icon: FeatureIconName
}

const LANDING_FEATURES: readonly Feature[] = [
  {
    title: 'Генерация ассетов',
    descriptionLines: [
      'Весь бренд-комплект за один запуск.',
      'Один стиль, одна палитра, одни рефы.',
      'Несколько нейросетей на выбор.',
    ],
    icon: 'assets',
  },
  {
    title: 'Совместная работа',
    descriptionLines: [
      'Сохраняйте проекты и делитесь ими',
      'с коллегами. Вся история генераций,',
      'палитра и ассеты — в лк.',
    ],
    icon: 'collab',
  },
  {
    title: 'Превью на мокапах',
    descriptionLines: [
      'Смотрите, как бренд выглядит',
      'в лендинге, на цифровом билборде, ВКонтакте.',
      'Собирайте превью под свой проект.',
    ],
    icon: 'mockups',
  },
  {
    title: 'Экспорт в Figma',
    descriptionLines: [
      'Переносите ассеты в Figma',
      'через плагин KYBBY. Все файлы',
      'готовы к импорту в ваш проект.',
    ],
    icon: 'figma',
  },
]

const HERO_POINTS = [
  ['генерируйте бренд-комплекты', 'в едином стиле'],
  ['делитесь проектами с коллегами'],
  ['смотрите, как бренд выглядит', 'на мокапах'],
  ['переносите ассеты в плагин', 'и продолжайте работу в Figma'],
] as const

function LandingBackdrop({
  session,
  onSessionRefresh,
}: {
  session: AuthMeResponse | null
  onSessionRefresh: () => Promise<void>
}) {
  const navigate = useNavigate()
  const [isStartingDemo, setIsStartingDemo] = useState(false)
  const [demoError, setDemoError] = useState('')

  async function handleTryNow() {
    if (session?.authenticated) {
      navigate('/dashboard')
      return
    }

    setDemoError('')
    setIsStartingDemo(true)
    try {
      const payload = await startDemoProject()
      await onSessionRefresh()
      navigate(payload.redirect_url.replace(/^\/app/, ''))
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : 'Не удалось открыть демо-режим.')
      setIsStartingDemo(false)
    }
  }

  return (
    <main className="landing-main">
      <section className="hero-section" aria-labelledby="landing-hero-title">
        <div className="hero-board">
          <div className="hero-board__frame">
            <div className="hero-board__glow" aria-hidden="true" />

            <p className="hero-board__wordmark" aria-hidden="true">
              <span className="hero-board__wordmark-accent">KYB</span>BY
            </p>

            <div className="hero-tagline">
              <p className="hero-tagline__brackets hero-tagline__brackets--desktop" aria-hidden="true">[              ]</p>
              <span className="hero-tagline__bracket hero-tagline__bracket--open" aria-hidden="true">[</span>
              <h1 className="hero-tagline__title" id="landing-hero-title">
                <span>создайте бренд-стиль</span>
                <span>за минуты</span>
              </h1>
              <span className="hero-tagline__bracket hero-tagline__bracket--close" aria-hidden="true">]</span>
            </div>

            <div className="hero-tile hero-tile--filled hero-tile--logos"><span>логотипы</span></div>

            <div className="hero-cta-wrap">
              <button type="button" className="hero-cta" disabled={isStartingDemo} onClick={() => void handleTryNow()}>
                <span>{isStartingDemo ? 'Открываем...' : 'попробовать'}</span>
                <HeroCtaArrow />
              </button>
              {demoError ? <p className="hero-demo-error">{demoError}</p> : null}
            </div>

            <div className="hero-tile hero-tile--filled hero-tile--patterns"><span>паттерны</span></div>
            <div className="hero-tile hero-tile--filled hero-tile--icons"><span>иконки</span></div>
            <div className="hero-tile hero-tile--filled hero-tile--illustrations">
              <span>
                иллюст<span className="hero-tile__hyphen">-</span>
                <br className="hero-tile__break" />
                рации
              </span>
            </div>

            <div className="hero-tile hero-tile--ghost hero-tile--ghost-mid" aria-hidden="true" />
            <div className="hero-tile hero-tile--ghost hero-tile--ghost-tagline" aria-hidden="true" />
            <div className="hero-tile hero-tile--ghost hero-tile--ghost-tr" aria-hidden="true" />
            <div className="hero-tile hero-tile--ghost hero-tile--ghost-br" aria-hidden="true" />

            <ul className="hero-points">
              {HERO_POINTS.map((lines) => (
                <li key={lines.join(' ')}>
                  {lines.map((line, index) => (
                    <span key={line}>
                      {line}
                      {index < lines.length - 1 ? <br /> : null}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>

        </div>
      </section>
      <section className="features-section section-block" id="features">
        <div className="container section-head section-head-center">
          <h2>Возможности платформы</h2>
          <p>Всё, что нужно для создания целостного визуального стиля</p>
        </div>

        <div className="container feature-grid">
          {LANDING_FEATURES.map((item) => (
            <article className="feature-card" key={item.title}>
              <div className="feature-icon-wrap" aria-hidden="true">
                <LandingFeatureIcon name={item.icon} />
              </div>
              <h3>{item.title}</h3>
              <p className="feature-card__text">
                {item.descriptionLines.map((line, index) => (
                  <span key={line}>
                    {line}
                    {index < 2 ? <br /> : null}
                  </span>
                ))}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
