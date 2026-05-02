from __future__ import annotations

import uuid
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, File, Form, Request, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from app.core.settings import settings
from app.services.auth_service import AuthService
from app.services.project_service import ProjectService

router = APIRouter()
auth_service = AuthService(settings.data_dir / 'app.db')
auth_service.init_db()
project_service = ProjectService(settings.data_dir / 'app.db', settings.data_dir / 'projects')
project_service.init_db()
PROFILE_AVATARS_DIR = settings.data_dir / 'profile_avatars'
PROFILE_AVATARS_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_AVATAR_EXT = {'.png', '.jpg', '.jpeg', '.webp'}


def require_auth(request: Request):
    if not request.session.get('user_id'):
        return RedirectResponse(url='/app/login', status_code=status.HTTP_303_SEE_OTHER)
    return None


def redirect_to_react(request: Request, path: str) -> RedirectResponse:
    query = request.url.query
    url = f'/app{path}'
    if query:
        url = f'{url}?{query}'
    return RedirectResponse(url=url, status_code=status.HTTP_303_SEE_OTHER)


@router.get('/')
async def landing_page(request: Request) -> RedirectResponse:
    return redirect_to_react(request, '')


@router.get('/dashboard')
async def dashboard_page(request: Request) -> RedirectResponse:
    auth_redirect = require_auth(request)
    if auth_redirect:
        return auth_redirect

    return redirect_to_react(request, '/dashboard')


@router.get('/generation-history')
async def generation_history_page(request: Request) -> RedirectResponse:
    auth_redirect = require_auth(request)
    if auth_redirect:
        return auth_redirect

    return redirect_to_react(request, '/generation-history')


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


@router.get('/profile')
async def profile_page(request: Request) -> RedirectResponse:
    auth_redirect = require_auth(request)
    if auth_redirect:
        return auth_redirect

    return redirect_to_react(request, '/profile')


@router.get('/profile/avatar/{filename}')
async def profile_avatar(request: Request, filename: str):
    auth_redirect = require_auth(request)
    if auth_redirect:
        return auth_redirect
    safe_name = Path(filename).name
    file_path = PROFILE_AVATARS_DIR / safe_name
    if not file_path.exists() or not file_path.is_file():
        return RedirectResponse(url='/app/static/img/kybby-logo.png', status_code=status.HTTP_303_SEE_OTHER)
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
        return RedirectResponse(url=f'/app/profile?error={quote("Пользователь не найден")}', status_code=status.HTTP_303_SEE_OTHER)

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
            return RedirectResponse(url=f'/app/profile?error={quote("Недопустимый формат аватара")}', status_code=status.HTTP_303_SEE_OTHER)
        content = await avatar.read()
        if len(content) > 5 * 1024 * 1024:
            return RedirectResponse(url=f'/app/profile?error={quote("Файл аватара слишком большой")}', status_code=status.HTTP_303_SEE_OTHER)
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
        return RedirectResponse(url=f'/app/profile?error={quote(str(exc))}', status_code=status.HTTP_303_SEE_OTHER)

    request.session['user_name'] = (name or '').strip() or request.session.get('user_name')
    return RedirectResponse(url=f'/app/profile?success={quote("Изменения сохранены")}', status_code=status.HTTP_303_SEE_OTHER)


@router.get('/login')
async def login_page(request: Request) -> RedirectResponse:
    if request.session.get('user_id'):
        return RedirectResponse(url='/app/dashboard', status_code=status.HTTP_303_SEE_OTHER)

    return redirect_to_react(request, '/login')


@router.post('/login')
async def login_submit(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
) -> RedirectResponse:
    result = auth_service.authenticate_user(email=email, password=password)
    if not result.ok:
        return RedirectResponse(
            url=f'/app/login?error={quote(result.error or "Не удалось войти.")}',
            status_code=status.HTTP_303_SEE_OTHER,
        )

    request.session['user_id'] = result.user_id
    request.session['user_name'] = result.user_name
    request.session['user_email'] = result.user_email
    return RedirectResponse(url='/app/dashboard', status_code=status.HTTP_303_SEE_OTHER)


@router.get('/logout')
async def logout(request: Request) -> RedirectResponse:
    request.session.clear()
    return RedirectResponse(url='/app', status_code=status.HTTP_303_SEE_OTHER)


@router.get('/register')
async def register_page(request: Request) -> RedirectResponse:
    if request.session.get('user_id'):
        return RedirectResponse(url='/app/dashboard', status_code=status.HTTP_303_SEE_OTHER)

    return redirect_to_react(request, '/register')


@router.post('/register')
async def register_submit(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    password_confirm: str = Form(...),
) -> RedirectResponse:
    if password != password_confirm:
        return RedirectResponse(
            url=f'/app/register?error={quote("Пароли не совпадают.")}',
            status_code=status.HTTP_303_SEE_OTHER,
        )

    result = auth_service.register_user(name=name, email=email, password=password)
    if not result.ok:
        return RedirectResponse(
            url=f'/app/register?error={quote(result.error or "Не удалось зарегистрироваться.")}',
            status_code=status.HTTP_303_SEE_OTHER,
        )

    return RedirectResponse(url='/app/login?registered=1', status_code=status.HTTP_303_SEE_OTHER)
