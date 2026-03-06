from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .deps import get_modeling_store, get_verified_user_id
from .models import (
    ModelRuntimeStatusResponse,
    NowcastHistoryItem,
    NowcastPredictionResponse,
    NowcastPredictRequest,
)
from .store import ModelingStore

router = APIRouter(tags=["modeling"])


def _map_store_error(error: ValueError) -> HTTPException:
    code = str(error)
    if code == "user_not_found":
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=code)

    if code in {"model_bundle_not_ready", "model_runtime_unavailable"}:
        return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=code)

    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code)


@router.get("/v1/modeling/runtime", response_model=ModelRuntimeStatusResponse)
def get_model_runtime(
    _user_id: str = Depends(get_verified_user_id),
    store: ModelingStore = Depends(get_modeling_store),
) -> ModelRuntimeStatusResponse:
    return store.runtime_status()


@router.post("/v1/modeling/nowcast/predict", response_model=NowcastPredictionResponse)
def predict_nowcast(
    payload: NowcastPredictRequest,
    user_id: str = Depends(get_verified_user_id),
    store: ModelingStore = Depends(get_modeling_store),
) -> NowcastPredictionResponse:
    try:
        return store.predict_nowcast(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/modeling/nowcast/history", response_model=list[NowcastHistoryItem])
def get_nowcast_history(
    limit: int = Query(default=20, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: ModelingStore = Depends(get_modeling_store),
) -> list[NowcastHistoryItem]:
    try:
        return store.list_recent_predictions(user_id, limit)
    except ValueError as error:
        raise _map_store_error(error) from error
