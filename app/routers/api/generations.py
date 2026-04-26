from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.routers.projects import _scan_asset_group, generation_jobs, project_service
from app.schemas.api_models import GenerationJobDto, GenerationResultDto

router = APIRouter(prefix='/api/generations', tags=['api-generations'])


def _require_auth(request: Request) -> int:
    user_id = request.session.get('user_id')
    if not user_id:
        raise HTTPException(status_code=401, detail='Требуется авторизация.')
    return int(user_id)


def _serialize_job(job: dict) -> dict:
    provider_errors_raw = job.get('provider_errors') or {}
    provider_errors = {
        str(provider): (
            {
                'message': (err or {}).get('message'),
                'hint': (err or {}).get('hint'),
            } if isinstance(err, dict) else None
        )
        for provider, err in provider_errors_raw.items()
    }
    dto = GenerationJobDto(
        id=str(job.get('id') or ''),
        status=str(job.get('status') or ''),
        progress=int(job.get('progress') or 0),
        message=str(job.get('message') or ''),
        project_slug=str(job.get('project_slug') or ''),
        current_provider=(str(job.get('current_provider')) if job.get('current_provider') else None),
        failed_provider=(str(job.get('failed_provider')) if job.get('failed_provider') else None),
        providers={str(k): str(v) for k, v in (job.get('providers') or {}).items()},
        provider_errors=provider_errors,
        logs=[str(item) for item in (job.get('logs') or [])],
        cancel_requested=bool(job.get('cancel_requested')),
    )
    return dto.model_dump()


@router.get('/jobs/{job_id}')
def get_generation_job(request: Request, job_id: str) -> JSONResponse:
    user_id = _require_auth(request)
    job = generation_jobs.get_job(job_id)
    if not job or int(job.get('user_id') or 0) != user_id:
        raise HTTPException(status_code=404, detail='Задача не найдена.')
    return JSONResponse({'ok': True, 'job': _serialize_job(job)})


@router.get('/projects/{project_slug}/active')
def get_active_job_for_project(request: Request, project_slug: str) -> JSONResponse:
    user_id = _require_auth(request)
    project = project_service.get_project(user_id, project_slug)
    if project is None:
        raise HTTPException(status_code=404, detail='Проект не найден.')
    job = generation_jobs.get_active_job_for_project(user_id=user_id, project_slug=project_slug)
    return JSONResponse({'ok': True, 'job': _serialize_job(job) if job else None})


@router.get('/projects/{project_slug}/results')
def get_generation_results(request: Request, project_slug: str) -> JSONResponse:
    user_id = _require_auth(request)
    project = project_service.get_project(user_id, project_slug)
    if project is None:
        raise HTTPException(status_code=404, detail='Проект не найден.')
    tokens = project_service.load_tokens(user_id, project_slug)
    brand_id = (tokens.get('brand_id') or project.brand_id or '').strip()
    if not brand_id:
        raise HTTPException(status_code=400, detail='У проекта не указан brand_id.')

    dto = GenerationResultDto(
        brand_id=brand_id,
        logos=_scan_asset_group(brand_id, 'logos', ('.png', '.svg', '.jpg', '.jpeg')),
        icons=_scan_asset_group(brand_id, 'icons', ('.png', '.svg', '.jpg', '.jpeg')),
        patterns=_scan_asset_group(brand_id, 'patterns', ('.png', '.svg', '.jpg', '.jpeg')),
        illustrations=_scan_asset_group(brand_id, 'illustrations', ('.png', '.svg', '.jpg', '.jpeg')),
    )
    return JSONResponse({'ok': True, 'result': dto.model_dump()})
