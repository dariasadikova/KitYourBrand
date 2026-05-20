from __future__ import annotations

import logging

from pydantic import BaseModel
from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from app.core.settings import settings
from app.db import auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/api/auth', tags=['api-auth'])


class LoginPayload(BaseModel):
    email: str
    password: str


class RegisterPayload(BaseModel):
    name: str
    email: str
    password: str
    password_confirm: str


class ForgotPasswordPayload(BaseModel):
    email: str


class ResetPasswordPayload(BaseModel):
    token: str
    password: str
    password_confirm: str


def _user_dict_from_row(row) -> dict | None:
    if row is None:
        return None
    avatar_path = str(row['avatar_path']) if row['avatar_path'] else ''
    avatar_url = f'/profile/avatar/{avatar_path}' if avatar_path else ''
    return {
        'id': int(row['id']),
        'name': str(row['name'] or ''),
        'email': str(row['email'] or ''),
        'avatar_url': avatar_url,
    }


@router.get('/me')
def current_session(request: Request) -> JSONResponse:
    user_id = request.session.get('user_id')
    if not user_id:
        return JSONResponse({'ok': True, 'authenticated': False, 'user': None})

    row = auth_service.get_user_by_id(int(user_id))
    user = _user_dict_from_row(row)
    if user is None:
        return JSONResponse({'ok': True, 'authenticated': False, 'user': None})

    return JSONResponse({'ok': True, 'authenticated': True, 'user': user})


@router.post('/login')
def login(payload: LoginPayload, request: Request) -> JSONResponse:
    result = auth_service.authenticate_user(email=payload.email, password=payload.password)
    if not result.ok:
        return JSONResponse({'ok': False, 'error': result.error or 'Не удалось войти.'}, status_code=400)

    session_id = auth_service.create_user_session(int(result.user_id or 0))
    request.session['user_id'] = result.user_id
    request.session['user_name'] = result.user_name
    request.session['user_email'] = result.user_email
    request.session['db_session_id'] = session_id

    row = auth_service.get_user_by_id(int(result.user_id or 0))
    user = _user_dict_from_row(row)
    if user is None:
        return JSONResponse({'ok': False, 'error': 'Пользователь не найден.'}, status_code=400)

    return JSONResponse({'ok': True, 'authenticated': True, 'user': user})


@router.post('/register')
def register(payload: RegisterPayload) -> JSONResponse:
    if payload.password != payload.password_confirm:
        return JSONResponse({'ok': False, 'error': 'Пароли не совпадают.'}, status_code=400)

    result = auth_service.register_user(
        name=payload.name,
        email=payload.email,
        password=payload.password,
    )
    if not result.ok:
        return JSONResponse({'ok': False, 'error': result.error or 'Не удалось зарегистрироваться.'}, status_code=400)

    return JSONResponse({'ok': True})


@router.post('/logout')
def logout(request: Request) -> JSONResponse:
    auth_service.revoke_user_session(request.session.get('db_session_id'))
    request.session.clear()
    return JSONResponse({'ok': True, 'authenticated': False, 'user': None})


@router.post('/forgot-password')
def forgot_password(payload: ForgotPasswordPayload) -> JSONResponse:
    token = auth_service.create_password_reset_token(payload.email)
    body: dict = {
        'ok': True,
        'message': (
            'Если аккаунт с таким email зарегистрирован, '
            'мы отправили инструкции по сбросу пароля на почту.'
        ),
    }
    if token and settings.debug:
        reset_url = f'/app/reset-password?token={token}'
        body['dev_reset_url'] = reset_url
        logger.info('Password reset link (debug): %s', reset_url)
    return JSONResponse(body)


@router.get('/reset-password/validate')
def validate_reset_password_token(token: str = Query(..., min_length=8)) -> JSONResponse:
    row = auth_service.get_valid_password_reset_token(token)
    if row is None:
        return JSONResponse(
            {'ok': False, 'valid': False, 'error': 'Ссылка недействительна или устарела.'},
            status_code=400,
        )
    return JSONResponse({'ok': True, 'valid': True})


@router.post('/reset-password')
def reset_password(payload: ResetPasswordPayload) -> JSONResponse:
    if payload.password != payload.password_confirm:
        return JSONResponse({'ok': False, 'error': 'Пароли не совпадают.'}, status_code=400)

    try:
        auth_service.reset_password_with_token(payload.token, payload.password)
    except ValueError as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)

    return JSONResponse({'ok': True, 'message': 'Пароль обновлён. Войдите с новым паролем.'})
