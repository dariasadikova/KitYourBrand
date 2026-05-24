from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from app.core.demo_mode import GUEST_USER_ID
from app.db import project_service
from app.services.project_service import ProjectRecord


@dataclass(slots=True)
class ProjectAccess:
    user_id: int
    project: ProjectRecord
    is_demo: bool
    guest_session_id: str | None = None


def is_demo_session(request: Request) -> bool:
    return bool(request.session.get('demo_mode')) and bool(request.session.get('guest_session_id'))


def guest_session_id(request: Request) -> str | None:
    value = request.session.get('guest_session_id')
    return str(value) if value else None


def demo_project_slug(request: Request) -> str | None:
    value = request.session.get('demo_project_slug')
    return str(value) if value else None


def demo_generation_used(request: Request) -> bool:
    return bool(request.session.get('demo_generation_used'))


def mark_demo_generation_used(request: Request) -> None:
    request.session['demo_generation_used'] = True


def require_job_access(request: Request, job_id: str) -> dict:
    from app.services.generation_jobs import generation_jobs

    job = generation_jobs.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Задача не найдена.')

    user_id = request.session.get('user_id')
    if user_id and int(job.get('user_id') or 0) == int(user_id):
        return job

    if is_demo_session(request) and int(job.get('user_id') or 0) == GUEST_USER_ID:
        allowed_slug = demo_project_slug(request)
        if allowed_slug and str(job.get('project_slug') or '') == allowed_slug:
            return job

    raise HTTPException(status_code=404, detail='Задача не найдена.')


def require_authenticated_user_id(request: Request) -> int:
    user_id = request.session.get('user_id')
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Требуется авторизация.')
    return int(user_id)


def require_project_access(request: Request, project_slug: str) -> ProjectAccess:
    user_id = request.session.get('user_id')
    if user_id:
        project = project_service.get_project(int(user_id), project_slug)
        if project is None:
            raise HTTPException(status_code=404, detail='Проект не найден.')
        return ProjectAccess(user_id=int(user_id), project=project, is_demo=False)

    if not is_demo_session(request):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Требуется авторизация.')

    session_id = guest_session_id(request)
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Требуется авторизация.')

    allowed_slug = demo_project_slug(request)
    if allowed_slug and allowed_slug != project_slug:
        raise HTTPException(status_code=403, detail='Демо-проект недоступен в этой сессии.')

    project = project_service.get_guest_project(session_id, project_slug)
    if project is None:
        raise HTTPException(status_code=404, detail='Демо-проект не найден.')

    return ProjectAccess(
        user_id=GUEST_USER_ID,
        project=project,
        is_demo=True,
        guest_session_id=session_id,
    )


def clear_demo_session(request: Request) -> None:
    request.session.pop('demo_mode', None)
    request.session.pop('guest_session_id', None)
    request.session.pop('demo_project_slug', None)
    request.session.pop('demo_generation_used', None)
