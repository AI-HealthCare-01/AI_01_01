from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes_auth import get_current_user
from app.db.session import get_db
from app.schemas.auth import UserOut
from app.schemas.report import ClinicalReportResponse
from app.services.report_service import build_clinical_report

router = APIRouter(prefix="/reports", tags=["report"])


@router.get('/clinical/me', response_model=ClinicalReportResponse)
async def get_my_clinical_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClinicalReportResponse:
    return await build_clinical_report(db, current_user.id, start_date, end_date)
