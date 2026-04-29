# UI Parity Checklist

> **Правило:** React-версия каждого экрана должна быть визуально идентична текущей Jinja2-версии.  
> Изменения внешнего вида, отступов, сетки, цветов, типографики или расположения блоков **запрещены**.  
> При переносе в React: копировать HTML-структуру и CSS-классы, не переписывать.

---

## Экран 1: Landing Page (`/`)

**Template:** `pages/landing.html` + `pages/landing_content.html` + `partials/header.html`  
**CSS body class:** _(нет, базовый `base.html`)_

### Блоки

- [ ] Шапка (`partials/header.html`): логотип + nav-ссылки (Войти, Зарегистрироваться)
- [ ] Hero секция: заголовок в 2 строки, подзаголовок, кнопка CTA
- [ ] Секция фич: 4 карточки (Генерация иконок, Создание паттернов, Иллюстрации, Экспорт в Figma)
- [ ] Фоновый blur-контент (landing_content.html, включается в login/register тоже)

### Состояния

- [ ] Кнопка hero: preventDefault (пока без действия)
- [ ] Авторизованный пользователь: нет специального состояния на landing

---

## Экран 2: Login (`/login`)

**Template:** `pages/login.html`  
**Includes:** `partials/header.html`, `pages/landing_content.html`  
**CSS body class:** `landing-shell register-shell`

### Блоки

- [ ] Фоновый blur-слой (landing_content.html)
- [ ] Модальное окно формы входа:
  - Заголовок "Войти в аккаунт"
  - Поле Email (type=email)
  - Поле Пароль (type=password)
  - Кнопка "Войти" (submit)
  - Ссылка "Зарегистрироваться" → `/register`
  - Ссылка-крестик закрытия → `/`

### Состояния

- [ ] `form_error` — показ сообщения об ошибке (неверный email/пароль)
- [ ] `form_success` (registered=1) — показ сообщения об успешной регистрации
- [ ] Loading / disabled состояние кнопки при submit
- [ ] Сохранение email в поле при ошибке (form_values.email)

---

## Экран 3: Register (`/register`)

**Template:** `pages/register.html`  
**Includes:** `partials/header.html`, `pages/landing_content.html`  
**CSS body class:** `landing-shell register-shell`

### Блоки

- [ ] Фоновый blur-слой (landing_content.html)
- [ ] Модальное окно формы регистрации:
  - Заголовок "Создать аккаунт"
  - Поле Имя (type=text)
  - Поле Email (type=email)
  - Поле Пароль (type=password)
  - Поле Повторить пароль (type=password)
  - Кнопка "Зарегистрироваться" (submit)
  - Ссылка "Войти" → `/login`
  - Ссылка-крестик закрытия → `/`

### Состояния

- [ ] `form_error` — показ ошибки (пароли не совпадают / email занят)
- [ ] Loading / disabled кнопки при submit
- [ ] Сохранение name и email в полях при ошибке

---

## Экран 4: Dashboard — Мои проекты (`/dashboard`)

**Template:** `pages/dashboard.html` extends `layouts/dashboard_shell.html`  
**CSS body class:** `page-dashboard`  
**Layout:** dashboard-shell с сайдбаром и шапкой

### Общий layout (`dashboard_shell.html`)

- [ ] `<div class="dashboard-page">`
  - [ ] `dashboard_header` (шапка)
  - [ ] `<div class="dashboard-shell">` (сайдбар + main)
  - [ ] `<footer class="dashboard-site-footer">` — брендмарка + copyright

### Шапка (`partials/dashboard_header.html`)

- [ ] Ссылка-лого "KYBBY" → `/dashboard`
- [ ] Блок уведомлений (кнопка, пока без функции)
- [ ] Блок пользователя: user_initial (аватар-инициал) + user_email

### Сайдбар (`partials/dashboard_sidebar.html`)

- [ ] Ссылка "Мои проекты" → `/dashboard` (активна на `/dashboard`, `/projects/...`, `/generation-history`)
- [ ] Ссылка "Профиль" → `/profile`
- [ ] Пункт "Настройки" (заглушка `href="#"`)
- [ ] Ссылка "Выйти" → `/logout`
- [ ] Inline SVG-иконки рядом с пунктами

### Основной контент (dashboard)

- [ ] Заголовок "Мои проекты"
- [ ] Кнопка "Посмотреть историю генераций" → `/generation-history` (показывается только если `show_generation_history`)
- [ ] Кнопка "Создать проект" (POST `/projects/create`)
- [ ] Сетка карточек проектов (`.project-grid`)

### Карточка проекта (`.project-card`)

- [ ] Декоративные символы ✦✦ (`.project-card__icon`)
- [ ] Название проекта, дата создания
- [ ] Кликабельна вся карточка → `/projects/{slug}/results`
- [ ] Кнопка удаления 🗑 (POST с confirm) 
- [ ] Кнопка редактора ✎ → `/projects/{slug}`

### Состояния dashboard

- [ ] Пустой список — блок `.dashboard-empty` с текстом
- [ ] Список с проектами — сетка карточек
- [ ] `show_generation_history` = false/true — кнопка истории

---

## Экран 5: Profile (`/profile`)

**Template:** `pages/profile_stub.html` extends `layouts/dashboard_shell.html`

### Блоки

- [ ] Общий dashboard layout (шапка + сайдбар)
- [ ] Форма редактирования профиля:
  - Поле Имя (text)
  - Поле Email (readonly или не показывается)
  - Поле текущий пароль
  - Поле новый пароль
  - Аватар: текущий + кнопка удалить + загрузить новый
  - Кнопка "Сохранить" → POST `/profile/update`

### Состояния

- [ ] `profile_error` — показ ошибки (query param)
- [ ] `profile_success` — показ успеха
- [ ] Аватар: отображается если загружен / инициал-заглушка если нет

---

## Экран 6: Project Editor (`/projects/{slug}`)

**Template:** `pages/project_editor.html` extends `layouts/dashboard_shell.html`  
**JS:** `project-editor.js`  
**CSS classes:** `project-shell project-main`  
**data-attrs:** `data-project-slug`, `data-new-project-flow`

### Шапка страницы

- [ ] H1 "Генерация бренд-комплекта"
- [ ] Подзаголовок

### Форма `#project-editor-form` (`.editor-sections`)

#### Шаг 1 — Бренд (`.editor-card[data-progress-step="1"]`)

- [ ] Badge "1", "Шаг 1 из 6", H2 "Бренд"
- [ ] Поле "Название бренда" (`#name`)
- [ ] Поле "Style ID" (`#style_id`)
- [ ] Поле "Brand ID" (`#brand_id`)
- [ ] Заметка про Brand ID

#### Шаг 2 — Визуальный стиль (`data-progress-step="2"`)

- [ ] Сетка палитры `.palette-grid.palette-grid--six` (6 слотов)
- [ ] Каждый слот: checkbox enabled + color swatch + text input
- [ ] Слоты: primary, secondary, accent, tertiary, neutral, extra
- [ ] Блок валидации `#palette-validation` (hidden по умолчанию)
- [ ] Блок автоподбора `#palette-autofill` (hidden):
  - [ ] H3, caption, кнопка "Обновить варианты"
  - [ ] Chip с "Основа: —"
  - [ ] 3 кнопки вариантов (Soft, Balanced, Contrast)
  - [ ] Превью `#palette-autofill-preview`

#### Шаг 3 — Генерируемые ассеты (`data-progress-step="3"`)

- [ ] Tabs (logos, icons, patterns, illustrations)
- [ ] Panel логотипы: chip-list тем + input + кнопка добавить + count field
- [ ] Panel иконки: chip-list + stroke/corner/fill selects + count field
- [ ] Panel паттерны: chip-list + count field
- [ ] Panel иллюстрации: chip-list + checkboxes вектор/растр + count field

#### Шаг 4 — Референсы (`data-progress-step="4"`)

- [ ] Кнопка "Загрузить изображения" (file input hidden, label-кнопка)
- [ ] Сетка референсов `#refs-list .refs-grid` (заполняется JS)

#### Шаг 5 — Параметры генерации (`data-progress-step="5"`)

- [ ] Checkbox "Создать новый стиль по текущим референсам" (`#build_style`)
- [ ] Блок "Что будет сгенерировано" (список)

#### Шаг 6 — CTA (`data-progress-step="6"`, `.editor-card--cta`)

- [ ] Иконка ✧, H2 "Готово к генерации?"
- [ ] Кнопка "Собрать бренд-комплект" (`#btn-generate`)
- [ ] Счётчики: `#summary-logos`, `#summary-icons`, `#summary-patterns`, `#summary-illustrations`
- [ ] Статус `#generate-status`

### Actions row

- [ ] Кнопка "Сохранить" (`#save`)
- [ ] Ссылка "Скачать конфигурацию проекта" → `/projects/{slug}/download`
- [ ] Кнопка "Сброс" (`#reset`)

### Модал генерации (`#generation-modal`)

- [ ] Backdrop с закрытием
- [ ] Dialog: H2, progress bar, прогресс %, текст статуса
- [ ] Статусы провайдеров: Recraft / Seedream / Flux (`.provider-pill`)
- [ ] Лог операций (`#generation-log pre`)
- [ ] Кнопки: "Прервать генерацию", "Посмотреть результат" (hidden изначально)

### Модал ошибки генерации (`#generation-error-modal`)

- [ ] Backdrop
- [ ] Dialog: H2 "Ошибка генерации", сообщение, hint (hidden если нет)
- [ ] Кнопка "Ок"

### Состояния editor

- [ ] Загрузка данных проекта (hydrate из `tokens-data JSON script`)
- [ ] Saving (loading state кнопки Save)
- [ ] Resetting (confirm + loading)
- [ ] Generating — модал открыт, polling активен
- [ ] Generation success — кнопка "Посмотреть результат"
- [ ] Generation error — error модал
- [ ] New project flow (`data-new-project-flow="1"`) — особое поведение

---

## Экран 7: Generation Results (`/projects/{slug}/results`)

**Template:** `pages/generation_results.html` extends `layouts/dashboard_shell.html`  
**JS:** `generation-results.js`

### Блоки

- [ ] Общий dashboard layout
- [ ] Заголовок с именем проекта / "Результаты генерации"
- [ ] Секция палитры: цветовые плашки
- [ ] Секция иконок: сетка превью
- [ ] Секция паттернов: сетка превью
- [ ] Секция иллюстраций: сетка превью
- [ ] Для каждой секции: кнопки/ссылки скачивания (ZIP)
- [ ] Figma export: кнопка генерации манифеста, ссылка скачать
- [ ] Ссылка "Редактировать" → `/projects/{slug}`

### Состояния results

- [ ] Загрузка данных (из context: palette, assets)
- [ ] Пустая секция (нет сгенерированных ассетов)
- [ ] Ссылки скачивания: активны / неактивны
- [ ] Figma: idle / generating / ready (download link)
- [ ] Error состояние Figma генерации

---

## Экран 8: Generation History (`/generation-history`)

**Template:** `pages/generation_history.html` extends `layouts/dashboard_shell.html`  
**JS:** inline `<script>` в шаблоне (нет отдельного entrypoint)

### Блоки

- [ ] Общий dashboard layout
- [ ] Заголовок "История генераций"
- [ ] Статистика: всего / успешно / ошибки / среднее время
- [ ] Кнопка "Очистить историю"
- [ ] Таблица записей:
  - Checkbox выбора
  - Дата/время запуска
  - Название проекта
  - Статус (running / success / error)
  - Длительность
  - Кнопки действий (open / restore / repeat / cancel)
- [ ] Пагинация: prev/next + info "Показываю X–Y из N"
- [ ] Кнопка "Удалить выбранные"

### Состояния history

- [ ] Пустая история — текст
- [ ] running — анимация / spinner статуса
- [ ] success — зелёный
- [ ] error / interrupted — красный
- [ ] Удаление выбранных: loading
- [ ] Очистка всей истории: confirm + loading

---

## Общие компоненты (переиспользуются во всех dashboard-экранах)

### Toast (`#toast-root`)

- [ ] `.toast` — обычное сообщение
- [ ] `.toast.toast--error` — ошибка
- [ ] Авто-скрытие через 2.5 сек + transition

### Dashboard Header

- [ ] Бренд-ссылка
- [ ] Кнопка уведомлений
- [ ] Email пользователя + инициал (круглый аватар)

### Dashboard Sidebar

- [ ] Active state для текущего пункта меню
- [ ] SVG-иконки

---

## Правило переноса

При реализации React-версии каждого экрана:

1. Скопировать HTML-структуру из шаблона 1-в-1.
2. Использовать те же CSS-классы.
3. Не менять семантику тегов без необходимости.
4. Не добавлять обёрток, которых нет в Jinja-версии.
5. Динамические блоки (Jinja `{% if %}`, `{% for %}`) переносить как React conditional rendering.
6. Jinja-переменные (`{{ variable }}`) → React props / state.
7. После переноса — визуально сравнить с Jinja-версией рядом.
