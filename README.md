# Mental Health Check API + Frontend (MVP)

FastAPI(백엔드) + React(Vite, 프론트) 기반의 멘탈 체크 MVP 프로젝트입니다.

주의: 이 프로젝트의 결과는 **참고용**이며, **의료적 진단이 아닙니다**.

## Features
- 회원가입 / 로그인 (JWT Access Token, 30분 만료)
- PHQ-9 설문 저장 / 조회
- PHQ-9 점수 계산 및 위험 단계 분류
- PostgreSQL + SQLAlchemy 2.0 async
- Docker Compose로 API + DB 실행
- React 프론트에서 백엔드 연동 (Auth + PHQ-9)

## Tech Stack
- Backend: Python 3.11, FastAPI, SQLAlchemy 2.0 (async), asyncpg
- Auth: bcrypt, PyJWT
- DB: PostgreSQL 16
- Frontend: React + Vite + TypeScript
- Infra: Docker / Docker Compose

## Project Structure
```text
.
├── backend
│   ├── app
│   │   ├── main.py
│   │   ├── api/
│   │   ├── core/
│   │   ├── db/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── tests/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── frontend
├── AI
├── worker
├── docker-compose.yml
└── .env.example
```

## Environment Variables
Docker 기준으로 2개 파일을 사용합니다.
- 루트 `.env`: compose 포트/치환 변수
- `backend/.env`: FastAPI 앱 내부 설정

```env
APP_NAME=Mental Health Check API
API_V1_PREFIX=
SECRET_KEY=change-this-to-a-long-random-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/mental_health

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=mental_health
API_PORT=8001
FRONTEND_PORT=5173
VITE_API_BASE_URL=http://localhost:8001
```

## Run with Docker (권장)
```bash
cp .env.example .env
cp backend/.env.example backend/.env
docker compose up -d --build
```

- API: `http://localhost:8001`
- Swagger: `http://localhost:8001/docs`
- Frontend: `http://localhost:5173`

상태 확인:
```bash
docker compose ps
```

중지:
```bash
docker compose down
```

## Run Backend Locally
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
set -a; source .env; set +a
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

## Run Frontend Locally
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- 기본 API 대상: `http://localhost:8001`

## Test
```bash
cd backend
.venv/bin/pytest app/tests -q
```

## Main API Endpoints
- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me`
- `POST /assessments/phq9`
- `GET /assessments/phq9`
- `GET /assessments/phq9/{assessment_id}`

## Common Issues

### 1) Docker daemon not running
```bash
open -a Docker
docker info
```

### 2) Port conflict (`8000`/`8001` already in use)
`docker-compose.yml`의 `API_PORT` 또는 포트 매핑을 변경하세요.

### 3) `npm ERR! enoent ... package.json`
`frontend` 폴더에서 실행해야 합니다.
```bash
cd frontend
npm run dev
```

## Disclaimer
본 서비스는 자기 점검을 위한 참고 도구입니다. 의료 진단/치료 판단에 사용하지 마세요.
