from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.routers.projects import _scan_asset_group, generation_jobs, generation_service, project_service
from app.schemas.api_models import GenerationJobDto, GenerationResultDto

router = APIRouter(prefix='/api/generations', tags=['api-generations'])
MSK_TZ = timezone(timedelta(hours=3))


class HistoryDeletePayload(BaseModel):
    job_ids: list[str] = Field(default_factory=list)


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


def _format_history_datetime(iso: str | None) -> str:
    if not iso:
        return '—'
    raw = str(iso).strip()
    try:
        parsed = datetime.fromisoformat(raw.replace('Z', '+00:00'))
    except ValueError:
        s = raw.replace('T', ' ')
        if '+00:00' in s:
            s = s.replace('+00:00', '').strip()
        elif s.endswith('Z'):
            s = s[:-1].strip()
        return s[:16] if len(s) >= 16 else s

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(MSK_TZ).strftime('%Y-%m-%d %H:%M')


def _format_history_duration(sec: float | None) -> str:
    if sec is None:
        return '—'
    try:
        s = float(sec)
    except (TypeError, ValueError):
        return '—'
    if s >= 60:
        m = int(s // 60)
        rest = s - m * 60
        if rest < 0.05:
            return f'{m} мин'
        txt = f'{m} мин {rest:.1f} сек'
        return txt.replace('.0 сек', ' сек')
    txt = f'{s:.1f} сек'
    return txt.replace('.0 сек', ' сек')


def _enrich_history_rows(raw: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for r in raw:
        live = generation_jobs.get_job(str(r['job_id']))
        db_status = str(r['db_status'])
        project_deleted = bool(r['project_deleted'])
        in_memory_running = bool(
            live and str(live.get('status') or '') not in ('completed', 'completed_with_errors', 'failed', 'cancelled')
        )
        db_inflight = db_status in ('pending', 'running')
        ui_running = db_inflight and in_memory_running
        interrupted = db_inflight and not in_memory_running

        if ui_running:
            status_key = 'running'
            action = 'cancel'
        elif db_status == 'success' and not interrupted:
            status_key = 'success'
            action = 'restore' if project_deleted else 'open'
        else:
            status_key = 'error'
            action = 'restore' if project_deleted else 'repeat'

        slug = str(r['project_slug'])
        rows.append(
            {
                'job_id': str(r['job_id']),
                'started_display': _format_history_datetime(r.get('started_at')),
                'project_name': r.get('project_name') or slug,
                'project_slug': slug,
                'status_key': status_key,
                'duration_display': _format_history_duration(r.get('duration_seconds')),
                'action': action,
                'results_url': f'/projects/{slug}/results',
                'editor_url': f'/projects/{slug}',
                'error_message': (r.get('error_message') or '').strip(),
                'error_hint': (r.get('error_hint') or '').strip(),
                'interrupted': interrupted,
                'project_deleted': project_deleted,
            }
        )
    return rows


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


@router.post('/projects/{project_slug}/start')
async def start_generation(request: Request, project_slug: str) -> JSONResponse:
    user_id = _require_auth(request)
    project = project_service.get_project(user_id, project_slug)
    if project is None:
        raise HTTPException(status_code=404, detail='Проект не найден.')
    active = generation_jobs.get_active_job_for_project(user_id=user_id, project_slug=project_slug)
    if active is not None:
        return JSONResponse(
            {'ok': False, 'error': 'Генерация уже запущена для проекта.', 'job': _serialize_job(active)},
            status_code=409,
        )
    try:
        payload = await request.json()
        if not isinstance(payload, dict):
            payload = {}
    except Exception:
        payload = {}

    job = generation_jobs.create_job(user_id=user_id, project_slug=project_slug)
    project_service.record_generation_job(user_id=user_id, job_id=job['id'], project_slug=project_slug)
    generation_jobs.start_generation(
        job_id=job['id'],
        generation_service=generation_service,
        user_id=user_id,
        project_slug=project_slug,
        payload=payload,
        base_host=str(request.base_url).rstrip('/'),
        project_service=project_service,
    )
    return JSONResponse({'ok': True, 'job_id': str(job['id'])}, status_code=202)


@router.post('/jobs/{job_id}/cancel')
def cancel_generation(request: Request, job_id: str) -> JSONResponse:
    user_id = _require_auth(request)
    ok = generation_jobs.request_cancel(job_id, user_id)
    if not ok:
        return JSONResponse({'ok': False, 'error': 'Задача не найдена или уже завершена.'}, status_code=400)
    return JSONResponse({'ok': True})


@router.get('/history')
def get_generation_history(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
) -> JSONResponse:
    user_id = _require_auth(request)
    stats = project_service.generation_history_stats(user_id)
    total = int(stats['total'])
    total_pages = max(1, (total + per_page - 1) // per_page)
    safe_page = max(1, min(page, total_pages))
    raw_rows, _ = project_service.list_generation_history_page(user_id, page=safe_page, per_page=per_page)
    rows = _enrich_history_rows(raw_rows)
    avg = stats.get('avg_duration')
    avg_display = _format_history_duration(float(avg)) if avg is not None else '—'
    showing_from = (safe_page - 1) * per_page + 1 if total else 0
    showing_to = min(safe_page * per_page, total)
    return JSONResponse(
        {
            'ok': True,
            'rows': rows,
            'stats': stats,
            'stats_avg_display': avg_display,
            'page': safe_page,
            'per_page': per_page,
            'total': total,
            'total_pages': total_pages,
            'has_prev': safe_page > 1,
            'has_next': safe_page < total_pages,
            'prev_page': safe_page - 1,
            'next_page': safe_page + 1,
            'showing_from': showing_from,
            'showing_to': showing_to,
        }
    )


@router.post('/history/delete-selected')
def delete_generation_history_selected(request: Request, payload: HistoryDeletePayload) -> JSONResponse:
    user_id = _require_auth(request)
    if len(payload.job_ids) > 500:
        return JSONResponse({'ok': False, 'error': 'Слишком много записей для удаления за один запрос.'}, status_code=400)
    deleted, skipped = project_service.delete_generation_history_selected(user_id, [str(x) for x in payload.job_ids])
    return JSONResponse({'ok': True, 'deleted': deleted, 'skipped': skipped})


@router.post('/history/clear')
def clear_generation_history(request: Request) -> JSONResponse:
    user_id = _require_auth(request)
    deleted, skipped = project_service.delete_generation_history_all(user_id)
    return JSONResponse({'ok': True, 'deleted': deleted, 'skipped': skipped})
