from __future__ import annotations

from fastapi import APIRouter, Form, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.core.paths import TEMPLATES_DIR
from app.core.settings import settings
from app.services.auth_service import AuthService
from app.services.project_service import ProjectService

router = APIRouter()
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
auth_service = AuthService(settings.data_dir / 'app.db')
auth_service.init_db()
project_service = ProjectService(settings.data_dir / 'app.db', settings.data_dir / 'projects')
project_service.init_db()


FEATURES = [
    {
        'icon': 'sparkles',
        'title': 'Генерация иконок',
        'description': 'Создавайте уникальные иконки в едином стиле с настраиваемой цветовой палитрой и параметрами.',
    },
    {
        'icon': 'grid3x3',
        'title': 'Создание паттернов',
        'description': 'Бесшовные паттерны и фоны с заданными мотивами и плотностью для любых дизайн-задач.',
    },
    {
        'icon': 'image',
        'title': 'Иллюстрации',
        'description': 'Векторные иллюстрации, созданные ИИ в соответствии с вашим брендом и референсами.',
    },
    {
        'icon': 'download',
        'title': 'Экспорт в Figma',
        'description': 'Прямая интеграция с Figma через плагин — все ассеты доступны сразу в вашем проекте.',
    },
]


def landing_context() -> dict:
    return {
        'hero_title_line1': 'Создайте бренд-стиль',
        'hero_title_line2': 'за минуты',
        'hero_subtitle': 'Логотипы, иконки, паттерны, иллюстрации — всё в одном месте.',
        'features': FEATURES,
    }


def auth_session_payload(request: Request) -> dict:
    return {
        'user_id': request.session.get('user_id'),
        'user_name': request.session.get('user_name'),
        'user_email': request.session.get('user_email'),
    }


def require_auth(request: Request):
    if not request.session.get('user_id'):
        return RedirectResponse(url='/login', status_code=status.HTTP_303_SEE_OTHER)
    return None


@router.get('/', response_class=HTMLResponse)
async def landing_page(request: Request) -> HTMLResponse:
    context = landing_context()
    context.update(auth_session_payload(request))
    return templates.TemplateResponse(request, 'pages/landing.html', context)


@router.get('/dashboard', response_class=HTMLResponse)
async def dashboard_page(request: Request) -> HTMLResponse:
    auth_redirect = require_auth(request)
    if auth_redirect:
        return auth_redirect

    user_id = int(request.session['user_id'])
    projects = project_service.list_projects(user_id)
    user_name = request.session.get('user_name') or ''
    context = {
        'request': request,
        'projects': projects,
        'user_name': user_name,
        'user_email': request.session.get('user_email') or '',
        'user_initial': (user_name[:1] or '?').upper(),
    }
    return templates.TemplateResponse(request, 'pages/dashboard.html', context)


@router.get('/profile', response_class=HTMLResponse)
async def profile_page(request: Request) -> HTMLResponse:
    auth_redirect = require_auth(request)
    if auth_redirect:
        return auth_redirect

    user_name = request.session.get('user_name') or 'Пользователь'
    context = {
        'request': request,
        'page_title': 'Профиль',
        'page_description': 'Страница профиля пока находится в разработке.',
        'user_name': user_name,
        'user_email': request.session.get('user_email') or '',
        'user_initial': (user_name[:1] or '?').upper(),
    }
    return templates.TemplateResponse(request, 'pages/profile_stub.html', context)


@router.get('/login', response_class=HTMLResponse)
async def login_page(request: Request) -> HTMLResponse:
    if request.session.get('user_id'):
        return RedirectResponse(url='/dashboard', status_code=status.HTTP_303_SEE_OTHER)

    context = landing_context()
    context.update(
        {
            'form_error': None,
            'form_success': request.query_params.get('registered') == '1',
            'form_values': {'email': ''},
        }
    )
    return templates.TemplateResponse(request, 'pages/login.html', context)


@router.post('/login', response_class=HTMLResponse)
async def login_submit(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
) -> HTMLResponse:
    context = landing_context()
    context.update(
        {
            'form_error': None,
            'form_success': False,
            'form_values': {'email': email.strip()},
        }
    )

    result = auth_service.authenticate_user(email=email, password=password)
    if not result.ok:
        context['form_error'] = result.error
        return templates.TemplateResponse(request, 'pages/login.html', context, status_code=status.HTTP_400_BAD_REQUEST)

    request.session['user_id'] = result.user_id
    request.session['user_name'] = result.user_name
    request.session['user_email'] = result.user_email
    return RedirectResponse(url='/dashboard', status_code=status.HTTP_303_SEE_OTHER)


@router.get('/logout')
async def logout(request: Request) -> RedirectResponse:
    request.session.clear()
    return RedirectResponse(url='/', status_code=status.HTTP_303_SEE_OTHER)


@router.get('/register', response_class=HTMLResponse)
async def register_page(request: Request) -> HTMLResponse:
    if request.session.get('user_id'):
        return RedirectResponse(url='/', status_code=status.HTTP_303_SEE_OTHER)

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

    new_user = auth_service.get_user_by_email(email.strip().lower())
    if new_user is not None:
        existing = project_service.list_projects(int(new_user['id']))
        if not existing:
            project_service.create_project(int(new_user['id']), 'Demo Brand')

    return RedirectResponse(url='/login?registered=1', status_code=status.HTTP_303_SEE_OTHER)
