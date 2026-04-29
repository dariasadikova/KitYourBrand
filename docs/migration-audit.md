# Migration Audit: Jinja2 → React + TypeScript

> Дата: 2026-04-29  
> Цель: зафиксировать текущую структуру проекта перед постепенной миграцией на React + TypeScript.

---

## 1. Стек до миграции

| Слой | Технология |
|------|-----------|
| Backend framework | FastAPI |
| Шаблонизатор | Jinja2 (TemplateResponse) |
| Статика | StaticFiles (`/static`) |
| БД | SQLite (через `app.db`) |
| Auth | Session cookie (starlette SessionMiddleware) |
| Frontend JS | Vanilla JS (3 файла) |
| CSS | Один файл `main.css` |
| Генерация | CLI-провайдеры (recraft, seedream, flux) |
| Постобработка | WEBP → PNG (Pillow) |
| Проектный конфиг | `tokens.json` на диске |

---

## 2. Page Routes (SSR / Jinja2)

### `app/routers/pages.py`

| Метод | Путь | Handler | Template |
|-------|------|---------|----------|
| GET | `/` | `landing_page` | `pages/landing.html` |
| GET | `/login` | `login_page` | `pages/login.html` |
| POST | `/login` | `login_submit` | `pages/login.html` (при ошибке) / редирект на `/dashboard` |
| GET | `/register` | `register_page` | `pages/register.html` |
| POST | `/register` | `register_submit` | `pages/register.html` (при ошибке) / редирект на `/login?registered=1` |
| GET | `/logout` | `logout` | — (редирект на `/`) |
| GET | `/dashboard` | `dashboard_page` | `pages/dashboard.html` |
| GET | `/generation-history` | `generation_history_page` | `pages/generation_history.html` |
| GET | `/profile` | `profile_page` | `pages/profile_stub.html` |
| GET | `/profile/avatar/{filename}` | `profile_avatar` | — (FileResponse / редирект) |
| POST | `/profile/update` | `profile_update` | — (редирект на `/profile`) |

### `app/routers/projects.py`

| Метод | Путь | Handler | Template |
|-------|------|---------|----------|
| GET | `/projects/{slug}` | `project_editor_page` | `pages/project_editor.html` |
| GET | `/projects/{slug}/results` | `project_results_page` | `pages/generation_results.html` |

---

## 3. JSON / API-like Routes (без prefix `/api`)

### `app/routers/pages.py`

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/generation-history/delete-selected` | Удалить выбранные записи истории |
| POST | `/generation-history/clear` | Очистить всю историю пользователя |

### `app/routers/projects.py`

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/projects/create` | Создать проект (редирект) |
| POST | `/projects/{slug}/delete` | Soft-delete проекта (редирект) |
| POST | `/projects/{slug}/restore` | Восстановить проект (редирект) |
| POST | `/projects/{slug}/save` | Сохранить tokens.json → JSON |
| POST | `/projects/{slug}/palette/suggest` | Предложить палитру → JSON |
| POST | `/projects/{slug}/reset` | Сбросить tokens.json → JSON |
| POST | `/projects/{slug}/upload-refs` | Загрузить референсы → JSON |
| GET  | `/projects/{slug}/list-refs` | Список референсов → JSON |
| POST | `/projects/{slug}/delete-ref` | Удалить референс → JSON |
| POST | `/projects/{slug}/generate-figma` | Сгенерировать Figma manifest → JSON |
| POST | `/projects/{slug}/generate/start` | Запустить генерацию → JSON |
| GET  | `/generation-jobs/{job_id}` | Статус job → JSON |
| POST | `/generation-jobs/{job_id}/cancel` | Отменить job → JSON |
| GET  | `/projects/{slug}/generation/active` | Активный job проекта → JSON |
| GET  | `/projects/{slug}/download` | Скачать конфиг (FileResponse) |
| GET  | `/projects/{slug}/refs/{filename}` | Скачать референс (FileResponse) |
| GET  | `/projects/{slug}/exports/{filename}` | Скачать экспорт (FileResponse) |
| GET  | `/projects/{slug}/downloads/{kind}` | ZIP-архив результатов (FileResponse) |
| GET/OPTIONS | `/assets/{brand_id}/{relpath:path}` | Ассеты с CORS (FileResponse) |

---

## 4. Экраны и JS Entrypoints

| Экран | URL | Template | JS entrypoint |
|-------|-----|----------|---------------|
| Landing | `/` | `pages/landing.html` | `main.js` (только hero-кнопка) |
| Login | `/login` | `pages/login.html` | `main.js` |
| Register | `/register` | `pages/register.html` | `main.js` |
| Dashboard | `/dashboard` | `pages/dashboard.html` | `main.js` |
| Generation History | `/generation-history` | `pages/generation_history.html` | inline `<script>` в шаблоне |
| Profile | `/profile` | `pages/profile_stub.html` | `main.js` |
| Project Editor | `/projects/{slug}` | `pages/project_editor.html` | `project-editor.js` |
| Generation Results | `/projects/{slug}/results` | `pages/generation_results.html` | `generation-results.js` |

---

## 5. Шаблоны и иерархия наследования

```
base.html
├── pages/landing.html          (extends base)
├── pages/login.html            (extends base, includes landing_content.html, partials/header.html)
├── pages/register.html         (extends base, includes landing_content.html, partials/header.html)
└── layouts/dashboard_shell.html (extends base)
    ├── pages/dashboard.html    (extends dashboard_shell)
    ├── pages/generation_history.html (extends dashboard_shell)
    ├── pages/profile_stub.html (extends dashboard_shell)
    ├── pages/project_editor.html (extends dashboard_shell)
    └── pages/generation_results.html (extends dashboard_shell)

Partials:
- partials/header.html          (логотип + nav для лендинга/auth)
- partials/dashboard_header.html (шапка дашборда: бренд, уведомления, user_email)
- partials/dashboard_sidebar.html (боковое меню: dashboard, profile, settings, logout)
- partials/icons_macros.html    (SVG-иконки как Jinja-макросы)
- pages/landing_content.html   (фоновый контент лендинга, включается в login/register)
```

---

## 6. Сервисы

| Модуль | Файл | Назначение |
|--------|------|-----------|
| AuthService | `services/auth_service.py` | SQLite: пользователи, PBKDF2, регистрация, логин, профиль, аватар, смена пароля |
| ProjectService | `services/project_service.py` | Проекты, `tokens.json`, референсы, экспорты, история генераций, soft-delete/restore |
| GenerationService | `services/generation_service.py` | Запуск CLI-провайдеров, очистка out/, WEBP→PNG, Figma manifest |
| GenerationJobs | `services/generation_jobs.py` | In-memory job registry, статусы, polling, отмена |
| PaletteService | `services/palette_service.py` | HEX нормализация, предложение палитр (soft/balanced/contrast) |
| GenerationErrorSummary | `services/generation_error_summary.py` | Человекочитаемые ошибки генерации |

---

## 7. Данные и файловая система

```
data/
├── app.db                  # SQLite: пользователи, проекты, история генераций
├── projects/               # Проекты пользователей
│   └── {user_id}/{slug}/
│       ├── tokens.json     # Основной конфиг проекта
│       ├── refs/           # Загруженные референсы
│       └── exports/        # Figma export файлы
├── brands/                 # brand_id данные
├── cache/                  # Кэш
├── profile_avatars/        # Аватары пользователей
└── uploads/

out/                        # Результаты генерации
├── recraft/{brand_id}/{section}/
├── seedream/{brand_id}/{section}/
└── flux/{brand_id}/{section}/

providers/
├── brandkit_recraft/       # CLI-провайдер Recraft
├── brandkit_seedream/      # CLI-провайдер Seedream
└── brandkit_flux2/         # CLI-провайдер Flux
```

---

## 8. Auth Flow

- Тип: Session cookie (starlette `SessionMiddleware`, `same_site=lax`)
- Ключ сессии: `secret_key` из `.env`
- Сессионные поля: `user_id`, `user_name`, `user_email`
- Guard: `require_auth(request)` → редирект на `/login` или HTTP 401
- Login redirect: после успеха → `/dashboard`
- Register redirect: после успеха → `/login?registered=1`
- Logout: `GET /logout` → очищает сессию → редирект на `/`

---

## 9. Чувствительные сценарии (нельзя сломать)

### Auth
- Логин / регистрация / логаут
- Сессия совместима с cookie-механизмом FastAPI

### Projects
- Список проектов → `GET /dashboard`
- Создание → `POST /projects/create`
- Soft-delete → `POST /projects/{slug}/delete`
- Restore → `POST /projects/{slug}/restore`

### Editor
- Hydrate проекта из `tokens.json`
- Сохранение → `POST /projects/{slug}/save`
- Сброс → `POST /projects/{slug}/reset`
- Скачать конфиг → `GET /projects/{slug}/download`
- Загрузка референсов → `POST /projects/{slug}/upload-refs`
- Список референсов → `GET /projects/{slug}/list-refs`
- Удаление референса → `POST /projects/{slug}/delete-ref`
- Предложить палитру → `POST /projects/{slug}/palette/suggest`

### Generation
- Autosave перед запуском
- Старт → `POST /projects/{slug}/generate/start`
- Polling → `GET /generation-jobs/{job_id}`
- Отмена → `POST /generation-jobs/{job_id}/cancel`
- Активный job → `GET /projects/{slug}/generation/active`
- Модал статусов провайдеров (recraft / seedream / flux)

### Results
- Показ результатов по sections (icons, patterns, illustrations)
- Палитра
- Кнопки download
- ZIP-архив → `GET /projects/{slug}/downloads/{kind}`
- Figma export → `POST /projects/{slug}/generate-figma`

### History
- Таблица с пагинацией
- Статусы: running / success / error / interrupted
- Действия: open / restore / repeat / cancel
- Статистика

### Figma Export
- `POST /projects/{slug}/generate-figma`
- `GET /projects/{slug}/exports/{filename}`
- `figma_plugin_manifest.json` в out/

---

## 10. Целевая структура для React миграции

```
frontend/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css          # импортирует main.css из static (или копию)
    ├── app/               # app-level: providers, router config
    ├── pages/             # страницы (по одной на маршрут)
    ├── components/        # переиспользуемые компоненты
    ├── layouts/           # layout-обёртки (AppShellLayout и т.д.)
    ├── api/               # fetch-клиенты для каждого ресурса
    ├── types/             # TypeScript типы контрактов
    └── styles/            # дополнительные CSS-модули если нужно
```

React SPA обслуживается под prefix `/app/`, Jinja2 страницы остаются на старых путях до полной миграции.

---

## 11. Известные риски

1. **Два экземпляра ProjectService** в `pages.py` и `projects.py` — дублирование инициализации SQLite.
2. **Inline `<script>` в `generation_history.html`** — нет отдельного JS entrypoint, логика встроена в шаблон.
3. **`project-editor.js`** — большой файл (~500+ строк), содержит polling, Figma, refs, palette, autosave. Требует внимательного переноса.
4. **`/dashboard` vs `/app/projects`** — разные пути для React и Jinja версий. Нужно согласовать редиректы.
5. **Auth session** — React SPA должен использовать те же session cookies, не JWT.
6. **`tokens.json` на диске** — единственный источник истины для проекта. Никакой дополнительной БД для конфига не нужно.
