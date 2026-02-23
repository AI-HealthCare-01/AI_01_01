from pydantic import BaseModel, ConfigDict, conint, confloat


LevelScore = conint(ge=0, le=4)
LikertScore = conint(ge=0, le=3)


class CheckPredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    phq_total: conint(ge=0, le=27)
    gad_total: conint(ge=0, le=21)
    sleep_total: conint(ge=0, le=9)
    context_risk_total: conint(ge=0, le=15)
    phq9_suicidal_ideation: LikertScore
    daily_functioning: LikertScore
    stressful_event: LikertScore
    social_support: LikertScore
    coping_skill: LikertScore
    motivation_for_change: LikertScore


class CheckPredictResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    prediction: LevelScore
    probabilities: dict[str, confloat(ge=0.0, le=1.0)]
    model_path: str


class MonitorPredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    window_days: conint(ge=7, le=28)
    phq_last: confloat(ge=0, le=27)
    phq_avg_window: confloat(ge=0, le=27)
    phq_delta: confloat(ge=-27, le=27)
    gad_last: confloat(ge=0, le=21)
    gad_avg_window: confloat(ge=0, le=21)
    gad_delta: confloat(ge=-21, le=21)
    sleep_last: confloat(ge=0, le=9)
    sleep_avg_window: confloat(ge=0, le=9)
    sleep_delta: confloat(ge=-9, le=9)
    context_risk_last: confloat(ge=0, le=15)
    context_risk_delta: confloat(ge=-15, le=15)
    mood_avg_window: confloat(ge=1, le=10)
    mood_delta: confloat(ge=-9, le=9)
    mood_std_window: confloat(ge=0, le=10)
    sleep_std_window: confloat(ge=0, le=10)
    worst_mood_7d: confloat(ge=1, le=10)
    max_drop_mood: confloat(ge=0, le=10)
    checkin_count_window: conint(ge=0, le=28)
    checkin_missing_days: conint(ge=0, le=28)
    exercise_days_window: conint(ge=0, le=28)
    journal_days_window: conint(ge=0, le=28)


class MonitorPredictResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    prediction: str
    probabilities: dict[str, confloat(ge=0.0, le=1.0)]
    model_path: str
