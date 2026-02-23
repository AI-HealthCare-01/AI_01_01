from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.schemas.ai import (
    CheckPredictRequest,
    CheckPredictResponse,
    MonitorPredictRequest,
    MonitorPredictResponse,
    NowcastPredictRequest,
    NowcastPredictResponse,
    WeeklyDashboardResponse,
)
from app.services.ai_inference import predict_check, predict_monitor
from app.services.nowcast import get_weekly_dashboard_rows, predict_nowcast_for_user_day

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
        model_path=settings.check_model_path,
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

    return NowcastPredictResponse(**result.__dict__)


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
