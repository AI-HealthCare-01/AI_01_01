from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes_auth import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.schemas.ai import (
    CheckPredictRequest,
    CheckPredictResponse,
    MonitorPredictRequest,
    MonitorPredictResponse,
    NowcastPredictRequest,
    NowcastPredictResponse,
    WeeklyDashboardResponse,
)
from app.schemas.auth import UserOut
from app.services.ai_inference import predict_check, predict_monitor
from app.services.nowcast import get_default_weekly_dashboard_rows, get_weekly_dashboard_rows, predict_nowcast_for_user_day
from app.services.user_dashboard import build_user_weekly_dashboard

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/check/predict", response_model=CheckPredictResponse)
async def predict_check_level(payload: CheckPredictRequest) -> CheckPredictResponse:
    try:
        pred, probabilities = predict_check(payload.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Inference failed: {exc}") from exc

    return CheckPredictResponse(
        prediction=pred,
        probabilities=probabilities,
        model_path=settings.nowcast_model_dir,
    )


@router.post("/monitor/predict", response_model=MonitorPredictResponse)
async def predict_monitor_trend(payload: MonitorPredictRequest) -> MonitorPredictResponse:
    try:
        pred, probabilities = predict_monitor(payload.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Inference failed: {exc}") from exc

    return MonitorPredictResponse(
        prediction=pred,
        probabilities=probabilities,
        model_path=settings.monitor_model_path,
    )


@router.post("/nowcast/predict", response_model=NowcastPredictResponse)
async def predict_nowcast(payload: NowcastPredictRequest) -> NowcastPredictResponse:
    try:
        result = predict_nowcast_for_user_day(
            user_id=payload.user_id,
            date=payload.date,
            distortion_overrides=(payload.distortion_override.model_dump() if payload.distortion_override else None),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Nowcast failed: {exc}") from exc

    return NowcastPredictResponse(**asdict(result))


@router.get("/nowcast/dashboard/{user_id}", response_model=WeeklyDashboardResponse)
async def get_nowcast_dashboard(user_id: str) -> WeeklyDashboardResponse:
    try:
        rows = get_weekly_dashboard_rows(user_id=user_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dashboard load failed: {exc}",
        ) from exc

    return WeeklyDashboardResponse(user_id=user_id, rows=rows)


@router.get("/nowcast/dashboard/me", response_model=WeeklyDashboardResponse)
async def get_my_nowcast_dashboard(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WeeklyDashboardResponse:
    try:
        rows = await build_user_weekly_dashboard(db, current_user.id)
        if rows:
            return WeeklyDashboardResponse(user_id=str(current_user.id), rows=rows)

        fallback_user_id, fallback_rows = get_default_weekly_dashboard_rows()
        return WeeklyDashboardResponse(user_id=fallback_user_id, rows=fallback_rows)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"My dashboard build failed: {exc}",
        ) from exc
