from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .deps import get_core_input_store, get_verified_user_id
from .models import (
    ActivityFilter,
    ActivityView,
    AssessmentAnswerRequest,
    AssessmentSessionResponse,
    AssessmentStartRequest,
    ChallengeCatalogDetailResponse,
    ChallengeDayExecuteRequest,
    ChallengeDayLogRequest,
    ChallengeDayLogResponse,
    ChallengeEnrollmentCreateRequest,
    ChallengeEnrollmentDetailResponse,
    ChallengeEnrollmentResponse,
    ChallengeEnrollmentUpdateRequest,
    ChallengeReflectionRequest,
    ChallengeStatus,
    CheckinFeatureBundleResponse,
    CheckinPayload,
    CheckinRecordResponse,
    JournalCreateRequest,
    JournalCategoryOptionsResponse,
    JournalEntryResponse,
    JournalListItemResponse,
    JournalUpdateRequest,
    UserDayActivityLogResponse,
)
from .store import CoreInputStore

router = APIRouter(tags=["core-inputs"])


def _today() -> date:
    return date.today()


def _map_store_error(error: ValueError) -> HTTPException:
    code = str(error)
    if code in {
        "assessment_not_found",
        "journal_not_found",
        "challenge_not_found",
        "enrollment_not_found",
        "day_log_not_found",
    }:
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=code)

    if code in {
        "checkin_already_exists",
        "active_sustained_limit_reached",
        "active_domain_duplicate",
        "enrollment_not_active",
    }:
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=code)

    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code)


@router.get("/checkin/today", response_model=CheckinRecordResponse)
def get_checkin_today(
    target_date: date | None = Query(default=None, alias="date"),
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> CheckinRecordResponse:
    resolved_date = target_date or _today()
    return store.get_checkin_today(user_id, resolved_date)


@router.post("/checkin/today", response_model=CheckinRecordResponse)
def create_checkin_today(
    payload: CheckinPayload,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> CheckinRecordResponse:
    try:
        return store.save_checkin(user_id=user_id, payload=payload, allow_edit=False)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/checkin/today/edit", response_model=CheckinRecordResponse)
def edit_checkin_today(
    payload: CheckinPayload,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> CheckinRecordResponse:
    try:
        return store.save_checkin(user_id=user_id, payload=payload, allow_edit=True)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/checkin/features/today", response_model=CheckinFeatureBundleResponse)
def get_checkin_features_today(
    target_date: date | None = Query(default=None, alias="date"),
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> CheckinFeatureBundleResponse:
    resolved_date = target_date or _today()
    return store.get_checkin_features_today(user_id, resolved_date)


@router.get("/checkin/features", response_model=list[CheckinFeatureBundleResponse])
def list_checkin_features(
    start_date: date = Query(...),
    end_date: date = Query(...),
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> list[CheckinFeatureBundleResponse]:
    try:
        return store.list_checkin_features(user_id, start_date, end_date)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/assessments/start", response_model=AssessmentSessionResponse)
def start_assessment(
    payload: AssessmentStartRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> AssessmentSessionResponse:
    try:
        return store.start_assessment(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/assessments/{assessment_id}/answer")
def save_assessment_answer(
    assessment_id: str,
    payload: AssessmentAnswerRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> dict[str, str | int | None]:
    try:
        return store.save_assessment_answer(user_id, assessment_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/assessments/{assessment_id}/complete", response_model=AssessmentSessionResponse)
def complete_assessment(
    assessment_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> AssessmentSessionResponse:
    try:
        return store.complete_assessment(user_id, assessment_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/assessments/history", response_model=list[AssessmentSessionResponse])
def list_assessment_history(
    limit: int = Query(default=20, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> list[AssessmentSessionResponse]:
    return store.list_assessment_history(user_id, limit)


@router.get("/challenge/catalog")
def get_challenge_catalog(
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> dict[str, object]:
    _ = user_id
    return {"items": [item.model_dump(mode="json") for item in store.list_challenge_catalog()]}


@router.get("/challenge/catalog/{challenge_id}", response_model=ChallengeCatalogDetailResponse)
def get_challenge_catalog_detail(
    challenge_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> ChallengeCatalogDetailResponse:
    try:
        return store.get_challenge_catalog_detail(user_id, challenge_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/challenge/recommendations/today")
def get_challenge_recommendations_today(
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> dict[str, object]:
    recommendations = store.get_today_recommendations(user_id)
    active = [item.model_dump(mode="json") for item in store.list_active_enrollments(user_id)]
    paused = [
        item.model_dump(mode="json")
        for item in store.list_challenge_enrollments(user_id, statuses=[ChallengeStatus.paused])
    ]
    completed = [
        item.model_dump(mode="json")
        for item in store.list_challenge_enrollments(user_id, statuses=[ChallengeStatus.completed])
    ]
    dropped = [
        item.model_dump(mode="json")
        for item in store.list_challenge_enrollments(user_id, statuses=[ChallengeStatus.dropped])
    ]
    return {
        "recommendations": recommendations,
        "active_enrollments": active,
        "enrollments": {
            "active": active,
            "paused": paused,
            "completed": completed,
            "dropped": dropped,
        },
    }


@router.get("/challenge/enrollments", response_model=list[ChallengeEnrollmentResponse])
def list_challenge_enrollments(
    session_status: str | None = Query(default=None, description="active,paused,completed,dropped"),
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> list[ChallengeEnrollmentResponse]:
    if session_status is None or session_status == "all":
        return store.list_challenge_enrollments(user_id)
    if session_status not in {item.value for item in ChallengeStatus}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_enrollment_status")
    return store.list_challenge_enrollments(user_id, statuses=[ChallengeStatus(session_status)])


@router.get("/challenge/enrollments/{enrollment_id}", response_model=ChallengeEnrollmentDetailResponse)
def get_challenge_enrollment_detail(
    enrollment_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> ChallengeEnrollmentDetailResponse:
    try:
        return store.get_challenge_enrollment_detail(user_id, enrollment_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/challenge/enrollments/{enrollment_id}/progress", response_model=ChallengeEnrollmentDetailResponse)
def get_challenge_enrollment_progress(
    enrollment_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> ChallengeEnrollmentDetailResponse:
    try:
        return store.get_challenge_enrollment_detail(user_id, enrollment_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/challenge/exposures")
def log_challenge_exposure(
    payload: dict[str, str | None],
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> dict[str, str]:
    challenge_id = str(payload.get("challenge_id") or "")
    exposure_type = str(payload.get("exposure_type") or "")
    response_type = str(payload.get("response_type")) if payload.get("response_type") else None
    reason_text = str(payload.get("reason_text")) if payload.get("reason_text") else None

    if not challenge_id or exposure_type not in {"shown", "browse"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_exposure_payload")

    if response_type and response_type not in {"accepted", "declined", "ignored"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_response_type")

    try:
        return store.log_challenge_exposure(user_id, challenge_id, exposure_type, response_type, reason_text)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/challenge/enrollments", response_model=ChallengeEnrollmentResponse)
def create_challenge_enrollment(
    payload: ChallengeEnrollmentCreateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> ChallengeEnrollmentResponse:
    try:
        return store.create_challenge_enrollment(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.patch("/challenge/enrollments/{enrollment_id}", response_model=ChallengeEnrollmentResponse)
def update_challenge_enrollment(
    enrollment_id: str,
    payload: ChallengeEnrollmentUpdateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> ChallengeEnrollmentResponse:
    try:
        return store.update_challenge_enrollment(user_id, enrollment_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/challenge/day-log")
def save_challenge_day_log(
    payload: ChallengeDayLogRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> dict[str, str]:
    try:
        return store.log_challenge_day(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post(
    "/challenge/enrollments/{enrollment_id}/execute-day",
    response_model=ChallengeDayLogResponse,
)
def execute_challenge_day(
    enrollment_id: str,
    payload: ChallengeDayExecuteRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> ChallengeDayLogResponse:
    try:
        return store.execute_challenge_day(user_id, enrollment_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post(
    "/challenge/enrollments/{enrollment_id}/reflection",
    response_model=ChallengeDayLogResponse,
)
def save_challenge_reflection(
    enrollment_id: str,
    payload: ChallengeReflectionRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> ChallengeDayLogResponse:
    try:
        return store.save_challenge_reflection(user_id, enrollment_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/challenge/enrollments/{enrollment_id}/complete", response_model=ChallengeEnrollmentResponse)
def complete_challenge_enrollment(
    enrollment_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> ChallengeEnrollmentResponse:
    try:
        return store.update_challenge_enrollment(
            user_id,
            enrollment_id,
            ChallengeEnrollmentUpdateRequest(status=ChallengeStatus.completed),
        )
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/journal", response_model=list[JournalListItemResponse])
def list_journal_entries(
    q: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    category_tags: list[str] = Query(default_factory=list),
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> list[JournalListItemResponse]:
    return store.list_journal(user_id, q, start_date, end_date, category_tags)


@router.get("/v1/journal/categories", response_model=JournalCategoryOptionsResponse)
def get_journal_category_options(
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> JournalCategoryOptionsResponse:
    return store.get_journal_category_options(user_id)


@router.post("/v1/journal", response_model=JournalEntryResponse)
def create_journal_entry(
    payload: JournalCreateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> JournalEntryResponse:
    try:
        return store.create_journal(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/journal/{journal_id}", response_model=JournalEntryResponse)
def get_journal_detail(
    journal_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> JournalEntryResponse:
    try:
        return store.get_journal_detail(user_id, journal_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.patch("/v1/journal/{journal_id}", response_model=JournalEntryResponse)
def update_journal_entry(
    journal_id: str,
    payload: JournalUpdateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> JournalEntryResponse:
    try:
        return store.update_journal(user_id, journal_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.delete("/v1/journal/{journal_id}")
def delete_journal_entry(
    journal_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> dict[str, str]:
    try:
        return store.delete_journal(user_id, journal_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/mypage/activity-log", response_model=list[UserDayActivityLogResponse])
def get_activity_log(
    start_date: date | None = None,
    end_date: date | None = None,
    filter: ActivityFilter = ActivityFilter.all,
    view: ActivityView = ActivityView.list,
    user_id: str = Depends(get_verified_user_id),
    store: CoreInputStore = Depends(get_core_input_store),
) -> list[UserDayActivityLogResponse]:
    resolved_end = end_date or date.today()
    resolved_start = start_date or (resolved_end - timedelta(days=27))

    try:
        return store.get_activity_log(user_id, resolved_start, resolved_end, filter, view)
    except ValueError as error:
        raise _map_store_error(error) from error
