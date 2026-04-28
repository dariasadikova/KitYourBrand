from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, File, Form, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.core.paths import TEMPLATES_DIR
from app.core.settings import settings
from app.services.auth_service import AuthService
from app.services.generation_jobs import generation_jobs
from app.services.project_service import ProjectService

# Legacy pages router (Jinja UI).
# Transitional fallback during SPA migration; keep routes working until final cutover.
router = APIRouter()
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
auth_service = AuthService(settings.data_dir / 'app.db')
auth_service.init_db()
project_service = ProjectService(settings.data_dir / 'app.db', settings.data_dir / 'projects')
project_service.init_db()
PROFILE_AVATARS_DIR = settings.data_dir / 'profile_avatars'
PROFILE_AVATARS_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_AVATAR_EXT = {'.png', '.jpg', '.jpeg', '.webp'}
GENERATION_HISTORY_PER_PAGE = 10
MSK_TZ = timezone(timedelta(hours=3))


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


def _format_history_datetime(iso: str | None) -> str:
    if not iso:
        return '—'
    raw = str(iso).strip()
    try:
        parsed = datetime.fromisoformat(raw.replace('Z', '+00:00'))
    except ValueError:
        s = raw.replace('T', ' ')
        if '+00:00' in s:
            s = s.replace('+00:00', '').strip()
        elif s.endswith('Z'):
            s = s[:-1].strip()
        return s[:16] if len(s) >= 16 else s

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(MSK_TZ).strftime('%Y-%m-%d %H:%M')


def _format_history_duration(sec: float | None) -> str:
    if sec is None:
        return '—'
    try:
        s = float(sec)
    except (TypeError, ValueError):
        return '—'
    if s >= 60:
        m = int(s // 60)
        rest = s - m * 60
        if rest < 0.05:
            return f'{m} мин'
        txt = f'{m} мин {rest:.1f} сек'
        return txt.replace('.0 сек', ' сек')
    txt = f'{s:.1f} сек'
    return txt.replace('.0 сек', ' сек')


def _enrich_generation_history_rows(raw: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for r in raw:
        live = generation_jobs.get_job(str(r['job_id']))
        db_status = str(r['db_status'])
        project_deleted = bool(r['project_deleted'])
        in_memory_running = bool(
            live and str(live.get('status') or '') not in ('completed', 'failed')
        )
        db_inflight = db_status in ('pending', 'running')
        ui_running = db_inflight and in_memory_running
        interrupted = db_inflight and not in_memory_running
        effective_failed = db_status == 'failed' or interrupted

        if ui_running:
            status_key = 'running'
            action = 'cancel'
        elif db_status == 'success' and not interrupted:
            status_key = 'success'
            action = 'restore' if project_deleted else 'open'
        else:
            status_key = 'error'
            if project_deleted:
                action = 'restore'
            else:
                action = 'repeat'

        slug = str(r['project_slug'])
        rows.append(
            {
                'job_id': r['job_id'],
                'started_display': _format_history_datetime(r.get('started_at')),
                'project_name': r.get('project_name') or slug,
                'project_slug': slug,
                'status_key': status_key,
                'duration_display': _format_history_duration(r.get('duration_seconds')),
                'action': action,
                'results_url': f'/projects/{slug}/results',
                'editor_url': f'/projects/{slug}',
                'error_message': (r.get('error_message') or '').strip(),
                'error_hint': (r.get('error_hint') or '').strip(),
                'interrupted': interrupted,
            }
        )
    return rows


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
    user_row = auth_service.get_user_by_id(user_id)
    had_projects = bool(int(user_row['had_projects'])) if user_row and 'had_projects' in user_row.keys() else False
    show_generation_history = had_projects or bool(projects)
    user_name = request.session.get('user_name') or ''
    context = {
        'request': request,
        'projects': projects,
        'show_generation_history': show_generation_history,
        'user_name': user_name,
        'user_email': request.session.get('user_email') or '',
        'user_initial': (user_name[:1] or '?').upper(),
    }
    return templates.TemplateResponse(request, 'pages/dashboard.html', context)


@router.get('/generation-history', response_class=HTMLResponse)
async def generation_history_page(request: Request, page: int = Query(1, ge=1)) -> HTMLResponse:
    auth_redirect = require_auth(request)
    if auth_redirect:
        return auth_redirect

    user_id = int(request.session['user_id'])
    user_name = request.session.get('user_name') or ''
    per_page = GENERATION_HISTORY_PER_PAGE
    stats = project_service.generation_history_stats(user_id)
    total = int(stats['total'])
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))
    raw_rows, _ = project_service.list_generation_history_page(
        user_id, page=page, per_page=per_page
    )
    history_rows = _enrich_generation_history_rows(raw_rows)
    avg = stats.get('avg_duration')
    avg_display = _format_history_duration(float(avg)) if avg is not None else '—'
    showing_from = (page - 1) * per_page + 1 if total else 0
    showing_to = min(page * per_page, total)

    context = {
        'request': request,
        'user_name': user_name,
        'user_email': request.session.get('user_email') or '',
        'user_initial': (user_name[:1] or '?').upper(),
        'history_rows': history_rows,
        'stats': stats,
        'stats_avg_display': avg_display,
        'page': page,
        'per_page': per_page,
        'total': total,
        'total_pages': total_pages,
        'has_prev': page > 1,
        'has_next': page < total_pages,
        'prev_page': page - 1,
        'next_page': page + 1,
        'showing_from': showing_from,
        'showing_to': showing_to,
    }
    return templates.TemplateResponse(request, 'pages/generation_history.html', context)


@router.post('/generation-history/delete-selected')
async def generation_history_delete_selected(request: Request) -> JSONResponse:
    auth_redirect = require_auth(request)
    if auth_redirect:
        return JSONResponse({'ok': False, 'error': 'Требуется авторизация.'}, status_code=status.HTTP_401_UNAUTHORIZED)

    user_id = int(request.session['user_id'])
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    raw_ids = payload.get('job_ids') if isinstance(payload, dict) else []
    job_ids = raw_ids if isinstance(raw_ids, list) else []
    if len(job_ids) > 500:
        return JSONResponse({'ok': False, 'error': 'Слишком много записей для удаления за один запрос.'}, status_code=400)

    deleted, skipped = project_service.delete_generation_history_selected(user_id, [str(x) for x in job_ids])
    return JSONResponse({'ok': True, 'deleted': deleted, 'skipped': skipped})


@router.post('/generation-history/clear')
async def generation_history_clear(request: Request) -> JSONResponse:
    auth_redirect = require_auth(request)
    if auth_redirect:
        return JSONResponse({'ok': False, 'error': 'Требуется авторизация.'}, status_code=status.HTTP_401_UNAUTHORIZED)

    user_id = int(request.session['user_id'])
    deleted, skipped = project_service.delete_generation_history_all(user_id)
    return JSONResponse({'ok': True, 'deleted': deleted, 'skipped': skipped})


@router.get('/profile', response_class=HTMLResponse)
async def profile_page(request: Request) -> HTMLResponse:
    auth_redirect = require_auth(request)
    if auth_redirect:
        return auth_redirect

    user_id = int(request.session['user_id'])
    user_row = auth_service.get_user_by_id(user_id)
    user_name = (str(user_row['name']) if user_row else '') or request.session.get('user_name') or 'Пользователь'
    user_email = (str(user_row['email']) if user_row else '') or request.session.get('user_email') or ''
    avatar_path = str(user_row['avatar_path']) if user_row and user_row['avatar_path'] else ''
    context = {
        'request': request,
        'page_title': 'Профиль',
        'page_description': 'Страница профиля пока находится в разработке.',
        'user_name': user_name,
        'user_email': user_email,
        'user_initial': (user_name[:1] or '?').upper(),
        'avatar_url': f'/profile/avatar/{avatar_path}' if avatar_path else '',
        'profile_error': request.query_params.get('error') or '',
        'profile_success': request.query_params.get('success') or '',
    }
    return templates.TemplateResponse(request, 'pages/profile_stub.html', context)


@router.get('/profile/avatar/{filename}')
async def profile_avatar(request: Request, filename: str):
    auth_redirect = require_auth(request)
    if auth_redirect:
        return auth_redirect
    safe_name = Path(filename).name
    file_path = PROFILE_AVATARS_DIR / safe_name
    if not file_path.exists() or not file_path.is_file():
        return RedirectResponse(url='/static/img/kybby-whale.png', status_code=status.HTTP_303_SEE_OTHER)
    return FileResponse(file_path)


@router.post('/profile/update')
async def profile_update(
    request: Request,
    name: str = Form(''),
    current_password: str = Form(''),
    new_password: str = Form(''),
    remove_avatar: str = Form('0'),
    avatar: UploadFile | None = File(None),
):
    auth_redirect = require_auth(request)
    if auth_redirect:
        return auth_redirect

    user_id = int(request.session['user_id'])
    row = auth_service.get_user_by_id(user_id)
    if row is None:
        return RedirectResponse(url=f'/profile?error={quote("Пользователь не найден")}', status_code=status.HTTP_303_SEE_OTHER)

    avatar_path = str(row['avatar_path']) if row['avatar_path'] else None

    if remove_avatar == '1':
        if avatar_path:
            old = PROFILE_AVATARS_DIR / avatar_path
            if old.exists():
                old.unlink()
        avatar_path = None

    if avatar and (avatar.filename or '').strip():
        ext = Path(avatar.filename).suffix.lower()
        if ext not in ALLOWED_AVATAR_EXT:
            return RedirectResponse(url=f'/profile?error={quote("Недопустимый формат аватара")}', status_code=status.HTTP_303_SEE_OTHER)
        content = await avatar.read()
        if len(content) > 5 * 1024 * 1024:
            return RedirectResponse(url=f'/profile?error={quote("Файл аватара слишком большой")}', status_code=status.HTTP_303_SEE_OTHER)
        if avatar_path:
            old = PROFILE_AVATARS_DIR / avatar_path
            if old.exists():
                old.unlink()
        new_name = f'u{user_id}_{uuid.uuid4().hex}{ext}'
        (PROFILE_AVATARS_DIR / new_name).write_bytes(content)
        avatar_path = new_name

    try:
        auth_service.update_user_profile(user_id, name=name, avatar_path=avatar_path)
        if new_password.strip():
            auth_service.change_password(
                user_id,
                new_password=new_password,
            )
    except ValueError as exc:
        return RedirectResponse(url=f'/profile?error={quote(str(exc))}', status_code=status.HTTP_303_SEE_OTHER)

    request.session['user_name'] = (name or '').strip() or request.session.get('user_name')
    return RedirectResponse(url=f'/profile?success={quote("Изменения сохранены")}', status_code=status.HTTP_303_SEE_OTHER)


@router.get('/login', response_class=HTMLResponse)
async def login_page(request: Request) -> HTMLResponse:
    if request.session.get('user_id'):
        return RedirectResponse(url='/app/projects', status_code=status.HTTP_303_SEE_OTHER)

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
    return RedirectResponse(url='/app/projects', status_code=status.HTTP_303_SEE_OTHER)


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

    return RedirectResponse(url='/login?registered=1', status_code=status.HTTP_303_SEE_OTHER)
