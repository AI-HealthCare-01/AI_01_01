from app.insights.cbt.engine import (
    ACTION_CONFIRM_CORE_YES,
    ACTION_SKIP_STAGE,
    CbtThoughtRecordEngine,
)


def _today_record() -> dict[str, object]:
    return {
        "exists": True,
        "date": "2026-03-07",
        "mood_label": "불안",
        "mood_intensity_0_100": 62,
        "sleep_hours": 5.5,
        "energy_1_5": 2,
        "caffeine_after_2pm_flag": True,
        "exercise_bucket": "none",
    }


def test_bootstrap_returns_prefill_and_action_replies() -> None:
    engine = CbtThoughtRecordEngine()
    turn = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )

    assert turn.phase_key == "situation"
    assert turn.subphase_key == "topic"
    assert all("체크인" not in message for message in turn.assistant_messages)
    assert any(item.get("type") == "prefill" and item.get("label") == "학업/일" for item in turn.quick_replies)
    assert any(item.get("type") == "action" and item.get("action_id") == "reset_topic" for item in turn.quick_replies)


def test_quick_reply_action_skip_is_blocked_in_situation_stage() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )

    blocked = engine.process_turn(
        raw_state=bootstrap.state,
        user_input="",
        quick_reply_action_id=ACTION_SKIP_STAGE,
    )

    assert blocked.phase_key == "situation"
    assert blocked.subphase_key == "topic"
    assert any(item.get("action_id") == "reset_topic" for item in blocked.quick_replies)
    assert any(item.get("action_id") == "end_session" for item in blocked.quick_replies)
    assert all(item.get("action_id") != "skip_stage" for item in blocked.quick_replies)


def test_evidence_quick_sets_are_strictly_separated_by_subphase() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )

    to_emotion = engine.process_turn(
        raw_state=bootstrap.state,
        user_input="회의 발표를 앞두고 머리가 하얘졌어요.",
    )
    to_emotion_score = engine.process_turn(
        raw_state=to_emotion.state,
        user_input="불안",
    )
    to_thought = engine.process_turn(
        raw_state=to_emotion_score.state,
        user_input="70",
    )
    to_probe = engine.process_turn(
        raw_state=to_thought.state,
        user_input="실패할까 봐 무서워요.",
    )
    to_core_confirm = engine.process_turn(
        raw_state=to_probe.state,
        user_input="나는 무가치해요",
    )
    assert to_core_confirm.phase_key == "thought"
    assert to_core_confirm.subphase_key == "core_confirm"
    assert any(item.get("action_id") == ACTION_CONFIRM_CORE_YES for item in to_core_confirm.quick_replies)

    to_evidence_for = engine.process_turn(
        raw_state=to_core_confirm.state,
        user_input="",
        quick_reply_action_id=ACTION_CONFIRM_CORE_YES,
    )

    assert to_evidence_for.phase_key == "evidence"
    assert to_evidence_for.subphase_key == "evidence_for"
    labels_for = {item.get("label", "") for item in to_evidence_for.quick_replies}
    assert "관찰한 사실" in labels_for
    assert "예외였던 순간" not in labels_for

    to_evidence_against = engine.process_turn(
        raw_state=to_evidence_for.state,
        user_input="관찰한 사실: 상사가 표정이 굳어 보였어요.",
    )
    to_evidence_against = engine.process_turn(
        raw_state=to_evidence_against.state,
        user_input="내 경험: 최근 비슷한 발표에서 실수했어요.",
    )
    assert to_evidence_against.phase_key == "evidence"
    assert to_evidence_against.subphase_key == "evidence_against"
    labels_against = {item.get("label", "") for item in to_evidence_against.quick_replies}
    assert "예외였던 순간" in labels_against
    assert "관찰한 사실" not in labels_against


def test_auto_thought_skip_moves_to_core_probe_and_third_skip_blocks() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(
        raw_state=bootstrap.state,
        user_input="회의 발표를 앞두고 머리가 하얘졌어요.",
    )
    to_emotion_score = engine.process_turn(
        raw_state=to_emotion.state,
        user_input="불안",
    )
    to_thought = engine.process_turn(
        raw_state=to_emotion_score.state,
        user_input="70",
    )

    to_core_probe = engine.process_turn(
        raw_state=to_thought.state,
        user_input="",
        quick_reply_action_id=ACTION_SKIP_STAGE,
    )
    assert to_core_probe.phase_key == "thought"
    assert to_core_probe.subphase_key == "core_probe"

    blocked = engine.process_turn(
        raw_state=to_core_probe.state,
        user_input="",
        quick_reply_action_id=ACTION_SKIP_STAGE,
    )
    assert blocked.phase_key == "thought"
    assert blocked.subphase_key == "core_probe"

    blocked = engine.process_turn(
        raw_state=blocked.state,
        user_input="",
        quick_reply_action_id=ACTION_SKIP_STAGE,
    )
    assert blocked.phase_key == "thought"
    assert blocked.subphase_key == "core_blocked"
    assert any(item.get("action_id") == "reset_topic" for item in blocked.quick_replies)
    assert any(item.get("action_id") == "end_session" for item in blocked.quick_replies)


def test_invalid_input_in_soft_required_stage_includes_retry_skip_reset() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(
        raw_state=bootstrap.state,
        user_input="회의 발표를 앞두고 머리가 하얘졌어요.",
    )
    invalid = engine.process_turn(
        raw_state=to_emotion.state,
        user_input="!",
    )

    assert invalid.phase_key == "emotion"
    action_ids = {item.get("action_id") for item in invalid.quick_replies if item.get("type") == "action"}
    assert {"retry_stage", "reset_topic", "end_session"}.issubset(action_ids)


def test_prefill_rules_append_colon_except_numeric_intensity() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    topic_prefill = [item for item in bootstrap.quick_replies if item.get("type") == "prefill"]
    assert all(str(item.get("fill_text", "")).endswith(": ") for item in topic_prefill)

    to_emotion = engine.process_turn(
        raw_state=bootstrap.state,
        user_input="학업/일: 발표 준비가 밀렸어요.",
    )
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안: ")
    intensity_prefill = [item for item in to_intensity.quick_replies if item.get("type") == "prefill"]
    assert {item.get("fill_text") for item in intensity_prefill} == {"30", "50", "70", "90"}


def test_core_confirm_step_is_shown_before_evidence_and_prompt_contains_core() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="발표 직전에 숨이 막히는 느낌이 들어요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안: ")
    to_thought = engine.process_turn(raw_state=to_intensity.state, user_input="70")
    to_confirm = engine.process_turn(raw_state=to_thought.state, user_input="결국 실수해서 신뢰를 잃을 것 같아요.")

    assert to_confirm.phase_key == "thought"
    assert to_confirm.subphase_key == "core_confirm"
    assert any("맞을까요" in message for message in to_confirm.assistant_messages)

    to_evidence = engine.process_turn(
        raw_state=to_confirm.state,
        user_input="",
        quick_reply_action_id=ACTION_CONFIRM_CORE_YES,
    )
    assert to_evidence.phase_key == "evidence"
    assert to_evidence.subphase_key == "evidence_for"
    core = str(to_evidence.state.get("core_message_text") or "").strip()
    assert core
    assert any(core in message for message in to_evidence.assistant_messages)
