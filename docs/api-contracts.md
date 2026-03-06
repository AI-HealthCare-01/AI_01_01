# API Contracts

## 목적
이 문서는 **Mindsight** 서비스의 공통 API 응답 형식, 에러 형식, 인증 규칙, 페이징 규칙, 날짜/시간 규칙을 정의한다.  
프론트엔드, 백엔드, 관리자 콘솔, 모델 API가 같은 계약을 따르도록 하기 위한 기준 문서다.

---

## 현재 구현 기준 (2026-03-03)
- 현재 FastAPI 구현은 성공 응답을 `data wrapper` 없이 도메인 payload로 직접 반환한다.
- 실패 응답은 FastAPI 기본 형식(`detail`)을 사용한다.
- `POST /v1/report/summary/export`는 `export_id/download_url`을 반환하지 않고 파일 바이너리(StreamingResponse)를 즉시 반환한다.
- 파일 업로드 시작/확정 API(`upload_id`, `upload_url`)는 아직 구현되지 않았다.
- 라우트는 `/v1/*`와 일부 legacy 경로(`/checkin/*`, `/challenge/*`)가 공존한다.

위 항목은 실제 구현과 직접 연결된 운영 기준이며, 아래 "목표 계약"보다 우선한다.

---

## 1. 공통 원칙
- 모든 API는 일관된 응답 형식을 사용한다.
- 성공/실패 구조를 통일한다.
- 민감정보는 필요한 범위만 반환한다.
- 프론트엔드는 문서화된 계약 외 필드를 가정하지 않는다.
- 필드명은 기본적으로 `snake_case` 를 사용한다.
- 날짜/시간은 ISO 8601 문자열을 사용한다.
- 목록형 응답은 커서 기반 페이지네이션을 우선한다.

---

## 2. 성공 응답 형식

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "request_id": "req_01JXXXXXXX"
  }
}
```

### 규칙
- `ok`: 성공 여부
- `data`: 실제 응답 데이터
- `meta`: 요청 추적용 부가 정보
- 목록형 응답은 `data.items` 구조를 우선한다.

---

## 3. 실패 응답 형식

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해 주세요.",
    "details": {}
  },
  "meta": {
    "request_id": "req_01JXXXXXXX"
  }
}
```

### 규칙
- `error.code`: 기계적으로 처리 가능한 오류 코드
- `error.message`: 사용자 또는 개발자가 이해 가능한 오류 메시지
- `error.details`: 필드별 오류 등 추가 정보
- 내부 stack trace, raw exception 메시지는 직접 반환하지 않는다.

---

## 4. 표준 에러 코드

### 인증/권한
- `UNAUTHORIZED`
- `FORBIDDEN`
- `EMAIL_NOT_VERIFIED`
- `ONBOARDING_REQUIRED`
- `CONSENT_REQUIRED`

### 요청/리소스
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`

### 시스템
- `INTERNAL_ERROR`
- `DEPENDENCY_ERROR`
- `SERVICE_UNAVAILABLE`

### 파일/업로드
- `FILE_TOO_LARGE`
- `UNSUPPORTED_FILE_TYPE`

### 모델/예측
- `MODEL_NOT_READY`
- `PREDICTION_FAILED`

---

## 5. 인증 규칙

### 사용자 API
- 인증 필요
- 본인 데이터만 접근 가능
- 이메일 인증 여부가 필요한 기능은 추가 체크
- 온보딩 미완료 시 일부 기능 접근 제한

### 관리자 API
- 인증 + 역할 체크 필요
- 역할:
  - `owner`
  - `admin`
  - `support`
  - `analyst_ml_extension` (선택 부여)
- 민감 액션은 감사 로그 생성 필요

---

## 6. 권한별 접근 예시

### owner
- 모든 기능 접근 가능
- 정책 수정 승인 가능
- 모델 변경/배포 승인 가능
- 관리자 권한 부여/회수 가능

### admin
- support 기능 포함
- 사용자 조회
- 모더레이션
- 문의/피드백 처리
- 정책 수정 요청 생성 가능
- 직접 최종 승인 불가

### support
- 문의/피드백 처리
- 제한된 사용자 조회
- 민감정보 최소 접근
- 모델 운영 화면 기본 비접근

### analyst_ml_extension
- support 계정에 선택적으로 부여
- 모델 메트릭, 드리프트, 재학습 요청 화면 접근
- 직접 배포 승인 불가

---

## 7. 페이징 규칙

목록형 API는 커서 기반 페이지네이션을 기본으로 한다.

```json
{
  "ok": true,
  "data": {
    "items": [],
    "page_info": {
      "has_next": true,
      "next_cursor": "cursor_01JXXXXXXX"
    }
  },
  "meta": {
    "request_id": "req_01JXXXXXXX"
  }
}
```

### 규칙
- `items`: 현재 페이지 데이터
- `page_info.has_next`: 다음 페이지 존재 여부
- `page_info.next_cursor`: 다음 요청에 사용할 커서
- `n개 더보기` UI와 잘 맞는 방식으로 유지

---

## 8. 날짜/시간 규칙
- 표준: ISO 8601
- 가능하면 timezone 포함
- 예시:
  - `2026-03-02T10:30:00+09:00`
  - `2026-03-02`
- 날짜만 필요한 필드는 `YYYY-MM-DD`
- 시각 포함 필드는 timezone 포함 문자열 사용 권장

---

## 9. 필드 명명 규칙
- 기본: `snake_case`
- id 필드 예:
  - `user_id`
  - `post_id`
  - `ticket_id`
  - `assessment_id`
- boolean 필드 예:
  - `has_checkin`
  - `is_active`
  - `is_bookmarked`
- count 필드 예:
  - `comment_count`
  - `challenge_completed_count`

---

## 10. 공통 리소스 목록

### 인증 / 계정
- `signup`
- `login`
- `logout`
- `email_verification_status`
- `password_reset`
- `profile`
- `profile_update`
- `consent_status`

### 온보딩
- `onboarding_status`
- `onboarding_profile`
- `baseline_assessment`

### 체크인 / 설문 / 챌린지
- `daily_checkin`
- `periodic_assessment`
- `challenge_catalog`
- `challenge_enrollment`
- `challenge_day_log`

### CBT / 일기 / 활동로그
- `cbt_session`
- `cbt_session_summary`
- `journal_entry`
- `activity_log_day`

### 대시보드 / 리포트
- `symptom_dashboard`
- `activity_dashboard`
- `report_preview`
- `report_export`
- `nowcast_prediction`

### 게시판 / 문의
- `feed_post`
- `feed_comment`
- `feed_bookmark`
- `support_ticket`
- `support_message`

### 관리자
- `admin_user`
- `moderation_queue_item`
- `support_queue_item`
- `policy_config`
- `model_operation`
- `model_retraining_job`
- `audit_log_item`

---

## 11. 목록 응답 예시

### 게시판 목록

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "post_id": "post_01JXXXXXXX",
        "post_no": "F-1024",
        "author_label": "익명",
        "title": null,
        "excerpt": "오늘은 조금 버거웠지만...",
        "has_image": true,
        "like_count": 12,
        "comment_count": 3,
        "is_bookmarked": false,
        "created_at": "2026-03-02T10:30:00+09:00"
      }
    ],
    "page_info": {
      "has_next": true,
      "next_cursor": "cursor_01JXXXXXXX"
    }
  },
  "meta": {
    "request_id": "req_01JXXXXXXX"
  }
}
```

### 문의 내역 목록

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "ticket_id": "ticket_01JXXXXXXX",
        "ticket_no": "T-204",
        "ticket_type": "inquiry",
        "title": "비밀번호 재설정이 되지 않아요",
        "status": "waiting_admin",
        "last_message_at": "2026-03-02T09:10:00+09:00",
        "has_unread_admin_reply": false,
        "reopened_count": 1
      }
    ],
    "page_info": {
      "has_next": false,
      "next_cursor": null
    }
  },
  "meta": {
    "request_id": "req_01JXXXXXXX"
  }
}
```

---

## 12. 상세 응답 예시

### 활동로그 day 상세

```json
{
  "ok": true,
  "data": {
    "date": "2026-03-02",
    "has_checkin": true,
    "checkin_summary": {
      "mood_score_0_100": 58,
      "energy_score_0_100": 42,
      "sleep_total_min": 390
    },
    "has_challenge_activity": true,
    "challenge_summary": {
      "active_count": 2,
      "completed_count": 1
    },
    "has_cbt_activity": true,
    "cbt_summary": {
      "session_count": 1,
      "top_topic_labels": ["수면", "걱정"]
    },
    "has_journal_entry": true,
    "journal_summary": {
      "entry_count": 1,
      "preview": "오늘은 아침부터 조금 불안했다..."
    },
    "has_assessment": false
  },
  "meta": {
    "request_id": "req_01JXXXXXXX"
  }
}
```

---

## 13. 에러 상세 규칙

### 필드 검증 오류 예시

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해 주세요.",
    "details": {
      "email": "유효한 이메일 형식이 아닙니다.",
      "password": "비밀번호는 8자 이상이어야 합니다."
    }
  },
  "meta": {
    "request_id": "req_01JXXXXXXX"
  }
}
```

### 권한 오류 예시

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "이 작업에 접근할 권한이 없습니다.",
    "details": {}
  },
  "meta": {
    "request_id": "req_01JXXXXXXX"
  }
}
```

---

## 14. 인증/온보딩 관련 상태 응답 예시

```json
{
  "ok": true,
  "data": {
    "user_id": "usr_01JXXXXXXX",
    "firebase_uid": "firebase_uid_xxx",
    "email_verified": true,
    "onboarding_completed": false,
    "required_next_step": "consent_and_baseline_assessment"
  },
  "meta": {
    "request_id": "req_01JXXXXXXX"
  }
}
```

---

## 15. 파일 업로드 계약

### 업로드 시작 응답 예시

```json
{
  "ok": true,
  "data": {
    "upload_id": "upl_01JXXXXXXX",
    "upload_url": "https://example-upload-url",
    "expires_at": "2026-03-02T10:45:00+09:00"
  },
  "meta": {
    "request_id": "req_01JXXXXXXX"
  }
}
```

### 규칙
- 허용 파일 타입과 크기는 서버에서 검증
- 업로드 URL은 만료형 사용 권장
- 업로드 완료 후 별도 confirm API를 둘 수 있음

---

## 16. 리포트 export 계약

### export 요청
- 입력:
  - `start_date`
  - `end_date`
  - `format` (`pdf` | `png`)
  - `include_sensitive`

### export 응답 예시

```json
{
  "ok": true,
  "data": {
    "export_id": "exp_01JXXXXXXX",
    "status": "ready",
    "download_url": "https://example-download-url",
    "expires_at": "2026-03-02T11:00:00+09:00"
  },
  "meta": {
    "request_id": "req_01JXXXXXXX"
  }
}
```

---

## 17. 관리자 API 특수 규칙
- 기본 사용자 조회 응답에는 IP 포함 금지
- 차단/보안 조치 전용 상세 API에서만 IP 허용
- 관리자 액션은 감사 로그 생성 필수

### 감사 로그 생성이 필요한 액션
- 관리자 권한 부여/회수
- 계정 차단/해제
- 게시글 숨김/삭제
- 티켓 상태 변경
- 정책 수정 승인
- 모델 배포/롤백 승인

---

## 18. 민감정보 반환 규칙
- CBT 자유 텍스트 원문은 기본 API 응답에 포함하지 않음
- 일기 본문은 목록 API에 전체 포함하지 않음
- 위험 플래그는 구조화 요약만 반환
- 관리자 상세 API도 권한에 따라 필드 차등 반환

---

## 19. 버전 관리
- 경로 버전 예시: `/v1/...`
- 큰 계약 변경 시 기존 클라이언트와 충돌하지 않게 버전 분리
- 임시 필드는 문서 없이 추가하지 않는다

---

## 20. 향후 확정 필요 항목 (TODO)
- 공통 에러 코드 enum 최종 확정
- 업로드 파일 크기 제한 확정
- report export 비동기 처리 여부 확정
- 관리자 큐 필터 파라미터 확정
- 알림 API 계약 확정
