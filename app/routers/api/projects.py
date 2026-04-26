from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.routers.projects import project_service
from app.schemas.api_models import ProjectDto

router = APIRouter(prefix='/api/projects', tags=['api-projects'])


def _require_auth(request: Request) -> int:
    user_id = request.session.get('user_id')
    if not user_id:
        raise HTTPException(status_code=401, detail='Требуется авторизация.')
    return int(user_id)


@router.get('')
def list_projects(request: Request) -> JSONResponse:
    user_id = _require_auth(request)
    projects = project_service.list_projects(user_id)
    items = [ProjectDto(**p.__dict__).model_dump() for p in projects]
    return JSONResponse({'ok': True, 'projects': items})


@router.get('/{project_slug}')
def get_project(request: Request, project_slug: str) -> JSONResponse:
    user_id = _require_auth(request)
    project = project_service.get_project(user_id, project_slug)
    if project is None:
        raise HTTPException(status_code=404, detail='Проект не найден.')
    tokens = project_service.load_tokens(user_id, project_slug)
    return JSONResponse(
        {
            'ok': True,
            'project': ProjectDto(**project.__dict__).model_dump(),
            'tokens': tokens,
        }
    )
