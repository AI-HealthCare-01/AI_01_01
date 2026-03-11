from __future__ import annotations

import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path

from .models import (
    AccountContract,
    AccountStatus,
    ConsentContract,
    Gender,
    OnboardingContract,
    OnboardingStatus,
    ProfileContract,
    SessionContract,
)

CONSENT_TYPE_TO_FIELD = {
    "terms": "terms_required",
    "privacy": "privacy_required",
    "sensitive_data": "sensitive_data_required",
    "personalization": "personalization_optional",
    "model_improvement": "model_improvement_optional",
    "marketing": "marketing_optional",
}

REQUIRED_ASSESSMENT_ITEM_COUNTS = {
    "phq9": 9,
    "gad7": 7,
    "isi": 7,
}


class AuthStore:
    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS account_user (
                  user_id TEXT PRIMARY KEY,
                  firebase_uid TEXT UNIQUE NOT NULL,
                  email TEXT UNIQUE NOT NULL,
                  nickname TEXT NOT NULL,
                  coach_name TEXT NOT NULL,
                  email_verified INTEGER NOT NULL DEFAULT 0,
                  account_status TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS account_ml_subject (
                  user_id TEXT PRIMARY KEY,
                  ml_subject_id TEXT UNIQUE NOT NULL,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS account_profile (
                  user_id TEXT PRIMARY KEY,
                  birth_year INTEGER,
                  gender TEXT,
                  age_years_derived INTEGER,
                  profile_completed_at TEXT
                );

                CREATE TABLE IF NOT EXISTS account_consent (
                  consent_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  consent_type TEXT NOT NULL,
                  consent_value INTEGER NOT NULL,
                  consent_version TEXT NOT NULL,
                  captured_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS account_onboarding (
                  user_id TEXT PRIMARY KEY,
                  onboarding_status TEXT NOT NULL,
                  baseline_assessment_completed INTEGER NOT NULL DEFAULT 0,
                  dashboard_bootstrapped INTEGER NOT NULL DEFAULT 0,
                  model_bootstrapped INTEGER NOT NULL DEFAULT 0,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS baseline_assessment (
                  user_id TEXT PRIMARY KEY,
                  depression_score INTEGER NOT NULL,
                  anxiety_score INTEGER NOT NULL,
                  insomnia_score INTEGER NOT NULL,
                  completed_at TEXT NOT NULL
                );
                """
            )
            account_user_columns = {
                str(row["name"])
                for row in conn.execute("PRAGMA table_info(account_user)").fetchall()
            }
            if "coach_name" not in account_user_columns:
                conn.execute("ALTER TABLE account_user ADD COLUMN coach_name TEXT")
            conn.execute(
                """
                UPDATE account_user
                SET coach_name = nickname
                WHERE coach_name IS NULL OR TRIM(coach_name) = ''
                """
            )
            columns = {
                str(row["name"])
                for row in conn.execute("PRAGMA table_info(baseline_assessment)").fetchall()
            }
            if "assessment_id" not in columns:
                conn.execute("ALTER TABLE baseline_assessment ADD COLUMN assessment_id TEXT")
            conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_baseline_assessment_assessment_id
                ON baseline_assessment(assessment_id)
                """
            )
            conn.commit()

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(UTC).isoformat()

    @staticmethod
    def _build_user_id() -> str:
        return f"usr_{uuid.uuid4().hex}"

    def _build_ml_subject_id(self, conn: sqlite3.Connection, year: int) -> str:
        prefix = f"real_ml_{year}_"
        row = conn.execute(
            """
            SELECT ml_subject_id
            FROM account_ml_subject
            WHERE ml_subject_id LIKE ?
            ORDER BY ml_subject_id DESC
            LIMIT 1
            """,
            (f"{prefix}%",),
        ).fetchone()

        next_serial = 1
        if row:
            last_serial = int(str(row["ml_subject_id"]).split("_")[-1])
            next_serial = last_serial + 1

        return f"{prefix}{next_serial:08d}"

    def create_or_get_signup_shell(
        self,
        firebase_uid: str,
        email: str,
        nickname: str,
        terms_required: bool,
        privacy_required: bool,
        age_required: bool,
        coach_name: str | None = None,
    ) -> SessionContract:
        resolved_coach_name = (coach_name or nickname).strip() or nickname.strip()

        with self._connect() as conn:
            existing = conn.execute(
                "SELECT user_id FROM account_user WHERE firebase_uid = ?",
                (firebase_uid,),
            ).fetchone()

            if existing:
                user_id = str(existing["user_id"])
                conn.execute(
                    """
                    UPDATE account_user
                    SET email = ?, nickname = ?, coach_name = ?, updated_at = ?
                    WHERE user_id = ?
                    """,
                    (email, nickname, resolved_coach_name, self._now_iso(), user_id),
                )
                self._store_signup_consents(
                    conn,
                    user_id,
                    terms_required,
                    privacy_required,
                    age_required,
                )
                conn.commit()
                return self.get_session_contract_by_user_id(conn, user_id)

            # Allow retrying signup with the same email only while verification is still pending.
            # This recovers cases where email verification dispatch failed after shell creation.
            email_existing = conn.execute(
                "SELECT user_id, account_status FROM account_user WHERE email = ?",
                (email,),
            ).fetchone()
            if email_existing:
                user_id = str(email_existing["user_id"])
                account_status = str(email_existing["account_status"])
                if account_status != AccountStatus.pending_email_verification.value:
                    raise sqlite3.IntegrityError("email_already_exists")

                conn.execute(
                    """
                    UPDATE account_user
                    SET firebase_uid = ?, nickname = ?, coach_name = ?, updated_at = ?
                    WHERE user_id = ?
                    """,
                    (firebase_uid, nickname, resolved_coach_name, self._now_iso(), user_id),
                )
                self._store_signup_consents(
                    conn,
                    user_id,
                    terms_required,
                    privacy_required,
                    age_required,
                )
                conn.commit()
                return self.get_session_contract_by_user_id(conn, user_id)

            created_at = self._now_iso()
            user_id = self._build_user_id()
            year = datetime.now(UTC).year
            ml_subject_id = self._build_ml_subject_id(conn, year)

            conn.execute(
                """
                INSERT INTO account_user (
                  user_id,
                  firebase_uid,
                  email,
                  nickname,
                  coach_name,
                  email_verified,
                  account_status,
                  created_at,
                  updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    firebase_uid,
                    email,
                    nickname,
                    resolved_coach_name,
                    0,
                    AccountStatus.pending_email_verification.value,
                    created_at,
                    created_at,
                ),
            )
            conn.execute(
                """
                INSERT INTO account_ml_subject (user_id, ml_subject_id, created_at)
                VALUES (?, ?, ?)
                """,
                (user_id, ml_subject_id, created_at),
            )
            conn.execute(
                """
                INSERT INTO account_onboarding (
                  user_id,
                  onboarding_status,
                  baseline_assessment_completed,
                  dashboard_bootstrapped,
                  model_bootstrapped,
                  updated_at
                ) VALUES (?, ?, 0, 0, 0, ?)
                """,
                (user_id, OnboardingStatus.not_started.value, created_at),
            )
            self._store_signup_consents(
                conn,
                user_id,
                terms_required,
                privacy_required,
                age_required,
            )
            conn.commit()
            return self.get_session_contract_by_user_id(conn, user_id)

    def _store_signup_consents(
        self,
        conn: sqlite3.Connection,
        user_id: str,
        terms_required: bool,
        privacy_required: bool,
        age_required: bool,
    ) -> None:
        self._insert_consent(conn, user_id, "terms", terms_required)
        self._insert_consent(conn, user_id, "privacy", privacy_required)
        self._insert_consent(conn, user_id, "age_required", age_required)

    def _insert_consent(
        self,
        conn: sqlite3.Connection,
        user_id: str,
        consent_type: str,
        consent_value: bool,
        consent_version: str = "v1",
    ) -> None:
        conn.execute(
            """
            INSERT INTO account_consent (
              consent_id,
              user_id,
              consent_type,
              consent_value,
              consent_version,
              captured_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                f"cst_{uuid.uuid4().hex}",
                user_id,
                consent_type,
                int(consent_value),
                consent_version,
                self._now_iso(),
            ),
        )

    def get_user_id_by_firebase_uid(self, firebase_uid: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT user_id FROM account_user WHERE firebase_uid = ?",
                (firebase_uid,),
            ).fetchone()
            if not row:
                return None
            return str(row["user_id"])

    def is_email_in_use(self, email: str, *, exclude_user_id: str | None = None) -> bool:
        normalized_email = email.strip().lower()
        with self._connect() as conn:
            if exclude_user_id:
                row = conn.execute(
                    """
                    SELECT 1
                    FROM account_user
                    WHERE email = ? AND user_id <> ?
                    LIMIT 1
                    """,
                    (normalized_email, exclude_user_id),
                ).fetchone()
            else:
                row = conn.execute(
                    """
                    SELECT 1
                    FROM account_user
                    WHERE email = ?
                    LIMIT 1
                    """,
                    (normalized_email,),
                ).fetchone()
            return row is not None

    def relink_firebase_uid_by_email(
        self,
        *,
        email: str,
        firebase_uid: str,
    ) -> SessionContract | None:
        normalized_email = email.strip().lower()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT user_id, firebase_uid FROM account_user WHERE email = ?",
                (normalized_email,),
            ).fetchone()
            if not row:
                return None

            user_id = str(row["user_id"])
            current_uid = str(row["firebase_uid"])
            if current_uid == firebase_uid:
                return self.get_session_contract_by_user_id(conn, user_id)

            uid_row = conn.execute(
                "SELECT user_id FROM account_user WHERE firebase_uid = ?",
                (firebase_uid,),
            ).fetchone()
            if uid_row and str(uid_row["user_id"]) != user_id:
                return None

            conn.execute(
                """
                UPDATE account_user
                SET firebase_uid = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (firebase_uid, self._now_iso(), user_id),
            )
            conn.commit()
            return self.get_session_contract_by_user_id(conn, user_id)

    def sync_session_state(
        self,
        firebase_uid: str,
        email: str | None,
        email_verified: bool,
    ) -> SessionContract | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT user_id FROM account_user WHERE firebase_uid = ?",
                (firebase_uid,),
            ).fetchone()
            if not row:
                return None

            user_id = str(row["user_id"])
            onboarding = conn.execute(
                "SELECT onboarding_status FROM account_onboarding WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            onboarding_status = (
                str(onboarding["onboarding_status"])
                if onboarding
                else OnboardingStatus.not_started.value
            )

            target_onboarding_status = onboarding_status
            if email_verified and onboarding_status == OnboardingStatus.not_started.value:
                target_onboarding_status = OnboardingStatus.profile_pending.value

            if email_verified:
                if target_onboarding_status == OnboardingStatus.complete.value:
                    target_account_status = AccountStatus.active.value
                else:
                    target_account_status = AccountStatus.active_onboarding_required.value
            else:
                target_account_status = AccountStatus.pending_email_verification.value

            conn.execute(
                """
                UPDATE account_user
                SET email_verified = ?,
                    email = COALESCE(?, email),
                    account_status = ?,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (int(email_verified), email, target_account_status, self._now_iso(), user_id),
            )
            conn.execute(
                """
                INSERT INTO account_onboarding (
                  user_id,
                  onboarding_status,
                  baseline_assessment_completed,
                  dashboard_bootstrapped,
                  model_bootstrapped,
                  updated_at
                ) VALUES (?, ?, 0, 0, 0, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                  onboarding_status = excluded.onboarding_status,
                  updated_at = excluded.updated_at
                """,
                (user_id, target_onboarding_status, self._now_iso()),
            )
            conn.commit()
            return self.get_session_contract_by_user_id(conn, user_id)

    def save_onboarding_profile(
        self,
        user_id: str,
        birth_year: int,
        gender: Gender | None,
        sensitive_data_required: bool,
        personalization_optional: bool,
        model_improvement_optional: bool,
        marketing_optional: bool,
    ) -> SessionContract:
        age_years_derived = datetime.now(UTC).year - birth_year

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO account_profile (
                  user_id,
                  birth_year,
                  gender,
                  age_years_derived,
                  profile_completed_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                  birth_year = excluded.birth_year,
                  gender = excluded.gender,
                  age_years_derived = excluded.age_years_derived,
                  profile_completed_at = excluded.profile_completed_at
                """,
                (
                    user_id,
                    birth_year,
                    gender.value if gender else None,
                    age_years_derived,
                    self._now_iso(),
                ),
            )

            self._insert_consent(conn, user_id, "sensitive_data", sensitive_data_required)
            self._insert_consent(conn, user_id, "personalization", personalization_optional)
            self._insert_consent(conn, user_id, "model_improvement", model_improvement_optional)
            self._insert_consent(conn, user_id, "marketing", marketing_optional)

            conn.execute(
                """
                INSERT INTO account_onboarding (
                  user_id,
                  onboarding_status,
                  baseline_assessment_completed,
                  dashboard_bootstrapped,
                  model_bootstrapped,
                  updated_at
                ) VALUES (?, ?, 0, 0, 0, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                  onboarding_status = excluded.onboarding_status,
                  updated_at = excluded.updated_at
                """,
                (user_id, OnboardingStatus.baseline_pending.value, self._now_iso()),
            )
            conn.execute(
                """
                UPDATE account_user
                SET account_status = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (AccountStatus.active_onboarding_required.value, self._now_iso(), user_id),
            )
            conn.commit()
            return self.get_session_contract_by_user_id(conn, user_id)

    def complete_baseline_assessment(
        self,
        user_id: str,
        assessment_id: str,
    ) -> SessionContract:
        with self._connect() as conn:
            existing_baseline = conn.execute(
                """
                SELECT user_id
                FROM baseline_assessment
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()
            if existing_baseline:
                # Idempotent completion: baseline row exists but onboarding/account state may be stale.
                conn.execute(
                    """
                    INSERT INTO account_onboarding (
                      user_id,
                      onboarding_status,
                      baseline_assessment_completed,
                      dashboard_bootstrapped,
                      model_bootstrapped,
                      updated_at
                    ) VALUES (?, ?, 1, 1, 1, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                      onboarding_status = excluded.onboarding_status,
                      baseline_assessment_completed = excluded.baseline_assessment_completed,
                      dashboard_bootstrapped = excluded.dashboard_bootstrapped,
                      model_bootstrapped = excluded.model_bootstrapped,
                      updated_at = excluded.updated_at
                    """,
                    (user_id, OnboardingStatus.complete.value, self._now_iso()),
                )
                conn.execute(
                    """
                    UPDATE account_user
                    SET account_status = ?, updated_at = ?
                    WHERE user_id = ?
                    """,
                    (AccountStatus.active.value, self._now_iso(), user_id),
                )
                conn.commit()
                return self.get_session_contract_by_user_id(conn, user_id)

            try:
                assessment = conn.execute(
                    """
                    SELECT
                      pa.user_id,
                      pa.status,
                      pa.source,
                      sc.phq9_total,
                      sc.gad7_total,
                      sc.isi_total
                    FROM periodic_assessment pa
                    LEFT JOIN assessment_score sc ON sc.assessment_id = pa.assessment_id
                    WHERE pa.assessment_id = ?
                    """,
                    (assessment_id,),
                ).fetchone()
            except sqlite3.OperationalError as error:
                if "no such table" in str(error).lower():
                    raise ValueError("assessment_not_found") from error
                raise
            if not assessment or str(assessment["user_id"]) != user_id:
                raise ValueError("assessment_not_found")

            if str(assessment["status"]) != "completed":
                raise ValueError("assessment_not_completed")

            if str(assessment["source"]) != "onboarding":
                raise ValueError("assessment_source_invalid")

            try:
                counts = {
                    str(row["instrument"]): int(row["cnt"])
                    for row in conn.execute(
                        """
                        SELECT instrument, COUNT(*) AS cnt
                        FROM assessment_item_response
                        WHERE assessment_id = ?
                        GROUP BY instrument
                        """,
                        (assessment_id,),
                    ).fetchall()
                }
            except sqlite3.OperationalError as error:
                if "no such table" in str(error).lower():
                    raise ValueError("assessment_not_found") from error
                raise
            for instrument, expected_count in REQUIRED_ASSESSMENT_ITEM_COUNTS.items():
                if counts.get(instrument, 0) != expected_count:
                    raise ValueError("assessment_items_incomplete")

            depression_score = assessment["phq9_total"]
            anxiety_score = assessment["gad7_total"]
            insomnia_score = assessment["isi_total"]
            if depression_score is None or anxiety_score is None or insomnia_score is None:
                raise ValueError("assessment_score_missing")

            conn.execute(
                """
                INSERT INTO baseline_assessment (
                  user_id,
                  assessment_id,
                  depression_score,
                  anxiety_score,
                  insomnia_score,
                  completed_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    assessment_id,
                    int(depression_score),
                    int(anxiety_score),
                    int(insomnia_score),
                    self._now_iso(),
                ),
            )
            conn.execute(
                """
                INSERT INTO account_onboarding (
                  user_id,
                  onboarding_status,
                  baseline_assessment_completed,
                  dashboard_bootstrapped,
                  model_bootstrapped,
                  updated_at
                ) VALUES (?, ?, 1, 1, 1, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                  onboarding_status = excluded.onboarding_status,
                  baseline_assessment_completed = excluded.baseline_assessment_completed,
                  dashboard_bootstrapped = excluded.dashboard_bootstrapped,
                  model_bootstrapped = excluded.model_bootstrapped,
                  updated_at = excluded.updated_at
                """,
                (user_id, OnboardingStatus.complete.value, self._now_iso()),
            )
            conn.execute(
                """
                UPDATE account_user
                SET account_status = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (AccountStatus.active.value, self._now_iso(), user_id),
            )
            conn.commit()
            return self.get_session_contract_by_user_id(conn, user_id)

    def get_session_contract(self, user_id: str) -> SessionContract:
        with self._connect() as conn:
            return self.get_session_contract_by_user_id(conn, user_id)

    def get_session_contract_by_user_id(
        self,
        conn: sqlite3.Connection,
        user_id: str,
    ) -> SessionContract:
        account_row = conn.execute(
            """
            SELECT
              au.user_id,
              au.firebase_uid,
              au.nickname,
              au.coach_name,
              au.email,
              au.email_verified,
              au.account_status,
              ams.ml_subject_id
            FROM account_user au
            JOIN account_ml_subject ams ON ams.user_id = au.user_id
            WHERE au.user_id = ?
            """,
            (user_id,),
        ).fetchone()

        if not account_row:
            raise ValueError("account_not_found")

        profile_row = conn.execute(
            """
            SELECT birth_year, gender, age_years_derived, profile_completed_at
            FROM account_profile
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

        onboarding_row = conn.execute(
            """
            SELECT
              onboarding_status,
              baseline_assessment_completed,
              dashboard_bootstrapped,
              model_bootstrapped
            FROM account_onboarding
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

        consent_map = self._latest_consents(conn, user_id)

        account = AccountContract(
            user_id=str(account_row["user_id"]),
            firebase_uid=str(account_row["firebase_uid"]),
            nickname=str(account_row["nickname"]),
            coach_name=str(account_row["coach_name"]),
            email=str(account_row["email"]),
            email_verified=bool(account_row["email_verified"]),
            account_status=AccountStatus(str(account_row["account_status"])),
            ml_subject_id=str(account_row["ml_subject_id"]),
        )

        if profile_row:
            gender_value = profile_row["gender"]
            gender = Gender(gender_value) if gender_value else None
            profile = ProfileContract(
                birth_year=profile_row["birth_year"],
                gender=gender,
                age_years_derived=profile_row["age_years_derived"],
                profile_completed_at=profile_row["profile_completed_at"],
            )
        else:
            profile = ProfileContract()

        if onboarding_row:
            onboarding = OnboardingContract(
                onboarding_status=OnboardingStatus(str(onboarding_row["onboarding_status"])),
                baseline_assessment_completed=bool(onboarding_row["baseline_assessment_completed"]),
                dashboard_bootstrapped=bool(onboarding_row["dashboard_bootstrapped"]),
                model_bootstrapped=bool(onboarding_row["model_bootstrapped"]),
            )
        else:
            onboarding = OnboardingContract()

        consents = ConsentContract(
            terms_required=bool(consent_map.get("terms", False)),
            privacy_required=bool(consent_map.get("privacy", False)),
            sensitive_data_required=bool(consent_map.get("sensitive_data", False)),
            personalization_optional=bool(consent_map.get("personalization", False)),
            model_improvement_optional=bool(consent_map.get("model_improvement", False)),
            marketing_optional=bool(consent_map.get("marketing", False)),
        )

        return SessionContract(
            account=account,
            profile=profile,
            consents=consents,
            onboarding=onboarding,
        )

    @staticmethod
    def _latest_consents(conn: sqlite3.Connection, user_id: str) -> dict[str, bool]:
        rows = conn.execute(
            """
            SELECT consent_type, consent_value
            FROM account_consent
            WHERE user_id = ?
            ORDER BY captured_at DESC
            """,
            (user_id,),
        ).fetchall()

        result: dict[str, bool] = {}
        for row in rows:
            consent_type = str(row["consent_type"])
            if consent_type not in result:
                result[consent_type] = bool(row["consent_value"])
        return result
