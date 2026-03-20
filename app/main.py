from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.core.paths import STATIC_DIR
from app.core.settings import settings
from app.routers import pages, projects

import logging

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

    return app


app = create_app()
