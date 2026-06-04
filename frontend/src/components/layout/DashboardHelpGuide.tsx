import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export function DashboardHelpIcon() {
  return (
    <span className="dashboard-help-btn__glyph" aria-hidden="true">
      i
    </span>
  )
}

export function DashboardHelpGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="dashboard-help-modal" role="presentation">
      <button type="button" className="dashboard-help-modal__backdrop" aria-label="Закрыть инструкцию" onClick={onClose} />
      <div
        className="dashboard-help-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-help-title"
      >
        <button type="button" className="dashboard-help-modal__close" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
        <div className="dashboard-help-modal__scroll">
          <h2 className="dashboard-help-modal__title" id="dashboard-help-title">
            Добро пожаловать в KYBBY!
          </h2>
          <p className="dashboard-help-modal__lead">
            KYBBY помогает собрать бренд-комплект в едином стиле: логотипы, иконки, паттерны, иллюстрации, палитру и
            материалы для Figma.
          </p>
          <p className="dashboard-help-modal__intro">
            Ниже — несколько{' '}
            <span className="dashboard-help-bracket" aria-hidden="true">
              [
            </span>{'  '}
            неочевидных моментов{'  '}
            <span className="dashboard-help-bracket" aria-hidden="true">
              ]
            </span>
          </p>

          <section className="dashboard-help-section">
            <h3 className="dashboard-help-section__title">1. API-ключи для генерации</h3>
            <p>
              Для генерации ассетов KYBBY использует внешние AI-провайдеры. Откройте{' '}
              <Link to="/profile" className="dashboard-help-link" onClick={onClose}>
                Профиль → API-ключи провайдеров
              </Link>{' '}
              и добавьте:
            </p>
            <ul className="dashboard-help-list">
              <li>
                <strong>Recraft API Key</strong> — для генерации через Recraft;
              </li>
              <li>
                <strong>OpenRouter API Key</strong> — для моделей Seedream, Flux, Nano Banana и GPT-5 Image.
              </li>
            </ul>
            <p className="dashboard-help-modal__subhead">Где взять ключи:</p>
            <ul className="dashboard-help-list dashboard-help-list--links">
              <li>
                <a
                  href="https://www.recraft.ai/docs/api-reference/getting-started"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dashboard-help-link"
                >
                  Recraft
                </a>
                : войдите в аккаунт → откройте профиль / API → создайте и скопируйте API-ключ.
              </li>
              <li>
                <a
                  href="https://openrouter.ai/docs/quickstart"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dashboard-help-link"
                >
                  OpenRouter
                </a>
                : войдите в аккаунт → откройте раздел Keys / API Keys → создайте и скопируйте API-ключ.
              </li>
            </ul>
            <p className="dashboard-help-note">
              Не передавайте API-ключи другим людям: они связаны с вашим аккаунтом провайдера и могут использоваться для
              платных запросов.
            </p>
          </section>

          <section className="dashboard-help-section">
            <h3 className="dashboard-help-section__title">2. Импорт бренд-комплекта в Figma</h3>
            <p>
              После генерации KYBBY формирует данные для импорта бренд-комплекта в Figma: <strong>Brand ID</strong>,{' '}
              <strong>Base URL</strong>, манифест и ассеты.
            </p>
            <p>
              Подробная инструкция по установке и запуску плагина находится на странице{' '}
              <Link to="/figma-plugin" className="dashboard-help-link" onClick={onClose}>
                Figma-плагин
              </Link>
              . Там можно скачать плагин KYBBY и узнать дальнейшие действия для импорта.
            </p>
          </section>

          <section className="dashboard-help-section">
            <h3 className="dashboard-help-section__title">3. Передача проекта через ZIP</h3>
            <p>
              Чтобы передать проект коллеге, скачайте ZIP-архив проекта и отправьте его. Коллега сможет импортировать архив
              через кнопку <strong>Импортировать проект</strong> на странице{' '}
              <Link to="/dashboard" className="dashboard-help-link" onClick={onClose}>
                Мои проекты
              </Link>
              .
            </p>
            <p>Так можно передать настройки бренда, референсы и связанные файлы проекта.</p>
          </section>

          <aside className="dashboard-help-tip">
            <p className="dashboard-help-tip__label">
              <span className="dashboard-help-bracket" aria-hidden="true">
                [
              </span>{'  '}
              совет{'  '}
              <span className="dashboard-help-bracket" aria-hidden="true">
                ]
              </span>
            </p>
            <p>
              Сначала создайте тестовый проект и попробуйте сгенерировать небольшой набор ассетов. Если генерация
              завершилась ошибкой, проверьте API-ключи, баланс у провайдера и параметры проекта.
            </p>
          </aside>
        </div>
        <div className="dashboard-help-modal__actions">
          <button type="button" className="btn btn-primary btn-inline" onClick={onClose}>
            Понятно
          </button>
        </div>
      </div>
    </div>
  )
}
