import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.admin_console.router import router as admin_console_router
from app.auth.router import router as auth_account_router
from app.community.router import router as community_router
from app.core_inputs.router import router as core_inputs_router
from app.insights.router import router as insights_router
from app.modeling.router import router as modeling_router


def _load_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS", "")
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    if origins:
        return origins
    return [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]


app = FastAPI(title="MindSight API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_load_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_account_router)
app.include_router(core_inputs_router)
app.include_router(insights_router)
app.include_router(community_router)
app.include_router(admin_console_router)
app.include_router(modeling_router)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
