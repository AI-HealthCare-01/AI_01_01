from datetime import date

from app.insights.models import (
    CbtConversationMessage,
    CbtPlannerAction,
    CbtSessionCreateRequest,
)
from app.insights.store import InsightsStore


def test_thought_summary_prefers_deeper_belief_hypothesis() -> None:
    state = {
        "situation": "프로젝트 회의에서 제안이 반려됐다.",
        "automatic_thoughts": ["프로젝트가 안돼서 속상하다"],
        "core_belief_hypotheses": [
            {"text": "성과를 내지 못하면 나는 가치가 없다", "confidence": 0.71}
        ],
    }

    thought = InsightsStore._thought_summary(state)
    assert thought is not None
    assert "성과" in thought
    assert "가치" in thought


def test_thought_summary_uses_inferred_root_belief_when_only_surface_thought_exists() -> None:
    state = {
        "situation": "회의 후 마음이 가라앉지 않았다.",
        "automatic_thoughts": ["프로젝트가 안돼서 속상하다"],
    }

    thought = InsightsStore._thought_summary(state)
    assert thought == "성과를 내지 못하면 나는 존재 가치가 없다"


def test_balanced_statement_fallback_is_based_on_root_thought() -> None:
    state = {
        "situation": "업무 피드백 이후 불안이 커졌다.",
        "automatic_thoughts": ["나는 또 실패할 거야"],
        "evidence_against": ["지난달에는 같은 유형의 일을 끝까지 마무리했다"],
        "balanced_statement": "나는 또 실패할 거야",
    }

    balanced = InsightsStore._balanced_statement_summary(state)
    assert balanced is not None
    assert "한 가지로 단정하지" in balanced
    assert "지난달에는 같은 유형의 일을 끝까지 마무리했다" in balanced


def test_create_session_uses_client_structured_state_without_regeneration(tmp_path) -> None:
    store = InsightsStore(tmp_path / "insights.db")

    class _FailIfCalledLlm:
        def generate_turn(self, *args, **kwargs):  # type: ignore[no-untyped-def]
            raise AssertionError("generate_turn_should_not_be_called")

    store._cbt_llm = _FailIfCalledLlm()  # type: ignore[assignment]

    payload = CbtSessionCreateRequest(
        date=date.today(),
        state={
            "situation": "프로젝트 회의에서 피드백을 받아 위축됐다.",
            "automatic_thoughts": ["성과를 못 내면 나는 가치가 없을 거야"],
            "emotions": [{"name": "불안", "intensity": 75}],
            "behaviors": ["대화를 피함"],
            "balanced_statement": "성과가 흔들려도 내 가치가 사라지는 것은 아니다.",
            "evidence_for": ["최근 일정이 지연됐다."],
            "evidence_against": ["지난 분기에 비슷한 상황을 해결한 경험이 있다."],
            "distortion_candidates": [],
            "intermediate_belief_hypotheses": [],
            "core_belief_hypotheses": [
                {"text": "성과를 내지 못하면 나는 가치가 없다", "confidence": 0.81, "expose_to_user": True}
            ],
            "risk_flags": {
                "functional_impairment_flag": False,
                "self_harm_flag": False,
                "suicide_risk_level": 0,
                "violence_risk_flag": False,
            },
        },
        conversation=[
            CbtConversationMessage(role="assistant", content="오늘 어떤 장면이 가장 어려웠나요?"),
            CbtConversationMessage(role="user", content="회의에서 피드백을 듣고 제가 부족하다고 느꼈어요."),
        ],
        planner_action=CbtPlannerAction.review_evidence,
        selected_action_kind="none",
    )

    response = store.create_cbt_session(user_id="user_test", payload=payload)

    assert response.summary.thought_summary == "성과를 내지 못하면 나는 가치가 없다"
    assert response.summary.balanced_statement_summary == "성과가 흔들려도 내 가치가 사라지는 것은 아니다."
