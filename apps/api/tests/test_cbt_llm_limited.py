from __future__ import annotations

import json
from urllib import error

from app.insights.cbt.engine import CbtThoughtRecordEngine
from app.insights.cbt.llm_limited import CbtLimitedLlm


class _FakeResponse:
    def __init__(self, body: str) -> None:
        self._body = body

    def read(self) -> bytes:
        return self._body.encode("utf-8")

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


def test_compose_session_closure_prompt_uses_real_state_fields(monkeypatch) -> None:
    captured: dict[str, str] = {}
    llm = CbtLimitedLlm()
    llm.api_key = "test-key"

    def _fake_call_json(*, prompt: str, fallback_reason: str):
        captured["prompt"] = prompt
        captured["fallback_reason"] = fallback_reason
        return {"summary": "요약", "advice": "조언"}, None

    monkeypatch.setattr(llm, "_call_json", _fake_call_json)
    llm.compose_session_closure(
        current_state={
            "situation_text": "복습할 게 많아서 잠을 못 잤어요.",
            "emotion_label": "부담",
            "core_message_text": "난 결국 안 될 것 같아요.",
            "alternative_thought": "지금 벅차도 오늘 할 분량만 보면 돼요.",
        }
    )

    prompt = captured["prompt"]
    assert "closure_focus=" in prompt
    assert "복습할 게 많아서 잠을 못 잤어요." in prompt
    assert "부담" in prompt
    assert "난 결국 안 될 것 같아요." in prompt
    assert "잘할 수 있어요" in prompt


def test_compose_response_prompt_includes_recent_assistant_and_repeat_rules(monkeypatch) -> None:
    captured: dict[str, str] = {}
    llm = CbtLimitedLlm()
    llm.api_key = "test-key"

    def _fake_call_json(*, prompt: str, fallback_reason: str):
        captured["prompt"] = prompt
        captured["fallback_reason"] = fallback_reason
        return {"empathy": "", "restatement": "", "next_question": "다음 질문"}, None

    monkeypatch.setattr(llm, "_call_json", _fake_call_json)
    llm.compose_response(
        stage="thought",
        user_text="또 망할 것 같아요.",
        current_state={
            "turn_log": [
                {"role": "assistant", "content": "좋아요. 이어서 진행해볼게요."},
                {"role": "assistant", "content": "그 생각이 반복되면 지치기 쉬워요."},
            ]
        },
        next_question="지금 가장 크게 걸리는 생각을 한 문장으로 적어볼까요?",
        fallback_empathy="그 상황이 많이 힘들었겠어요.",
    )

    prompt = captured["prompt"]
    assert "recent_assistant_messages=" in prompt
    assert "좋아요. 이어서 진행해볼게요." in prompt
    assert "핵심 단어 또는 표현을 최소 1개 반영" in prompt
    assert "재진술은 원문을 거의 반복하게 되면 빈 문자열" in prompt


def test_call_json_uses_specific_fallback_reason_suffixes(monkeypatch) -> None:
    llm = CbtLimitedLlm()
    llm.api_key = "test-key"

    def _raise_http(*args, **kwargs):
        raise error.HTTPError("https://example.com", 500, "boom", hdrs=None, fp=None)

    monkeypatch.setattr("app.insights.cbt.llm_limited.request.urlopen", _raise_http)
    _, meta = llm._call_json(prompt="{}", fallback_reason="composer_failed")
    assert meta.fallback_reason == "composer_failed_http_error"


def test_call_json_marks_invalid_shape(monkeypatch) -> None:
    llm = CbtLimitedLlm()
    llm.api_key = "test-key"
    body = json.dumps({"choices": [{"message": {"content": "[]"}}]})

    monkeypatch.setattr("app.insights.cbt.llm_limited.request.urlopen", lambda *args, **kwargs: _FakeResponse(body))
    _, meta = llm._call_json(prompt="{}", fallback_reason="session_closure_failed")
    assert meta.fallback_reason == "session_closure_failed_invalid_shape"


def test_session_closure_fallback_uses_multiple_state_fields_without_cliche() -> None:
    engine = CbtThoughtRecordEngine()
    state = engine._base_state(
        today_record={"exists": True},
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    state["situation_text"] = "복습할 게 많아서 잠을 못 잤어요."
    state["emotion_label"] = "부담"
    state["core_message_text"] = "난 결국 안 될 것 같아요."
    state["alternative_thought"] = "지금 벅차도 오늘 할 분량만 보면 돼요."

    messages, _ = engine._compose_session_closure(state)

    joined = " ".join(messages)
    assert "복습할 게 많아서 잠을 못 잤어요." in joined
    assert "부담" in joined
    assert "지금 벅차도 오늘 할 분량만 보면 돼요." in joined
    assert "괜찮아질 거예요" not in joined
