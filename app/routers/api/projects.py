from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.settings import settings
from app.services.auth_service import AuthService
from app.services.project_service import ProjectRecord, ProjectService

router = APIRouter(prefix='/api/projects', tags=['api-projects'])
auth_service = AuthService(settings.data_dir / 'app.db')
auth_service.init_db()
project_service = ProjectService(settings.data_dir / 'app.db', settings.data_dir / 'projects')
project_service.init_db()


class CreateProjectPayload(BaseModel):
    name: str = 'Новый проект'


def _require_user_id(request: Request) -> int:
    user_id = request.session.get('user_id')
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Требуется авторизация.')
    return int(user_id)


def _project_payload(project: ProjectRecord) -> dict:
    return {
        'id': project.id,
        'slug': project.slug,
        'name': project.name,
        'brand_id': project.brand_id,
        'created_at': project.created_at,
        'updated_at': project.updated_at,
        'results_url': f'/app/projects/{project.slug}/results',
        'editor_url': f'/projects/{project.slug}',
    }


def _show_generation_history(user_id: int, projects: list[ProjectRecord]) -> bool:
    user_row = auth_service.get_user_by_id(user_id)
    had_projects = bool(int(user_row['had_projects'])) if user_row and 'had_projects' in user_row.keys() else False
    return had_projects or bool(projects)


@router.get('')
def list_projects(request: Request) -> JSONResponse:
    user_id = _require_user_id(request)
    projects = project_service.list_projects(user_id)

    return JSONResponse(
        {
            'ok': True,
            'projects': [_project_payload(project) for project in projects],
            'show_generation_history': _show_generation_history(user_id, projects),
        }
    )


@router.post('')
def create_project(request: Request, payload: CreateProjectPayload) -> JSONResponse:
    user_id = _require_user_id(request)
    project = project_service.create_project(user_id, payload.name)

    return JSONResponse(
        {
            'ok': True,
            'project': _project_payload(project),
            'redirect_url': f'/projects/{project.slug}?new=1',
        }
    )


@router.post('/{project_slug}/delete')
def delete_project(request: Request, project_slug: str) -> JSONResponse:
    user_id = _require_user_id(request)
    if not project_service.delete_project(user_id, project_slug):
        raise HTTPException(status_code=404, detail='Проект не найден.')
    return JSONResponse({'ok': True})


@router.post('/{project_slug}/restore')
def restore_project(request: Request, project_slug: str) -> JSONResponse:
    user_id = _require_user_id(request)
    if not project_service.restore_project(user_id, project_slug):
        raise HTTPException(status_code=404, detail='Проект не найден или уже активен.')
    return JSONResponse({'ok': True})
