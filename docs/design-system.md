# MindMe Design System

## 목적
기능 구조를 유지한 상태에서, `blueprint` 기반 화면 전반에 동일한 시각 규칙을 적용하기 위한 디자인 시스템 레이어를 정의한다.

핵심 목표:
- 토큰 기반 일관성
- shadcn base + 앱 전용 wrapper 분리
- 사용자/관리자 화면의 동일 브랜드 톤 유지
- 모바일 우선 레이아웃 안정화

## 구현 위치
- `apps/web/src/design-system/tokens.ts`
- `apps/web/src/styles/theme.css`
- `apps/web/src/components/shadcn/` (base primitives)
- `apps/web/src/components/ui/index.tsx` (MindMe wrappers)
- `apps/web/app/internal/design-system/page.tsx`
- `apps/web/src/features/design-system/design-system-preview.tsx`

## Layer 구조
1. Token Layer
- 색상/타이포/간격/radius/shadow/gradient/effect/size 토큰 정의
- source seed: `design/mindsight_design_tokens_seed.json`

2. Theme Layer
- `theme.css`의 CSS variables를 semantic token으로 노출
- light theme 우선
- 파스텔 그라데이션 + 글래스모피즘 포인트 적용

3. Base Component Layer (shadcn-style)
- `components/shadcn`에 base primitives 유지
- 스타일 클래스는 token 기반 `ms-*` 규칙 사용

4. App Wrapper Layer
- `components/ui/index.tsx`에서 도메인 친화 props/접근성/상태 조합
- 앱 화면은 wrapper만 사용

## Token Set
### Color
- `bg`, `surface`, `border`, `text`, `brand`, `accent`, `status`, `chart`

### Semantic Color
- `pageBg`, `sectionBg`, `surfaceBg`, `surfaceBase`, `surfaceAlt`, `surfaceMuted`
- `surfaceGlass`, `surfaceGlassStrong`
- `textPrimary`, `textSecondary`, `textMuted`
- `actionPrimary*`, `actionSecondary*`
- `success/warning/danger/info` 배경

### Typography
- `pageTitle`, `sectionTitle`, `cardTitle`, `bodyLg`, `bodyMd`, `bodySm`, `caption`, `statNumber`

### Spacing
- `space-1` ~ `space-10` (4px ~ 64px)

### Radius
- `sm`, `md`, `lg`, `xl`, `pill`

### Shadow
- `card`, `cardHover`, `modal`, `soft`

### Gradient / Effect
- `gradient.heroPrimary`, `gradient.heroAlt`, `gradient.cardSoft`, `gradient.glassStreak`
- `effects.blurHeader`, `effects.focusRingWidth`, `effects.focusRingOffset`, `effects.overlayBackdrop`

## 공통 컴포넌트
`apps/web/src/components/ui/index.tsx`

- Button: `primary | secondary | soft | tertiary | danger | ghost`, size `sm | md | lg`
- IconButton: `neutral | primary | danger`
- Input / PasswordInput / Textarea / Select
- SegmentedControl
- Tabs
- Card / StatCard
- Badge / Tag / Chip
- Modal
- BottomSheet
- Toast
- Banner
- EmptyState / ErrorState / LoadingSkeleton
- ChartCard / ChartBars

## Variant / Size / 상태 규칙
- variant naming 표준: `variant`
- size naming 표준: `sm | md | lg`
- 상태 규칙: `default`, `hover`, `focus-visible`, `active`, `disabled`, `loading/error`(필요 컴포넌트)
- 하위호환 prop(`tone`, `deltaTone`)은 유지하되 신규 코드에서는 `variant`만 사용

## Layout Shell 규칙
- `AppShell`: 글로벌 메뉴 + 컨텍스트 하위 메뉴
- `PageContainer`: `sm | md | lg` 콘텐츠 폭 제어
- `FeedContainer`: 피드 단일 컬럼 리듬
- `CenteredFormContainer`: 인증/온보딩 입력 폭 고정
- `SectionContainer`: 제목/설명/액션 + 카드형 섹션 표준

모바일 우선:
- 기본 1열
- `768px+`에서 2~3열 확장
- 터치 가능한 컨트롤 높이 최소 36px 이상

## Preview 정책
- 내부 점검 route만 유지: `/internal/design-system`
- production 사용자 route에는 preview/demo/showcase/developer helper 문구를 넣지 않는다.

## 접근성 기준
- `:focus-visible` 공통 focus ring
- `IconButton`은 `aria-label` 필수
- Input helper/error `aria-describedby` 연결
- `Tabs`: `tablist/tab/tabpanel`, 키보드 화살표 이동
- `SegmentedControl`: `radiogroup/radio`, 키보드 이동
- `Modal/BottomSheet`: `aria-labelledby`, `aria-describedby`, `Escape` 닫기

## 적용 원칙
- 컴포넌트 내부 하드코딩 색상 반복 금지
- token/semantic 변수 우선
- 사용자/관리자 화면 모두 동일 브랜드 계열 유지
- 기능 로직 수정 없이 시각/구조 계층만 개선

## 적용 화면 범위 (확장)
- 사용자: `dashboard/activity`, `cbt`, `cbt/session`, `challenge`, `challenge/[challengeId]`
- 리포트/문의: `report/summary`, `mypage/report-vault`, `mypage/support-tickets/*`
- 마이페이지 상세: `mypage/bookmarks`, `mypage/my-posts`, `mypage/my-comments`, `mypage/consents`
- 관리자: `admin`, `admin/users`, `admin/support`, `admin/moderation`, `admin/model-ops`, `admin/audit-log`

관리자 화면은 동일한 토큰/컴포넌트를 사용하되, 요약 카드와 리스트 밀도를 높여 운영용 정보 위계를 강화한다.
