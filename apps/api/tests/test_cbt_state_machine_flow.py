from app.insights.cbt.engine import (
    ACTION_CONFIRM_CORE_YES,
    ACTION_NEXT_STAGE,
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
    to_evidence_against = engine.process_turn(raw_state=to_evidence_against.state, user_input="", quick_reply_action_id=ACTION_NEXT_STAGE)
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


def test_emotion_free_text_picks_emotion_label_not_first_word() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(
        raw_state=bootstrap.state,
        user_input="시험 범위가 너무 넓어서 막막해요.",
    )
    to_emotion = engine.process_turn(
        raw_state=to_emotion.state,
        user_input="복습할게 너무 많아서 부담스럽고 잠을 못 자서 너무 피곤해요.",
    )

    assert to_emotion.phase_key == "emotion"
    assert to_emotion.subphase_key == "intensity"
    assert to_emotion.state.get("emotion_label") in {"불안", "피곤함"}
    assert all("복습할게" not in message for message in to_emotion.assistant_messages)


def test_emotion_none_response_skips_to_thought_without_first_word_label() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(
        raw_state=bootstrap.state,
        user_input="업무가 너무 많이 밀렸어요.",
    )
    to_thought = engine.process_turn(
        raw_state=to_emotion.state,
        user_input="걍 뭐 별감정 없어",
    )

    assert to_thought.phase_key == "thought"
    assert to_thought.subphase_key == "auto_thought"
    assert to_thought.state.get("emotion_label") in {"", None}
    assert all("걍의 정도" not in message for message in to_thought.assistant_messages)


def test_emotion_ambiguous_response_reprompts_with_examples() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="일이 너무 많이 밀렸어요.")
    ambiguous = engine.process_turn(raw_state=to_emotion.state, user_input="복합적이에요. 잘 모르겠어요.")

    assert ambiguous.phase_key == "emotion"
    assert ambiguous.subphase_key == "label"
    assert any("불안, 피곤함, 무기력함" in message for message in ambiguous.assistant_messages)


def test_emotion_tired_and_burdened_words_map_to_supported_label() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="요즘 일이 너무 많아서 고돼요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="고되다 힘들다")

    assert to_intensity.phase_key == "emotion"
    assert to_intensity.subphase_key == "intensity"
    assert any("부담감" in message or "정도를 숫자로" in message for message in to_intensity.assistant_messages)


def test_emotion_freeform_labels_move_to_intensity_without_loop() -> None:
    engine = CbtThoughtRecordEngine()
    cases = ("힘들다", "고되다", "답답하다", "버겁다", "착잡하다")

    for emotion_text in cases:
        bootstrap = engine.bootstrap(
            today_record=_today_record(),
            coach_nickname="은하코치",
            user_nickname="지음",
        )
        to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="요즘 복습할 게 너무 많아요.")
        to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input=emotion_text)

        assert to_intensity.phase_key == "emotion"
        assert to_intensity.subphase_key == "intensity"
        assert any("정도를 숫자로" in message for message in to_intensity.assistant_messages)
        assert all("가장 가까운 하나만" not in message for message in to_intensity.assistant_messages)


def test_emotion_intensity_invalid_input_gets_friendlier_retry() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="회의 생각만 하면 불안해요.")
    if to_emotion.subphase_key == "label":
        to_emotion = engine.process_turn(raw_state=to_emotion.state, user_input="불안")
    retry = engine.process_turn(raw_state=to_emotion.state, user_input="숫자로는 잘 모르겠어요")

    assert retry.phase_key == "emotion"
    assert retry.subphase_key == "intensity"
    assert any("30은 조금 불편함" in message or "40 / 60 / 80" in message for message in retry.assistant_messages)


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
    to_probe = engine.process_turn(raw_state=to_thought.state, user_input="결국 실수해서 신뢰를 잃을 것 같아요.")

    assert to_probe.phase_key == "thought"
    to_confirm = to_probe if to_probe.subphase_key == "core_confirm" else engine.process_turn(
        raw_state=to_probe.state,
        user_input="신뢰를 잃고 무능한 사람으로 보일까 봐요.",
    )

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


def test_core_confirm_accepts_manual_yes_text_and_advances() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="시험 결과를 보고 스스로가 너무 초라하게 느껴졌어요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안")
    to_thought = engine.process_turn(raw_state=to_intensity.state, user_input="80")
    to_probe = engine.process_turn(raw_state=to_thought.state, user_input="나는 실패작 같아요.")
    to_confirm = engine.process_turn(raw_state=to_probe.state, user_input="나는 실패작이야.")

    assert to_confirm.phase_key == "thought"
    assert to_confirm.subphase_key == "core_confirm"

    to_evidence = engine.process_turn(raw_state=to_confirm.state, user_input="맞아요")

    assert to_evidence.phase_key == "evidence"
    assert to_evidence.subphase_key == "evidence_for"


def test_core_confirm_accepts_natural_yes_phrase_and_advances() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="발표가 다가오면 숨이 턱 막혀요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안")
    to_thought = engine.process_turn(raw_state=to_intensity.state, user_input="70")
    to_probe = engine.process_turn(raw_state=to_thought.state, user_input="좀 쉬고 싶다는 생각이 계속 들어요.")
    to_confirm = engine.process_turn(raw_state=to_probe.state, user_input="좀 쉬고 싶다.")

    to_evidence = engine.process_turn(raw_state=to_confirm.state, user_input="그렇게 정리해도 됩니다.")

    assert to_evidence.phase_key == "evidence"
    assert to_evidence.subphase_key == "evidence_for"


def test_core_confirm_accepts_short_colloquial_yes_variants() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="발표 직전만 되면 가슴이 철렁해요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안")
    to_thought = engine.process_turn(raw_state=to_intensity.state, user_input="72")
    to_probe = engine.process_turn(raw_state=to_thought.state, user_input="무능해 보일 것 같아.")
    to_confirm = engine.process_turn(raw_state=to_probe.state, user_input="무능해보일것같아")

    for reply in ("ㅇㅇ", "맞으", "그런듯"):
        advanced = engine.process_turn(raw_state=to_confirm.state, user_input=reply)
        assert advanced.phase_key == "evidence"
        assert advanced.subphase_key == "evidence_for"


def test_thought_realistic_auto_thought_goes_to_core_confirm() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="발표 직전만 되면 긴장돼요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안")
    to_thought = engine.process_turn(raw_state=to_intensity.state, user_input="70")
    to_confirm = engine.process_turn(raw_state=to_thought.state, user_input="또 망할 것 같아요.")

    assert to_confirm.phase_key == "thought"
    assert to_confirm.subphase_key == "core_confirm"


def test_evidence_against_empty_input_returns_scaffold_not_invalid() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="발표 앞두고 너무 떨려요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안")
    to_thought = engine.process_turn(raw_state=to_intensity.state, user_input="70")
    to_probe = engine.process_turn(raw_state=to_thought.state, user_input="무시당할 것 같아요.")
    to_confirm = engine.process_turn(raw_state=to_probe.state, user_input="무시당할 것 같아.")
    to_for = engine.process_turn(raw_state=to_confirm.state, user_input="ㅇㅇ")
    to_for_more = engine.process_turn(raw_state=to_for.state, user_input="상사가 표정이 굳어 보였어요.")
    to_against = engine.process_turn(
        raw_state=to_for_more.state,
        user_input="",
        quick_reply_action_id=ACTION_NEXT_STAGE,
    )
    scaffold = engine.process_turn(raw_state=to_against.state, user_input="")

    assert scaffold.phase_key == "evidence"
    assert scaffold.subphase_key == "evidence_against"
    assert any("예외" in message or "사실과 해석" in message for message in scaffold.assistant_messages)


def test_evidence_short_text_next_intent_moves_to_next_substep() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="발표 앞두고 너무 떨려요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안")
    to_thought = engine.process_turn(raw_state=to_intensity.state, user_input="70")
    to_probe = engine.process_turn(raw_state=to_thought.state, user_input="무시당할 것 같아요.")
    to_confirm = engine.process_turn(raw_state=to_probe.state, user_input="무시당할 것 같아.")
    to_for = engine.process_turn(raw_state=to_confirm.state, user_input="ㅇㅇ")
    moved = engine.process_turn(raw_state=to_for.state, user_input="다음으로")

    assert moved.phase_key == "evidence"
    assert moved.subphase_key == "evidence_against"


def test_evidence_low_quality_inputs_are_not_appended() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="발표 앞두고 너무 떨려요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안")
    to_thought = engine.process_turn(raw_state=to_intensity.state, user_input="70")
    to_probe = engine.process_turn(raw_state=to_thought.state, user_input="무시당할 것 같아요.")
    to_confirm = engine.process_turn(raw_state=to_probe.state, user_input="무시당할 것 같아.")
    to_for = engine.process_turn(raw_state=to_confirm.state, user_input="ㅇㅇ")
    low_quality = engine.process_turn(raw_state=to_for.state, user_input="몰루")

    assert low_quality.phase_key == "evidence"
    assert low_quality.subphase_key == "evidence_for"
    assert low_quality.state.get("evidence_for") == []
    assert any("사실" in message or "다음으로" in message for message in low_quality.assistant_messages)


def test_evidence_prefix_only_and_generic_against_inputs_do_not_count() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="발표 앞두고 너무 떨려요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안")
    to_thought = engine.process_turn(raw_state=to_intensity.state, user_input="70")
    to_probe = engine.process_turn(raw_state=to_thought.state, user_input="무시당할 것 같아요.")
    to_confirm = engine.process_turn(raw_state=to_probe.state, user_input="무시당할 것 같아.")
    to_for = engine.process_turn(raw_state=to_confirm.state, user_input="ㅇㅇ")
    to_for_more = engine.process_turn(raw_state=to_for.state, user_input="표정이 굳어 보였어요.")
    to_against = engine.process_turn(raw_state=to_for_more.state, user_input="ㅇㅇ")
    low_quality = engine.process_turn(raw_state=to_against.state, user_input="확인되지 않은 부분:")
    low_quality = engine.process_turn(raw_state=low_quality.state, user_input="반대 근거: 반대임")

    assert low_quality.phase_key == "evidence"
    assert low_quality.subphase_key == "evidence_against"
    assert low_quality.state.get("evidence_against") == []


def test_evidence_accepts_two_items_then_text_next_moves_forward() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="발표 앞두고 너무 떨려요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안")
    to_thought = engine.process_turn(raw_state=to_intensity.state, user_input="70")
    to_probe = engine.process_turn(raw_state=to_thought.state, user_input="무시당할 것 같아요.")
    to_confirm = engine.process_turn(raw_state=to_probe.state, user_input="무시당할 것 같아.")
    to_for = engine.process_turn(raw_state=to_confirm.state, user_input="ㅇㅇ")
    one = engine.process_turn(raw_state=to_for.state, user_input="표정이 굳어 보였어요.")
    two = engine.process_turn(raw_state=one.state, user_input="내가 중간에 말을 멈췄어요.")
    moved = engine.process_turn(raw_state=two.state, user_input="ㅇㅇ")

    assert len(moved.state.get("evidence_for") or []) == 2
    assert moved.phase_key == "evidence"
    assert moved.subphase_key == "evidence_against"


def test_invalid_response_softens_before_summary_close() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="회의 발표를 앞두고 머리가 하얘졌어요.")
    first = engine.process_turn(raw_state=to_emotion.state, user_input="!")
    second = engine.process_turn(raw_state=first.state, user_input="!")
    third = engine.process_turn(raw_state=second.state, user_input="!")

    assert first.phase_key == "emotion"
    assert second.phase_key == "emotion"
    assert third.phase_key == "emotion"
    assert third.conversation_closed is False


def test_core_refine_uses_revised_sentence_instead_of_original_loop() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="시험 결과를 보고 너무 무너졌어요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안")
    to_thought = engine.process_turn(raw_state=to_intensity.state, user_input="85")
    to_probe = engine.process_turn(raw_state=to_thought.state, user_input="나는 실패작 같아요.")
    to_confirm = engine.process_turn(raw_state=to_probe.state, user_input="나는 실패작이야.")

    to_refine = engine.process_turn(raw_state=to_confirm.state, user_input="아니요")
    assert to_refine.phase_key == "thought"
    assert to_refine.subphase_key == "core_refine"

    to_reconfirm = engine.process_turn(raw_state=to_refine.state, user_input="나는 실패작이 아니라 지금 많이 지쳐 있어.")

    assert to_reconfirm.phase_key == "thought"
    assert to_reconfirm.subphase_key == "core_confirm"
    assert any("지금 많이 지쳐 있어" in message for message in to_reconfirm.assistant_messages)


def test_alternative_thought_moves_directly_to_summary_advice() -> None:
    engine = CbtThoughtRecordEngine()
    bootstrap = engine.bootstrap(
        today_record=_today_record(),
        coach_nickname="은하코치",
        user_nickname="지음",
    )
    to_emotion = engine.process_turn(raw_state=bootstrap.state, user_input="발표 전에 숨이 막히고 머리가 새하얘져요.")
    to_intensity = engine.process_turn(raw_state=to_emotion.state, user_input="불안")
    to_thought = engine.process_turn(raw_state=to_intensity.state, user_input="75")
    to_probe = engine.process_turn(raw_state=to_thought.state, user_input="결국 망치고 신뢰를 잃을 것 같아요.")
    to_confirm = engine.process_turn(raw_state=to_probe.state, user_input="나는 무능한 사람처럼 보일 거야.")
    to_evidence_for = engine.process_turn(
        raw_state=to_confirm.state,
        user_input="맞아요",
    )
    to_evidence_against = engine.process_turn(
        raw_state=to_evidence_for.state,
        user_input="",
        quick_reply_action_id=ACTION_NEXT_STAGE,
    )
    to_against = engine.process_turn(
        raw_state=to_evidence_against.state,
        user_input="최근에도 발표를 끝까지 해낸 적이 있어요.",
    )
    to_alternative = engine.process_turn(
        raw_state=to_against.state,
        user_input="",
        quick_reply_action_id=ACTION_NEXT_STAGE,
    )
    to_summary = engine.process_turn(
        raw_state=to_alternative.state,
        user_input="실수할 수는 있지만, 한 번의 발표로 내 가치가 결정되지는 않아요.",
    )

    assert to_summary.phase_key == "summary"
    assert to_summary.subphase_key == "summary"
    assert to_summary.conversation_closed is True
    assert any("세션을 저장하면" in message for message in to_summary.assistant_messages)
    assert all("약속" not in message for message in to_summary.assistant_messages)
