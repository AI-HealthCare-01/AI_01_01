from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ClinicalRiskItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    code: str
    title: str
    detail: str


class ClinicalScoreSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    composite_latest: float | None = None
    dep_latest: float | None = None
    anx_latest: float | None = None
    ins_latest: float | None = None
    composite_delta: float | None = None


class ClinicalBehaviorSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    avg_sleep_hours: float | None = None
    avg_mood_score: float | None = None
    checkin_days: int = 0
    cbt_sessions: int = 0
    distortion_total_mean: float | None = None


class ClinicalReportResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    period_start: date
    period_end: date
    generated_at: datetime
    summary_text: str
    risk_flags: list[ClinicalRiskItem] = Field(default_factory=list)
    score_summary: ClinicalScoreSummary
    behavior_summary: ClinicalBehaviorSummary
    clinician_note: str
