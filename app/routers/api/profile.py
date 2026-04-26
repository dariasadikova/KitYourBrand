from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.routers.pages import auth_service
from app.schemas.api_models import UserDto

router = APIRouter(prefix='/api/profile', tags=['api-profile'])


def _require_auth(request: Request) -> int:
    user_id = request.session.get('user_id')
    if not user_id:
        raise HTTPException(status_code=401, detail='Требуется авторизация.')
    return int(user_id)


@router.get('')
def get_profile(request: Request) -> JSONResponse:
    user_id = _require_auth(request)
    row = auth_service.get_user_by_id(user_id)
    if row is None:
        request.session.clear()
        raise HTTPException(status_code=401, detail='Требуется авторизация.')

    avatar_path = str(row['avatar_path']) if row['avatar_path'] else ''
    avatar_url = f'/profile/avatar/{avatar_path}' if avatar_path else None
    user = UserDto(
        id=int(row['id']),
        name=str(row['name']),
        email=str(row['email']),
        avatar_url=avatar_url,
    )
    return JSONResponse({'ok': True, 'user': user.model_dump()})
