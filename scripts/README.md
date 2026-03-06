# scripts

- `dev-web.sh`: run Next.js app (`apps/web`) in development mode.
  - default: `USE_FIREBASE_AUTH_EMULATOR=false` (real Firebase Auth)
  - emulator mode: `USE_FIREBASE_AUTH_EMULATOR=true`
- `dev-api.sh`: run FastAPI app (`apps/api`) in development mode.
  - default: `USE_FIREBASE_AUTH_EMULATOR=false` (real Firebase token verification)
  - emulator mode: `USE_FIREBASE_AUTH_EMULATOR=true`
- `dev-auth-emulator.sh`: run Firebase Auth Emulator (`demo-mindsight`, auth only).
- `auth-emulator-e2e.mjs`: run Firebase Auth Emulator email verification/reset link E2E checks.
- `db-up.sh`: start local PostgreSQL container.
- `db-down.sh`: stop local PostgreSQL container.
- `docker-up.sh`: build and run Docker Compose stack (`postgres + api + web`, optional auth emulator).
- `docker-down.sh`: stop Docker Compose services.
- `lint.sh`: run workspace and API lint checks.
- `test.sh`: run workspace and API test checks.
- `smoke.sh`: run lightweight web/API smoke checks.
