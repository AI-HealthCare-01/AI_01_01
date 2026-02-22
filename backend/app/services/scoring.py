from typing import Literal, TypedDict


DISCLAIMER_TEXT = "이 결과는 참고용이며, 진단 아님 안내입니다."
PHQ9Severity = Literal["minimal", "mild", "moderate", "moderately_severe", "severe"]


class PHQ9ScoreResult(TypedDict):
    total_score: int
    severity: PHQ9Severity
    description: str


def _severity_from_total(total_score: int) -> PHQ9Severity:
    if total_score <= 4:
        return "minimal"
    if total_score <= 9:
        return "mild"
    if total_score <= 14:
        return "moderate"
    if total_score <= 19:
        return "moderately_severe"
    return "severe"


def score_phq9(scores: list[int]) -> PHQ9ScoreResult:
    if len(scores) != 9:
        raise ValueError("PHQ-9 scores must contain exactly 9 items.")
    for idx, score in enumerate(scores, start=1):
        if type(score) is not int:
            raise ValueError(f"PHQ-9 item {idx} must be an integer between 0 and 3.")
        if score < 0 or score > 3:
            raise ValueError(f"PHQ-9 item {idx} must be between 0 and 3.")

    total_score = sum(scores)
    severity = _severity_from_total(total_score)
    description = (
        f"총점 {total_score}점으로 '{severity}' 범주입니다. "
        "참고용 결과이며 의료적 진단이 아닙니다."
    )
    return {
        "total_score": total_score,
        "severity": severity,
        "description": description,
    }


def calculate_phq9_total(answers: dict[str, int]) -> int:
    return sum(answers.values())


def get_phq9_severity(total_score: int) -> str:
    if total_score <= 4:
        return "최소 수준"
    if total_score <= 9:
        return "경미한 수준"
    if total_score <= 14:
        return "중간 수준"
    if total_score <= 19:
        return "다소 높은 수준"
    return "높은 수준"


def build_report(total_score: int, severity: str) -> str:
    return (
        f"PHQ-9 총점은 {total_score}점이며 참고 구간은 '{severity}'입니다. "
        "최근 수면, 활동량, 스트레스 패턴을 함께 기록해 변화 추이를 참고해 보세요."
    )
