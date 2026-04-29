from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.core.paths import STATIC_DIR
from app.core.settings import settings
from app.routers import pages, projects

import logging

FRONTEND_DIST = Path(__file__).parent.parent / 'frontend' / 'dist'

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger("kityourbrand")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
    )

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        logger.info("REQ %s %s", request.method, request.url.path)
        response = await call_next(request)
        logger.info("RES %s %s -> %s", request.method, request.url.path, response.status_code)
        return response

    @app.on_event("startup")
    async def mark_stale_generation_jobs():
        pages.project_service.mark_abandoned_generation_jobs()

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

    app.mount('/static', StaticFiles(directory=str(STATIC_DIR)), name='static')

    app.include_router(pages.router)
    app.include_router(projects.router)

    # React SPA: обслуживается под /app/ только если собранный dist существует.
    # Во время разработки Vite dev server запускается отдельно (npm run dev).
    if FRONTEND_DIST.exists():
        assets_dir = FRONTEND_DIST / 'assets'
        if assets_dir.exists():
            app.mount('/app/assets', StaticFiles(directory=str(assets_dir)), name='spa-assets')

        spa_index = FRONTEND_DIST / 'index.html'

        @app.get('/app', include_in_schema=False)
        @app.get('/app/{path:path}', include_in_schema=False)
        async def react_spa_entry(path: str = ''):
            if spa_index.exists():
                return FileResponse(str(spa_index))
            return FileResponse(str(FRONTEND_DIST / 'index.html'))

    return app


app = create_app()
