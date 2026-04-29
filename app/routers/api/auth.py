from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.core.settings import settings
from app.services.auth_service import AuthService

router = APIRouter(prefix='/api/auth', tags=['api-auth'])
auth_service = AuthService(settings.data_dir / 'app.db')
auth_service.init_db()


class LoginPayload(BaseModel):
    email: str
    password: str


class RegisterPayload(BaseModel):
    name: str
    email: str
    password: str
    password_confirm: str


def _user_payload(user_id: int, name: str, email: str) -> dict:
    return {
        'id': int(user_id),
        'name': name or '',
        'email': email or '',
    }


@router.get('/me')
def current_session(request: Request) -> JSONResponse:
    user_id = request.session.get('user_id')
    if not user_id:
        return JSONResponse({'ok': True, 'authenticated': False, 'user': None})

    return JSONResponse(
        {
            'ok': True,
            'authenticated': True,
            'user': {
                'id': int(user_id),
                'name': request.session.get('user_name') or '',
                'email': request.session.get('user_email') or '',
            },
        }
    )


@router.post('/login')
def login(payload: LoginPayload, request: Request) -> JSONResponse:
    result = auth_service.authenticate_user(email=payload.email, password=payload.password)
    if not result.ok:
        return JSONResponse({'ok': False, 'error': result.error or 'Не удалось войти.'}, status_code=400)

    request.session['user_id'] = result.user_id
    request.session['user_name'] = result.user_name
    request.session['user_email'] = result.user_email

    return JSONResponse(
        {
            'ok': True,
            'authenticated': True,
            'user': _user_payload(
                int(result.user_id or 0),
                result.user_name or '',
                result.user_email or '',
            ),
        }
    )


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
    request.session.clear()
    return JSONResponse({'ok': True, 'authenticated': False, 'user': None})
