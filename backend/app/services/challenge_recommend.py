import re
from collections.abc import Iterable

DEFAULT_WINDOW_DAYS = 14
DEFAULT_SIMILARITY_THRESHOLD = 0.55
DEFAULT_REPEATABLE_TECHNIQUES = [
    "cognitive_reframe",
    "catastrophizing_check",
    "self_compassion_reframe",
]

DEFAULT_CHALLENGE_CATALOG: list[dict[str, str]] = [
    {"name": "사실-감정-해석 3칸 기록", "technique": "cognitive_reframe"},
    {"name": "자동사고 근거/반증 3줄 쓰기", "technique": "cognitive_reframe"},
    {"name": "최악 시나리오 확률 다시 계산", "technique": "catastrophizing_check"},
    {"name": "행동활성화 10분 산책 후 감정 기록", "technique": "behavioral_activation"},
    {"name": "5분 복식호흡 + 몸감각 관찰", "technique": "anxiety_regulation"},
    {"name": "걱정시간 15분 예약하기", "technique": "worry_scheduling"},
    {"name": "수면 루틴 체크리스트 1회 실행", "technique": "sleep_hygiene"},
    {"name": "자기비난 문장을 균형문장으로 바꾸기", "technique": "self_compassion_reframe"},
    {"name": "감사/성취 3가지 짧게 적기", "technique": "positive_data_log"},
]

ALL_TECHNIQUES = sorted({c["technique"] for c in DEFAULT_CHALLENGE_CATALOG} | {"general"})


def default_challenge_policy() -> dict[str, object]:
    return {
        "window_days": DEFAULT_WINDOW_DAYS,
        "similarity_threshold": DEFAULT_SIMILARITY_THRESHOLD,
        "repeatable_techniques": list(DEFAULT_REPEATABLE_TECHNIQUES),
    }


def normalize_challenge_policy(raw: dict | None) -> dict[str, object]:
    base = default_challenge_policy()
    if not isinstance(raw, dict):
        return base

    window_raw = raw.get("window_days", base["window_days"])
    sim_raw = raw.get("similarity_threshold", base["similarity_threshold"])
    rep_raw = raw.get("repeatable_techniques", base["repeatable_techniques"])

    try:
        window = int(window_raw)
    except Exception:
        window = int(base["window_days"])
    window = max(1, min(60, window))

    try:
        similarity = float(sim_raw)
    except Exception:
        similarity = float(base["similarity_threshold"])
    similarity = max(0.2, min(0.95, similarity))

    repeatable: list[str] = []
    if isinstance(rep_raw, list):
        for x in rep_raw:
            t = str(x).strip()
            if t and t in ALL_TECHNIQUES and t not in repeatable:
                repeatable.append(t)

    if not repeatable:
        repeatable = list(DEFAULT_REPEATABLE_TECHNIQUES)

    return {
        "window_days": window,
        "similarity_threshold": similarity,
        "repeatable_techniques": repeatable,
    }


def normalize_challenge_key(text: str) -> str:
    lowered = text.strip().lower()
    cleaned = re.sub(r"[^0-9a-z가-힣]+", "", lowered)
    return cleaned[:100]


def _tokenize(text: str) -> set[str]:
    tokens = re.findall(r"[0-9a-z가-힣]{2,}", text.lower())
    return set(tokens)


def _similarity(a: str, b: str) -> float:
    ta, tb = _tokenize(a), _tokenize(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    union = len(ta | tb)
    return inter / max(1, union)


def pick_non_duplicate_challenges(
    *,
    llm_suggestions: Iterable[str],
    recent_challenge_names: Iterable[str],
    recent_techniques: Iterable[str],
    size: int = 3,
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    repeatable_techniques: Iterable[str] | None = None,
) -> list[str]:
    repeatable_set = set(repeatable_techniques or DEFAULT_REPEATABLE_TECHNIQUES)

    recent_names = [x.strip() for x in recent_challenge_names if x and x.strip()]
    recent_keys = {normalize_challenge_key(x) for x in recent_names}
    blocked_techniques = {x.strip() for x in recent_techniques if x and x.strip()}

    candidates: list[dict[str, str]] = []
    for name in llm_suggestions:
        txt = str(name).strip()
        if txt:
            candidates.append({"name": txt[:160], "technique": detect_technique(txt)})

    candidates.extend(DEFAULT_CHALLENGE_CATALOG)

    picked: list[str] = []
    used_techniques: set[str] = set()

    for cand in candidates:
        name = cand["name"]
        technique = cand["technique"]
        key = normalize_challenge_key(name)
        repeatable = technique in repeatable_set

        if key in recent_keys:
            continue

        if (not repeatable) and any(_similarity(name, old) >= similarity_threshold for old in recent_names):
            continue

        if (not repeatable) and technique in blocked_techniques:
            continue

        if (not repeatable) and technique in used_techniques:
            continue

        picked.append(name)
        used_techniques.add(technique)
        if len(picked) >= size:
            return picked

    for cand in candidates:
        if len(picked) >= size:
            break
        name = cand["name"]
        key = normalize_challenge_key(name)
        if key in recent_keys or name in picked:
            continue
        picked.append(name)

    return picked[:size]


def detect_technique(challenge_name: str) -> str:
    text = challenge_name.lower()
    if any(k in text for k in ["수면", "sleep", "각성", "잠"]):
        return "sleep_hygiene"
    if any(k in text for k in ["산책", "행동", "활동", "실험"]):
        return "behavioral_activation"
    if any(k in text for k in ["호흡", "불안", "걱정"]):
        return "anxiety_regulation"
    if any(k in text for k in ["왜곡", "자동사고", "재해석", "균형", "반증"]):
        return "cognitive_reframe"
    if any(k in text for k in ["최악", "파국", "catastroph"]):
        return "catastrophizing_check"
    if any(k in text for k in ["자기비난", "수치심", "자책"]):
        return "self_compassion_reframe"
    if any(k in text for k in ["걱정시간", "예약"]):
        return "worry_scheduling"
    if any(k in text for k in ["감사", "성취", "강점"]):
        return "positive_data_log"
    return "general"
