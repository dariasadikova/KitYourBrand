from __future__ import annotations

from fastapi import APIRouter, Form, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.core.paths import TEMPLATES_DIR
from app.core.settings import settings
from app.services.auth_service import AuthService

router = APIRouter()
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
auth_service = AuthService(settings.data_dir / 'app.db')
auth_service.init_db()


FEATURES = [
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
]


GALLERY = [
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
]


def landing_context() -> dict:
    return {
        'hero_title': 'Создайте бренд-стиль за минуты',
        'hero_subtitle': 'Логотипы, иконки, паттерны, иллюстрации — всё в одном месте.',
        'features': FEATURES,
        'gallery': GALLERY,
    }


@router.get('/', response_class=HTMLResponse)
async def landing_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, 'pages/landing.html', landing_context())


@router.get('/login', response_class=HTMLResponse)
async def login_stub(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, 'pages/stub.html', {'title': 'Войти', 'message': 'Экран входа сделаем следующим шагом.'})


@router.get('/register', response_class=HTMLResponse)
async def register_page(request: Request) -> HTMLResponse:
    context = landing_context()
    context.update(
        {
            'form_error': None,
            'form_success': request.query_params.get('success') == '1',
            'form_values': {'name': '', 'email': ''},
        }
    )
    return templates.TemplateResponse(request, 'pages/register.html', context)


@router.post('/register', response_class=HTMLResponse)
async def register_submit(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    password_confirm: str = Form(...),
) -> HTMLResponse:
    context = landing_context()
    context.update(
        {
            'form_error': None,
            'form_success': False,
            'form_values': {'name': name.strip(), 'email': email.strip()},
        }
    )

    if password != password_confirm:
        context['form_error'] = 'Пароли не совпадают.'
        return templates.TemplateResponse(request, 'pages/register.html', context, status_code=status.HTTP_400_BAD_REQUEST)

    result = auth_service.register_user(name=name, email=email, password=password)
    if not result.ok:
        context['form_error'] = result.error
        return templates.TemplateResponse(request, 'pages/register.html', context, status_code=status.HTTP_400_BAD_REQUEST)

    return RedirectResponse(url='/register?success=1', status_code=status.HTTP_303_SEE_OTHER)
