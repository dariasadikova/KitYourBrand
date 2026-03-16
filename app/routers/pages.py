from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.core.paths import TEMPLATES_DIR

router = APIRouter()
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@router.get('/', response_class=HTMLResponse)
async def landing_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        request,
        'pages/landing.html',
        {
            'hero_title': 'Создайте бренд-стиль за минуты',
            'hero_subtitle': 'Логотипы, иконки, паттерны, иллюстрации — всё в одном месте.',
            'features': [
                {
                    'icon': '✦',
                    'title': 'Генерация иконок',
                    'description': 'Создавайте уникальные иконки в едином стиле с настраиваемой цветовой палитрой и параметрами.',
                },
                {
                    'icon': '▦',
                    'title': 'Создание паттернов',
                    'description': 'Бесшовные паттерны и фоны с заданными мотивами и плотностью для любых дизайн-задач.',
                },
                {
                    'icon': '◫',
                    'title': 'Иллюстрации',
                    'description': 'Векторные иллюстрации, созданные ИИ в соответствии с вашим брендом и референсами.',
                },
                {
                    'icon': '⇩',
                    'title': 'Экспорт в Figma',
                    'description': 'Прямая интеграция с Figma через плагин — все ассеты доступны сразу в вашем проекте.',
                },
            ],
            'gallery': [
                {
                    'title': '3D icon demo',
                    'image_url': 'https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?auto=format&fit=crop&w=900&q=80',
                },
                {
                    'title': 'Water texture demo',
                    'image_url': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
                },
                {
                    'title': 'Pattern demo',
                    'image_url': 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=900&q=80',
                },
            ],
        },
    )


@router.get('/login', response_class=HTMLResponse)
async def login_stub(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, 'pages/stub.html', {'title': 'Войти', 'message': 'В процессе...'})


@router.get('/register', response_class=HTMLResponse)
async def register_stub(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, 'pages/stub.html', {'title': 'Регистрация', 'message': 'В процессе...'})
