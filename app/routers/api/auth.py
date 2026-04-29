from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix='/api/auth', tags=['api-auth'])


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
