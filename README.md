# KitYourBrand Web

FastAPI-интерфейс для проекта KitYourBrand.

## Запуск

Linux / macOS

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

## Структура

- `app/routers/pages.py` — серверные страницы
- `app/templates/` — Jinja2 шаблоны
- `app/static/` — стили и JS
- `app/core/settings.py` — настройки и пути к соседним проектам KitYourBrand

## Текущий статус

Реализована главная страница и заглушки для `/login` и `/register`.
