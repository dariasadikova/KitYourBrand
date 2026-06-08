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
                <strong>OpenRouter API Key</strong> — для моделей Seedream, Flux, Nano Banana и GPT-5 Image Mini;
              </li>
              <li>
                <strong>Yandex Cloud API Key</strong> и <strong>Yandex Cloud Folder ID</strong> — для генерации через
                Alice AI ART (нужны оба поля).
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
              <li>
                <a
                  href="https://yandex.cloud/ru/docs/iam/operations/api-key/create"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dashboard-help-link"
                >
                  Yandex Cloud
                </a>
                : в консоли создайте API-ключ → скопируйте идентификатор каталога (Folder ID), в котором доступен AI
                Studio / Alice AI ART.
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

          <section className="dashboard-help-section">
            <h3 className="dashboard-help-section__title">4. Как писать промпты для генерации</h3>
            <p>
              Промпты задаются в редакторе проекта <strong>отдельно</strong> на каждой вкладке: <strong>Логотип</strong>,{' '}
              <strong>Иконки</strong>, <strong>Паттерны</strong> и <strong>Иллюстрации</strong>.
            </p>
            <p>
              KYBBY автоматически дополняет ваш текст: подставляет активную палитру, параметры иконок, прозрачный фон для
              логотипов и иконок, требования к бесшовности для паттернов. Вам нужно описать <strong>сюжет и характер</strong>{' '}
              ассета, а не перечислять hex-коды и технические ограничения.
            </p>
            <p className="dashboard-help-modal__subhead">Общие советы:</p>
            <ul className="dashboard-help-list">
              <li>
                Пишите <strong>конкретно</strong>: предмет, метафора, настроение, геометрия (например: «абстрактная
                капля и мягкая волна, минимализм, дружелюбный tech-бренд»).
              </li>
              <li>
                Для OpenRouter-моделей (Seedream, Flux, Nano Banana, GPT-5 Image) чаще стабильнее работает{' '}
                <strong>английский</strong>; для Alice AI ART подойдёт и русский.
              </li>
              <li>
                Поле «О бренде» влияет на превью результатов, но <strong>не подставляется</strong> в промпт генерации —
                важное для картинки опишите именно в поле «Промпт».
              </li>
              <li>
                Если промпт пустой, провайдер сгенерирует <strong>заглушки</strong> вроде logo-01 — для осмысленного
                результата лучше заполнить описание.
              </li>
              <li>Референсы усиливают стиль, но <strong>не заменяют промпт</strong>: кратко сформулируйте, что хотите увидеть.</li>
            </ul>
            <p className="dashboard-help-modal__subhead">По типам ассетов:</p>
            <ul className="dashboard-help-list">
              <li>
                <strong>Логотип</strong> — знак или символ без текста: форма, метафора бренда, характер линий (мягкий /
                строгий / игривый). Пример: «геометричный знак дома и щита, плоский силуэт, 2–3 простые формы».
              </li>
              <li>
                <strong>Иконки</strong> — один предмет или действие, читаемый силуэт. Уточните образ: «иконка Wi‑Fi в
                виде волны», «конверт для раздела сообщений». Толщину линий, скругление и заливку задайте полями Stroke
                Width / Corner / Fill — в промпт это дублировать не обязательно.
              </li>
              <li>
                <strong>Паттерны</strong> — мотивы и ритм повторения: «мелкие точки и дуги», «листья и волны в ряд»,
                «орнамент средней плотности». Избегайте сцен и персонажей — нужен фон для плитки.
              </li>
              <li>
                <strong>Иллюстрации</strong> — одна сцена или объект для интерфейса: кто/что изображено, действие,
                настроение. Пример: «человек настраивает умный дом, плоская иллюстрация, спокойная композиция». Не
                описывайте бесшовный узор — это задача паттернов.
              </li>
            </ul>
            <p className="dashboard-help-note">
              Начните с короткого промпта на 1–2 варианта, оцените результат на странице «Результаты» и уточните формулировку
              перед полной генерацией набора.
            </p>
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
