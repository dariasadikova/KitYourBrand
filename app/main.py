from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.core.settings import settings
from app.db import project_service
from app.routers import pages, projects
from app.routers.api import auth as api_auth
from app.routers.api import generation_history as api_generation_history
from app.routers.api import profile as api_profile
from app.routers.api import projects as api_projects
from app.routers.api import results as api_results

import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger("kityourbrand")

_QUIET_LOG_PATHS = frozenset({'/favicon.ico'})

FRONTEND_DIST_DIR = settings.project_root / 'frontend' / 'dist'
FRONTEND_INDEX_FILE = FRONTEND_DIST_DIR / 'index.html'
FRONTEND_ASSETS_DIR = FRONTEND_DIST_DIR / 'assets'
FRONTEND_STATIC_DIR = FRONTEND_DIST_DIR / 'static'


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
    )

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        path = request.url.path
        quiet = path in _QUIET_LOG_PATHS
        if not quiet:
            logger.info("REQ %s %s", request.method, path)
        response = await call_next(request)
        if not quiet:
            logger.info("RES %s %s -> %s", request.method, path, response.status_code)
        return response

    @app.get('/favicon.ico', include_in_schema=False)
    async def favicon() -> Response:
        return Response(status_code=204)

    @app.on_event("startup")
    async def log_runtime_python():
        logger.info('Python executable: %s', sys.executable)

    @app.on_event("startup")
    async def mark_stale_generation_jobs():
        project_service.mark_abandoned_generation_jobs()

    @app.on_event("startup")
    async def debug_routes():
        logger.info("=== REGISTERED ROUTES ===")
        for route in app.routes:
            methods = getattr(route, "methods", None)
            path = getattr(route, "path", None)
            if path:
                logger.info("%s %s", sorted(methods) if methods else [], path)
        logger.info("=========================")

    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.secret_key,
        same_site='lax',
        https_only=False,
    )

    if FRONTEND_ASSETS_DIR.exists():
        app.mount('/app/assets', StaticFiles(directory=str(FRONTEND_ASSETS_DIR)), name='frontend_assets')

    if FRONTEND_STATIC_DIR.exists():
        app.mount('/app/static', StaticFiles(directory=str(FRONTEND_STATIC_DIR)), name='frontend_static')

    app.include_router(api_auth.router)
    from app.routers.api import demo as api_demo

    app.include_router(api_demo.router)
    app.include_router(api_generation_history.router)
    app.include_router(api_profile.router)
    app.include_router(api_projects.router)
    app.include_router(api_results.router)
    app.include_router(pages.router)
    app.include_router(projects.router)

    @app.get('/app', include_in_schema=False)
    @app.get('/app/{path:path}', include_in_schema=False)
    async def react_spa_entry(request: Request, path: str = ''):
        if FRONTEND_INDEX_FILE.exists():
            # Avoid stale index.html during local dev (browser/CDN cache); hashed /app/assets/* still cache OK.
            spa_headers = (
                {'Cache-Control': 'no-store, max-age=0, must-revalidate'}
                if settings.debug
                else {}
            )
            return FileResponse(FRONTEND_INDEX_FILE, headers=spa_headers)
        return HTMLResponse(
            '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
            '<title>KYBBY React app</title></head><body>'
            '<p>React frontend build is not ready yet. Run <code>npm run build</code> in <code>frontend</code>.</p>'
            '</body></html>',
            status_code=503,
        )

    return app


app = create_app()
