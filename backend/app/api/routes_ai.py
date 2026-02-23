from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.schemas.ai import (
    CheckPredictRequest,
    CheckPredictResponse,
    MonitorPredictRequest,
    MonitorPredictResponse,
)
from app.services.ai_inference import predict_check, predict_monitor

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
