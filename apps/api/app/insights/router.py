from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from .deps import get_insights_store, get_verified_user_id
from .models import (
    ActivityDashboardResponse,
    CbtConversationTurnRequest,
    CbtConversationTurnResponse,
    CbtReflectionUpsertRequest,
    CbtRiskSignalResponse,
    CbtRiskSignalUpsertRequest,
    CbtSessionCreateRequest,
    CbtSessionResponse,
    CbtTodoUpsertRequest,
    DashboardSymptomMode,
    ReportSummaryExportRequest,
    ReportSummarySaveRequest,
    ReportSummarySaveResponse,
    ReportSummaryResponse,
    SymptomDashboardResponse,
)
from .store import InsightsStore

router = APIRouter(tags=["insights"])


def _map_store_error(error: ValueError) -> HTTPException:
    code = str(error)
    if code in {"cbt_session_not_found", "risk_signal_not_found"}:
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=code)
    if code in {"cbt_reflection_not_applicable"}:
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=code)

    if code == "invalid_date_range":
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code)

    if code.startswith("invalid_cbt_state_schema:"):
        return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=code)

    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code)


@router.post("/v1/cbt/sessions", response_model=CbtSessionResponse)
def create_cbt_session(
    payload: CbtSessionCreateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> CbtSessionResponse:
    try:
        return store.create_cbt_session(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/cbt/conversation/turn", response_model=CbtConversationTurnResponse)
def create_cbt_conversation_turn(
    payload: CbtConversationTurnRequest,
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> CbtConversationTurnResponse:
    try:
        return store.generate_cbt_turn(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/cbt/sessions/{session_id}/summary", response_model=CbtSessionResponse)
def get_cbt_session_summary(
    session_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> CbtSessionResponse:
    try:
        return store.get_cbt_session_summary(user_id, session_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/cbt/sessions", response_model=list[CbtSessionResponse])
def list_cbt_sessions(
    limit: int = Query(default=20, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> list[CbtSessionResponse]:
    try:
        return store.list_cbt_sessions(user_id, limit=limit)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/cbt/reflections/pending", response_model=list[CbtSessionResponse])
def list_pending_cbt_reflections(
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> list[CbtSessionResponse]:
    try:
        return store.list_pending_cbt_reflections(user_id, limit=limit)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/cbt/sessions/{session_id}/reflection", response_model=CbtSessionResponse)
def save_cbt_session_reflection(
    session_id: str,
    payload: CbtReflectionUpsertRequest,
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> CbtSessionResponse:
    try:
        return store.save_cbt_session_reflection(user_id, session_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/cbt/sessions/{session_id}/todo", response_model=CbtSessionResponse)
def save_cbt_session_todo(
    session_id: str,
    payload: CbtTodoUpsertRequest,
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> CbtSessionResponse:
    try:
        return store.save_cbt_session_todo(user_id, session_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/cbt/risk-signal", response_model=CbtRiskSignalResponse)
def create_cbt_risk_signal(
    payload: CbtRiskSignalUpsertRequest,
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> CbtRiskSignalResponse:
    try:
        return store.save_manual_risk_signal(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/dashboard/symptom", response_model=SymptomDashboardResponse)
def get_symptom_dashboard(
    mode: DashboardSymptomMode = Query(default=DashboardSymptomMode.mode_7d),
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> SymptomDashboardResponse:
    try:
        return store.get_symptom_dashboard(user_id, mode)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/dashboard/activity", response_model=ActivityDashboardResponse)
def get_activity_dashboard(
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> ActivityDashboardResponse:
    try:
        return store.get_activity_dashboard(user_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/report/summary", response_model=ReportSummaryResponse)
def get_summary_report(
    start_date: date,
    end_date: date,
    include_sensitive: bool = Query(default=True),
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> ReportSummaryResponse:
    try:
        return store.get_report_summary(user_id, start_date, end_date, include_sensitive)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/report/summary/save", response_model=ReportSummarySaveResponse)
def save_summary_report(
    payload: ReportSummarySaveRequest,
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> ReportSummarySaveResponse:
    try:
        return store.save_report(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/report/summary/export")
def export_summary_report(
    payload: ReportSummaryExportRequest,
    user_id: str = Depends(get_verified_user_id),
    store: InsightsStore = Depends(get_insights_store),
) -> StreamingResponse:
    try:
        content, media_type, filename = store.export_report(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error

    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([content]), media_type=media_type, headers=headers)
