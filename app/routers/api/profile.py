from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse

from app.core.settings import settings
from app.db import auth_service, project_service

router = APIRouter(prefix='/api/profile', tags=['api-profile'])

PROFILE_AVATARS_DIR = settings.data_dir / 'profile_avatars'
PROFILE_AVATARS_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_AVATAR_EXT = {'.png', '.jpg', '.jpeg', '.webp'}


def _require_user_id(request: Request) -> int:
    user_id = request.session.get('user_id')
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Требуется авторизация.')
    return int(user_id)


def _mask_api_key(value: str | None) -> str:
    cleaned = (value or '').strip()
    if not cleaned:
        return ''
    if len(cleaned) <= 8:
        return '••••'
    return f'{cleaned[:4]}••••{cleaned[-4:]}'


def _profile_payload(row) -> dict:
    user_name = (str(row['name']) if row else '') or 'Пользователь'
    user_email = (str(row['email']) if row else '') or ''
    avatar_path = str(row['avatar_path']) if row and row['avatar_path'] else ''
    recraft_api_key = str(row['recraft_api_key']) if row and row['recraft_api_key'] else ''
    openrouter_api_key = str(row['openrouter_api_key']) if row and row['openrouter_api_key'] else ''

    return {
        'name': user_name,
        'email': user_email,
        'initial': (user_name[:1] or '?').upper(),
        'avatar_url': f'/profile/avatar/{avatar_path}' if avatar_path else '',
        'api_keys': {
            'recraft': {
                'configured': bool(recraft_api_key),
                'masked': _mask_api_key(recraft_api_key),
            },
            'openrouter': {
                'configured': bool(openrouter_api_key),
                'masked': _mask_api_key(openrouter_api_key),
            },
        },
    }


@router.get('')
def get_profile(request: Request) -> JSONResponse:
    user_id = _require_user_id(request)
    row = auth_service.get_user_by_id(user_id)
    if row is None:
        raise HTTPException(status_code=404, detail='Пользователь не найден.')

    return JSONResponse({'ok': True, 'profile': _profile_payload(row)})


@router.post('/update')
async def update_profile(
    request: Request,
    name: str = Form(''),
    current_password: str = Form(''),
    new_password: str = Form(''),
    new_password_confirm: str = Form(''),
    remove_avatar: str = Form('0'),
    recraft_api_key: str = Form(''),
    openrouter_api_key: str = Form(''),
    avatar: UploadFile | None = File(None),
) -> JSONResponse:
    user_id = _require_user_id(request)
    row = auth_service.get_user_by_id(user_id)
    if row is None:
        raise HTTPException(status_code=404, detail='Пользователь не найден.')

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
            return JSONResponse({'ok': False, 'error': 'Недопустимый формат аватара'}, status_code=400)

        content = await avatar.read()
        if len(content) > 5 * 1024 * 1024:
            return JSONResponse({'ok': False, 'error': 'Файл аватара слишком большой'}, status_code=400)

        if avatar_path:
            old = PROFILE_AVATARS_DIR / avatar_path
            if old.exists():
                old.unlink()

        avatar_path = f'u{user_id}_{uuid.uuid4().hex}{ext}'
        (PROFILE_AVATARS_DIR / avatar_path).write_bytes(content)

    try:
        auth_service.update_user_profile(
            user_id,
            name=name,
            avatar_path=avatar_path,
            recraft_api_key=recraft_api_key.strip() or None,
            openrouter_api_key=openrouter_api_key.strip() or None,
        )
        current_raw = current_password.strip()
        new_raw = new_password.strip()
        confirm_raw = new_password_confirm.strip()

        if new_raw or confirm_raw:
            if not current_raw:
                raise ValueError('Введите текущий пароль.')
            if not new_raw:
                raise ValueError('Введите новый пароль.')
            if new_raw != confirm_raw:
                raise ValueError('Новый пароль и подтверждение не совпадают.')
            auth_service.change_password(
                user_id,
                new_password=new_raw,
                current_password=current_raw,
            )
            auth_service.revoke_other_user_sessions(
                user_id,
                keep_session_id=request.session.get('db_session_id'),
            )
        elif current_raw:
            raise ValueError('Введите новый пароль и подтверждение.')
    except ValueError as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)

    request.session['user_name'] = (name or '').strip() or request.session.get('user_name')
    updated = auth_service.get_user_by_id(user_id)
    return JSONResponse({'ok': True, 'profile': _profile_payload(updated)})


@router.post('/delete-account')
async def delete_account(
    request: Request,
    password: str = Form(''),
) -> JSONResponse:
    user_id = _require_user_id(request)
    row = auth_service.get_user_by_id(user_id)
    if row is None:
        raise HTTPException(status_code=404, detail='Пользователь не найден.')

    try:
        auth_service.verify_current_password(user_id, password)
    except ValueError as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)

    avatar_path = str(row['avatar_path']) if row['avatar_path'] else ''
    if avatar_path:
        avatar_file = PROFILE_AVATARS_DIR / avatar_path
        if avatar_file.exists():
            avatar_file.unlink()

    try:
        project_service.purge_user_account_data(user_id)
    except ValueError as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)

    auth_service.revoke_user_session(request.session.get('db_session_id'))
    auth_service.delete_user(user_id)
    request.session.clear()

    return JSONResponse({'ok': True, 'message': 'Аккаунт удалён.'})
