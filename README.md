# KitYourBrand Web

## UI Migration Status

- React + TypeScript SPA is now the primary cabinet entry under `/app/*`.
- FastAPI + Jinja pages are kept as transitional fallback (legacy UI), not removed.
- Generation pipeline, providers, and DB storage model are unchanged.

## Run (Current)

### 1) Backend (FastAPI)

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 2) Frontend (React + Vite)

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

### 3) Production-like SPA build (optional)

```powershell
cd frontend
npm run build
```

After build, backend serves SPA entry on `/app/*` and static assets from `/app/assets/*`.
If build is absent, `/app/*` safely falls back to legacy routes.

## Regression Checklist

Use `docs/REGRESSION_CHECKLIST.md` before release or before removing any legacy templates/static files.

## Текущее состояние

На текущем этапе уже реализованы:

- многостраничный веб-интерфейс на **FastAPI + Jinja2 + StaticFiles**
- регистрация, вход и выход пользователей
- хранение пользователей и проектов в локальной **SQLite** базе
- личный кабинет пользователя с разделом **«Мои проекты»**
- создание реальных проектов вместо заглушек
- хранение каждого проекта как отдельного `tokens.json`
- страница редактирования проекта / бренд-комплекта
- сохранение проекта без запуска генерации
- скачивание текущего `tokens.json`
- сброс проекта к исходной конфигурации
- загрузка и удаление style references
- запуск генерации через внешние CLI-провайдеры
- модальное окно прогресса генерации с логом и статусами провайдеров
- постобработка изображений `WEBP -> PNG`
- сборка Figma asset manifest после генерации
- раздача ассетов и manifest-файлов по HTTP

## Запуск

Linux / macOS:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Структура проекта

```text
kityourbrand_web/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── paths.py
│   │   └── settings.py
│   ├── routers/
│   │   ├── pages.py
│   │   └── projects.py
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── generation_jobs.py
│   │   ├── generation_service.py
│   │   ├── manifest_service.py
│   │   ├── project_service.py
│   │   └── user_service.py
│   ├── static/
│   │   ├── css/
│   │   └── js/
│   ├── templates/
│   │   ├── partials/
│   │   └── pages/
│   └── data/
├── providers/
│   ├── brandkit_recraft/
│   ├── brandkit_seedream/
│   └── brandkit_flux2/
├── out/
│   ├── recraft/
│   ├── seedream/
│   ├── flux/
│   └── _meta/
└── README.md
```

## Что уже реализовано по страницам

### 1. Главная страница `/`

Реализована публичная landing page:

- hero-блок
- блок возможностей платформы
- блок примеров ассетов
- кнопки **Войти** и **Регистрация**

### 2. Регистрация `/register`

Реализована рабочая регистрация пользователя:

- имя
- email
- пароль
- подтверждение пароля
- валидация полей
- защита от повторной регистрации на один email
- сохранение пользователя в SQLite
- пароль хранится в виде хеша

### 3. Вход `/login`

Реализован рабочий вход пользователя:

- вход по email и паролю
- проверка хеша пароля
- сессия через cookie
- редирект авторизованного пользователя в личный кабинет

### 4. Личный кабинет `/dashboard`

Реализован личный кабинет:

- список проектов пользователя
- создание нового проекта
- переход к странице проекта
- боковое меню
- верхняя панель с именем пользователя
- выход из аккаунта

### 5. Страница проекта `/projects/{project_slug}`

Реализована первая рабочая версия редактора проекта / `tokens.json`.

Сейчас через UI можно редактировать:

- `name` / brand name
- `brand_id`
- `style_id`
- палитру бренда
- параметры иконок
- промпты для иконок / паттернов / иллюстраций
- `references.style_images`
- флаг `build_style`

Также доступны действия:

- **Сохранить** — сохранить текущий проект без генерации
- **Скачать конфигурацию проекта** — скачать `tokens.json`
- **Сброс** — восстановить проект к исходной версии
- **Загрузить изображения** — добавить style references
- **Сгенерировать Figma Plugin JSON** — собрать manifest без полного UI-цикла
- **Собрать бренд-комплект** — запустить процесс генерации

## Как сейчас хранятся проекты пользователя/пользователей

Каждый проект хранится отдельно.

- метаданные проекта — в SQLite
- файлы проекта — в файловой структуре

Структура проекта пользователя:

```text
data/projects/<user_id>/<project_slug>/
├── tokens.json
├── tokens.original.json
├── uploads/
│   └── refs/
└── exports/
```

## Как устроена генерация сейчас

FastAPI-приложение выступает как оркестратор.

### Общий сценарий

1. Пользователь редактирует проект в UI
2. Нажимает **Собрать бренд-комплект**
3. Backend сохраняет актуальное состояние проекта
4. Создаётся пайплайн генерации
5. Генерация запускается в фоне
6. По очереди запускаются внешние CLI-провайдеры
7. После генерации выполняется пост-обработка и сборка манифеста
8. UI показывает прогресс в модальном окне

### Провайдеры

Подключены три провайдера:

- **Recraft**
- **Seedream**
- **Flux**

Они запускаются как внешние CLI через `subprocess.run(...)`.

### Текущее хранилище результатов

```text
out/
├── recraft/<brand_id>/icons|patterns|illustrations
├── seedream/<brand_id>/icons|patterns|illustrations
├── flux/<brand_id>/icons|patterns|illustrations
└── _meta/<brand_id>/figma_plugin_manifest*.json
```

## Окно, отображающее процесс генерации

После нажатия **Собрать бренд-комплект** открывается отдельное модальное окно.

Сейчас в нём реализованы:

- progress bar
- общий статус генерации
- статусы по провайдерам:
  - Recraft
  - Seedream
  - Flux
- лог операций
- подсветка успешных сообщений
- подсветка ошибок
- финальные состояния:
  - **Завершено**
  - **Завершено с ошибками**
  - **Ошибка генерации**

Прогресс сейчас пошаговый:

- инициализация
- подготовка проекта
- подготовка референсов
- запуск провайдеров
- пост-процессинг (например конвертация `WEBP -> PNG`)
- сборка Figma манифеста
- завершение

## Интеграция с Figma

После генерации приложение умеет собирать 
- `figma_plugin_manifest.json`.

Ассеты и манифест раздаются по HTTP для последующей загрузки в Figma plugin.

## Используемые технологии

- **FastAPI**
- **Jinja2**
- **SQLite**
- **passlib + bcrypt**
- **Pillow**
- **subprocess** для оркестрации CLI-провайдеров
- **vanilla JavaScript** для фронтенд-логики

## Краткое резюме

На текущий момент KitYourBrand Web уже умеет:

- регистрировать и авторизовывать пользователей
- хранить реальные проекты
- редактировать проект пользователя через UI
- загружать референсы
- запускать генерацию через Recraft / Seedream / Flux
- показывать прогресс генерации в отдельном модальном окне
- собирать Figma манифест


