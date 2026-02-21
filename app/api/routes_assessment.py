from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes_auth import get_current_user
from app.db import crud
from app.db.models import Assessment
from app.db.session import get_db
from app.schemas.assessment import (
    PHQ9AssessmentDetailResponse,
    PHQ9AssessmentResponse,
    PHQ9Answers,
    PHQ9CreateRequest,
)
from app.schemas.auth import UserOut
from app.services.scoring import DISCLAIMER_TEXT, score_phq9

router = APIRouter(prefix="/assessments", tags=["assessment"])


def _description(total_score: int, severity: str) -> str:
    return (
        f"PHQ-9 총점은 {total_score}점이며 참고 구간은 '{severity}'입니다. "
        "참고용 결과이며 의료적 진단이 아닙니다."
    )


def _to_answers_model(assessment: Assessment) -> PHQ9Answers:
    return PHQ9Answers.model_validate(assessment.answers)


def _to_summary_response(assessment: Assessment) -> PHQ9AssessmentResponse:
    return PHQ9AssessmentResponse(
        id=assessment.id,
        total_score=assessment.total_score,
        severity=assessment.severity,
        description=_description(assessment.total_score, assessment.severity),
        disclaimer=DISCLAIMER_TEXT,
        created_at=assessment.created_at,
    )


def _to_detail_response(assessment: Assessment) -> PHQ9AssessmentDetailResponse:
    return PHQ9AssessmentDetailResponse(
        id=assessment.id,
        total_score=assessment.total_score,
        severity=assessment.severity,
        description=_description(assessment.total_score, assessment.severity),
        disclaimer=DISCLAIMER_TEXT,
        created_at=assessment.created_at,
        answers=_to_answers_model(assessment),
    )


@router.post("/phq9", response_model=PHQ9AssessmentDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_phq9_assessment(
    payload: PHQ9CreateRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PHQ9AssessmentDetailResponse:
    # Request Example:
    # POST /assessments/phq9
    # Authorization: Bearer <jwt>
    # {"answers":{"q1":1,"q2":2,"q3":0,"q4":1,"q5":0,"q6":1,"q7":0,"q8":1,"q9":0}}
    #
    # Response Example:
    # 201
    # {"id":"f8b12fcb-3d9d-4f8d-84a5-cb42ca634643","total_score":6,"severity":"mild","description":"...","disclaimer":"참고용...진단 아님","created_at":"...","answers":{"q1":1,"q2":2,"q3":0,"q4":1,"q5":0,"q6":1,"q7":0,"q8":1,"q9":0}}
    answers = payload.answers.model_dump()
    ordered_scores = [answers[f"q{i}"] for i in range(1, 10)]
    scored = score_phq9(ordered_scores)

    assessment = await crud.create_phq9_assessment(
        db=db,
        user_id=current_user.id,
        answers=answers,
        total_score=scored["total_score"],
        severity=scored["severity"],
    )
    return _to_detail_response(assessment)


@router.get("/phq9", response_model=list[PHQ9AssessmentResponse])
async def list_my_phq9_assessments(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PHQ9AssessmentResponse]:
    # Request Example:
    # GET /assessments/phq9
    # Authorization: Bearer <jwt>
    #
    # Response Example:
    # 200
    # [{"id":"f8b12fcb-3d9d-4f8d-84a5-cb42ca634643","total_score":6,"severity":"mild","description":"...","disclaimer":"참고용...진단 아님","created_at":"..."}]
    assessments = await crud.list_phq9_assessments_by_user(db, current_user.id)
    return [_to_summary_response(item) for item in assessments]


@router.get("/phq9/{assessment_id}", response_model=PHQ9AssessmentDetailResponse)
async def get_my_phq9_assessment(
    assessment_id: UUID,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PHQ9AssessmentDetailResponse:
    # Request Example:
    # GET /assessments/phq9/f8b12fcb-3d9d-4f8d-84a5-cb42ca634643
    # Authorization: Bearer <jwt>
    #
    # Response Example:
    # 200
    # {"id":"f8b12fcb-3d9d-4f8d-84a5-cb42ca634643","total_score":6,"severity":"mild","description":"...","disclaimer":"참고용...진단 아님","created_at":"...","answers":{"q1":1,"q2":2,"q3":0,"q4":1,"q5":0,"q6":1,"q7":0,"q8":1,"q9":0}}
    assessment = await crud.get_phq9_assessment_by_id(db, current_user.id, assessment_id)
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")
    return _to_detail_response(assessment)
