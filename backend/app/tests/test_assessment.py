import os
import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_mvp.db"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "60"

from app.db.session import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.scoring import score_phq9  # noqa: E402


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
async def setup_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.mark.anyio
async def test_phq9_create_and_get() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            "/auth/signup",
            json={"email": "user2@example.com", "password": "StrongPass123", "nickname": "rio"},
        )
        login_res = await client.post(
            "/auth/login",
            json={"email": "user2@example.com", "password": "StrongPass123"},
        )
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        create_res = await client.post(
            "/assessments/phq9",
            headers=headers,
            json={"answers": {"q1": 1, "q2": 2, "q3": 0, "q4": 1, "q5": 0, "q6": 1, "q7": 0, "q8": 1, "q9": 0}},
        )
        assert create_res.status_code == 201
        created = create_res.json()
        assert created["total_score"] == 6
        assert created["severity"] == "mild"
        assert "description" in created
        assert "참고용" in created["disclaimer"]
        assert "진단 아님" in created["disclaimer"]

        list_res = await client.get("/assessments/phq9", headers=headers)
        assert list_res.status_code == 200
        items = list_res.json()
        assert len(items) == 1
        assert items[0]["id"] == created["id"]

        detail_res = await client.get(f"/assessments/phq9/{created['id']}", headers=headers)
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert detail["answers"]["q2"] == 2


@pytest.mark.anyio
async def test_phq9_preview_without_auth() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        preview_res = await client.post(
            "/assessments/phq9/preview",
            json={"answers": {"q1": 2, "q2": 2, "q3": 1, "q4": 1, "q5": 1, "q6": 1, "q7": 1, "q8": 1, "q9": 0}},
        )
        assert preview_res.status_code == 200
        data = preview_res.json()
        assert data["total_score"] == 10
        assert data["severity"] == "moderate"
        assert "참고용" in data["disclaimer"]


@pytest.mark.parametrize(
    ("scores", "expected_total", "expected_severity"),
    [
        ([0, 0, 0, 0, 0, 0, 0, 0, 0], 0, "minimal"),
        ([1, 1, 1, 1, 1, 0, 0, 0, 0], 5, "mild"),
        ([2, 1, 1, 1, 1, 1, 1, 1, 1], 10, "moderate"),
        ([3, 2, 2, 2, 2, 1, 1, 1, 1], 15, "moderately_severe"),
        ([3, 3, 3, 3, 3, 3, 3, 3, 3], 27, "severe"),
    ],
)
def test_score_phq9_boundaries(scores: list[int], expected_total: int, expected_severity: str) -> None:
    result = score_phq9(scores)
    assert result["total_score"] == expected_total
    assert result["severity"] == expected_severity
    assert "진단이 아닙니다" in result["description"]


def test_score_phq9_raises_on_invalid_input() -> None:
    with pytest.raises(ValueError):
        score_phq9([1, 1, 1])
    with pytest.raises(ValueError):
        score_phq9([0, 0, 0, 0, 0, 0, 0, 0, 4])
