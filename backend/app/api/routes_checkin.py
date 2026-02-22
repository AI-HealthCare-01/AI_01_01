from datetime import datetime, timezone

from fastapi import APIRouter

from app.schemas.checkin import CheckinResponse

router = APIRouter(prefix="/checkins", tags=["checkin"])


@router.get("/latest", response_model=CheckinResponse)
async def latest_checkin() -> CheckinResponse:
    # Request Example:
    # GET /checkins/latest
    #
    # Response Example:
    # 200
    # {"message":"MVP 1단계에서는 체크인 기능이 준비 중입니다.","disclaimer":"이 정보는 참고용이며, 진단 아님 안내입니다.","timestamp":"..."}
    return CheckinResponse(
        message="MVP 1단계에서는 체크인 기능이 준비 중입니다.",
        disclaimer="이 정보는 참고용이며, 진단 아님 안내입니다.",
        timestamp=datetime.now(timezone.utc),
    )
