from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

from app.api.routes_ai import router as ai_router
from app.api.routes_assessment import router as assessment_router
from app.api.routes_auth import router as auth_router
from app.api.routes_chat import router as chat_router
from app.api.routes_checkin import router as checkin_router
from app.core.config import settings
from app.db.session import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(assessment_router)
app.include_router(checkin_router)
app.include_router(chat_router)
app.include_router(ai_router)


class RootResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    message: str
    disclaimer: str


@app.get("/", response_model=RootResponse)
async def root() -> RootResponse:
    # Request Example:
    # GET /
    #
    # Response Example:
    # 200
    # {"message":"Mental Health Check API","disclaimer":"이 서비스는 참고용이며, 진단 아님 안내입니다."}
    return RootResponse(
        message=settings.app_name,
        disclaimer="이 서비스는 참고용이며, 진단 아님 안내입니다.",
    )
