from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.routers.projects import project_service
from app.schemas.api_models import ProjectDto

router = APIRouter(prefix='/api/projects', tags=['api-projects'])


class CreateProjectPayload(BaseModel):
    name: str = Field(default='Новый проект', min_length=1, max_length=120)


def _require_auth(request: Request) -> int:
    user_id = request.session.get('user_id')
    if not user_id:
        raise HTTPException(status_code=401, detail='Требуется авторизация.')
    return int(user_id)


def _project_to_dto(project) -> dict:
    return ProjectDto(
        id=int(project.id),
        slug=str(project.slug),
        name=str(project.name),
        brand_id=str(project.brand_id),
        created_at=str(project.created_at),
        updated_at=str(project.updated_at),
    ).model_dump()


@router.get('')
def list_projects(request: Request) -> JSONResponse:
    user_id = _require_auth(request)
    projects = project_service.list_projects(user_id)
    items = [_project_to_dto(p) for p in projects]
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
            'project': _project_to_dto(project),
            'tokens': tokens,
        }
    )


@router.post('')
def create_project(request: Request, payload: CreateProjectPayload) -> JSONResponse:
    user_id = _require_auth(request)
    project = project_service.create_project(user_id, payload.name)
    return JSONResponse(
        {
            'ok': True,
            'project': _project_to_dto(project),
        },
        status_code=201,
    )
