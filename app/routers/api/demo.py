from __future__ import annotations

import uuid

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.core.demo_mode import DEMO_LIMITS_PAYLOAD
from app.core.project_access import demo_generation_used, demo_project_slug, guest_session_id, is_demo_session
from app.db import project_service

router = APIRouter(prefix='/api/demo', tags=['api-demo'])


def _demo_project_payload(project) -> dict:
    return {
        'id': project.id,
        'slug': project.slug,
        'name': project.name,
        'brand_id': project.brand_id,
        'created_at': project.created_at,
        'updated_at': project.updated_at,
        'is_imported': project.is_imported,
        'results_url': f'/app/demo/projects/{project.slug}/results',
        'editor_url': f'/app/demo/projects/{project.slug}',
    }


@router.post('/start')
def start_demo(request: Request) -> JSONResponse:
    if request.session.get('user_id'):
        return JSONResponse(
            {'ok': False, 'error': 'Вы уже вошли в аккаунт. Создайте проект в личном кабинете.'},
            status_code=400,
        )

    session_id = guest_session_id(request) or uuid.uuid4().hex
    request.session['guest_session_id'] = session_id
    request.session['demo_mode'] = True

    existing = project_service.get_guest_project_by_session(session_id)
    if existing:
        project = existing
    else:
        project = project_service.create_demo_project(session_id)
        request.session['demo_generation_used'] = False

    request.session['demo_project_slug'] = project.slug

    generation_used = demo_generation_used(request)
    if generation_used:
        redirect_url = f'/app/demo/projects/{project.slug}/results'
    elif existing:
        redirect_url = f'/app/demo/projects/{project.slug}'
    else:
        redirect_url = f'/app/demo/projects/{project.slug}?new=1'

    return JSONResponse(
        {
            'ok': True,
            'project': _demo_project_payload(project),
            'redirect_url': redirect_url,
            'demo_mode': True,
            'demo_limits': DEMO_LIMITS_PAYLOAD,
            'demo_generation_used': generation_used,
        }
    )


@router.get('/status')
def demo_status(request: Request) -> JSONResponse:
    if not is_demo_session(request):
        return JSONResponse({'ok': True, 'demo_mode': False})

    slug = demo_project_slug(request)
    session_id = guest_session_id(request)
    project = None
    if session_id and slug:
        project = project_service.get_guest_project(session_id, slug)

    return JSONResponse(
        {
            'ok': True,
            'demo_mode': True,
            'demo_project_slug': slug,
            'demo_generation_used': demo_generation_used(request),
            'demo_limits': DEMO_LIMITS_PAYLOAD,
            'project': _demo_project_payload(project) if project else None,
        }
    )
