from pydantic import BaseModel, Field
from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

from app.routers.pages import auth_service


router = APIRouter(prefix='/api/auth', tags=['api-auth'])


class ApiRegisterPayload(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=256)
    password_confirm: str = Field(min_length=8, max_length=256)


class ApiLoginPayload(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)


def _session_user(request: Request) -> dict | None:
    user_id = request.session.get('user_id')
    if not user_id:
        return None
    row = auth_service.get_user_by_id(int(user_id))
    if row is None:
        request.session.clear()
        return None
    avatar_path = str(row['avatar_path']) if row['avatar_path'] else ''
    return {
        'id': int(row['id']),
        'name': str(row['name']),
        'email': str(row['email']),
        'avatar_url': f'/profile/avatar/{avatar_path}' if avatar_path else None,
    }


@router.post('/register')
def register(payload: ApiRegisterPayload) -> JSONResponse:
    if payload.password != payload.password_confirm:
        return JSONResponse(
            {'ok': False, 'error': 'Пароли не совпадают.'},
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    result = auth_service.register_user(
        name=payload.name,
        email=str(payload.email),
        password=payload.password,
    )
    if not result.ok:
        return JSONResponse(
            {'ok': False, 'error': result.error or 'Ошибка регистрации.'},
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    return JSONResponse(
        {'ok': True, 'message': 'Пользователь зарегистрирован.'},
        status_code=status.HTTP_201_CREATED,
    )


@router.post('/login')
def login(payload: ApiLoginPayload, request: Request) -> JSONResponse:
    result = auth_service.authenticate_user(email=str(payload.email), password=payload.password)
    if not result.ok:
        return JSONResponse(
            {'ok': False, 'error': result.error or 'Ошибка авторизации.'},
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
    request.session['user_id'] = result.user_id
    request.session['user_name'] = result.user_name
    request.session['user_email'] = result.user_email
    return JSONResponse(
        {
            'ok': True,
            'user': {
                'id': int(result.user_id or 0),
                'name': result.user_name or '',
                'email': result.user_email or '',
            },
        }
    )


@router.post('/logout')
def logout(request: Request) -> JSONResponse:
    request.session.clear()
    return JSONResponse({'ok': True})


@router.get('/me')
def me(request: Request) -> JSONResponse:
    user = _session_user(request)
    if user is None:
        return JSONResponse(
            {'ok': False, 'error': 'Требуется авторизация.'},
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
    return JSONResponse({'ok': True, 'user': user})
