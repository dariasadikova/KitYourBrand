import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from app.routers.pages import ALLOWED_AVATAR_EXT, PROFILE_AVATARS_DIR, auth_service
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


@router.post('/update')
async def update_profile(
    request: Request,
    name: str = Form(''),
    current_password: str = Form(''),
    new_password: str = Form(''),
    remove_avatar: str = Form('0'),
    avatar: UploadFile | None = File(None),
) -> JSONResponse:
    user_id = _require_auth(request)
    row = auth_service.get_user_by_id(user_id)
    if row is None:
        request.session.clear()
        return JSONResponse({'ok': False, 'error': 'Пользователь не найден.'}, status_code=401)

    avatar_path = str(row['avatar_path']) if row['avatar_path'] else None

    if remove_avatar == '1':
        if avatar_path:
            old = PROFILE_AVATARS_DIR / avatar_path
            if old.exists() and old.is_file():
                old.unlink()
        avatar_path = None

    if avatar and (avatar.filename or '').strip():
        ext = Path(avatar.filename).suffix.lower()
        if ext not in ALLOWED_AVATAR_EXT:
            return JSONResponse({'ok': False, 'error': 'Недопустимый формат аватара.'}, status_code=400)
        content = await avatar.read()
        if len(content) > 5 * 1024 * 1024:
            return JSONResponse({'ok': False, 'error': 'Файл аватара слишком большой.'}, status_code=400)
        if avatar_path:
            old = PROFILE_AVATARS_DIR / avatar_path
            if old.exists() and old.is_file():
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
                current_password=current_password.strip() or None,
            )
    except ValueError as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)

    updated = auth_service.get_user_by_id(user_id)
    if updated is None:
        request.session.clear()
        return JSONResponse({'ok': False, 'error': 'Пользователь не найден.'}, status_code=401)

    request.session['user_name'] = str(updated['name'])
    request.session['user_email'] = str(updated['email'])
    avatar_rel = str(updated['avatar_path']) if updated['avatar_path'] else ''
    user = UserDto(
        id=int(updated['id']),
        name=str(updated['name']),
        email=str(updated['email']),
        avatar_url=f'/profile/avatar/{avatar_rel}' if avatar_rel else None,
    )
    return JSONResponse({'ok': True, 'user': user.model_dump()})
