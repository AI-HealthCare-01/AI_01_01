# Mindsight Design System Guide for Implementation

## 1. Purpose
이 문서는 `design/reference_images/`에 있는 레퍼런스 이미지를 바탕으로 Mindsight 서비스의 디자인 시스템, 공통 컴포넌트, 화면별 레이아웃 규칙을 구현하기 위한 기준 문서다.

목표는 다음과 같다.
- 공통된 톤, 색상, 여백, 카드 구조, 그래프 규칙을 추출해 실제 제품 UI로 변환한다.
- 사용자 서비스와 관리자 화면이 같은 브랜드 계열 안에서 보이도록 정리한다.
- 이후 체크인, 대시보드, CBT, 게시판, 마이페이지, 관리자 콘솔에 일관되게 적용할 수 있도록 만든다.

---

## 2. Core Interpretation of the Reference Images

### 2.1 Overall Tone
레퍼런스 전반에서 공통으로 보이는 인상은 다음과 같다.
- 파스텔 계열 색상 그라데이션
- 적절한 여백
- 글래스모피즘 포인트 컬러
- 라운드 카드
- 얕고 넓은 그림자
- 강하지 않은 그라디언트
- 과도하게 무겁지 않은 대시보드 밀도

서비스 톤으로 번역하면:
- 차분함
- 따뜻함
- 정돈됨
- 편안함
- 비의료적이고 비위압적임
- 기록과 회고에 적합한 안정감

### 2.2 What to Keep
반드시 살릴 요소:
- 핑크/라벤더/스카이/민트 계열의 부드러운 보조색 및 그라데이션
- 글래스모피즘 포인트
- 큰 radius를 가진 카드/입력창/버튼
- 섹션 간 충분한 세로 여백
- 카드형 정보 묶음 구조
- 그래프를 장식보다 정보 해석 중심으로 배치하는 방식
- hero/background에 아주 약한 gradient mass 또는 blur 느낌

### 2.3 What to Avoid
피해야 할 요소:
- 진한 검정 또는 강한 대비 중심의 B2B 대시보드 톤
- 카드 안 카드 안 카드가 반복되는 과밀 레이아웃
- 네온/원색 기반의 강한 시선 자극
- 게임형 UI처럼 보이는 배지/점수/강한 애니메이션
- 사용자 화면과 관리자 화면이 완전히 다른 브랜드처럼 보이는 것

---

## 3. Reference Priority by Screen

### 3.1 Landing
우선 참고:
- `landing2.jpg`
- `landing3.jpg`

목적:
- 깔끔한 사용자 접근, 첫인상
- 브랜드 이미지 노출
- 간단한 메뉴 접근


### 3.2 Home / Main Tone
우선 참고:
- `dashboard9.jpg`
- `mypage.jpg`

목적:
- 브랜드 톤
- 배경 gradient mass
- hero 영역 여백
- 적절한 글래스모피즘 포인트

### 3.3 User Dashboard / Main App Screens
우선 참고:
- `dashboard7.jpg`
- `dashboard9.jpg`

목적:
- 사용자용 카드 밀도
- 요약 카드 + 차트 배치
- 상단 요약 영역과 하단 상세 영역 리듬

### 3.4 Feed / Board
우선 참고:
- `board-feed.jpg`
- `board-feed2.jpg`
- `board-feed3.jpg`

목적:
- 피드 리스트 카드 높이
- 좌우 여백
- 검색/탭 상단 영역
- 텍스트 계층

### 3.5 Auth / Survey / form
우선 참고:
- `sign-up.jpg`
- `sign-in.jpg`
- `sign-in2.png`

목적:
- 중앙 카드형 폼
- 진행 상태 표시
- 설정/프로필 레이아웃
- 개인 허브 UI 구성
- 진단척도검사(survey)는 `assessment_layout.png` 레이아웃
- 넓은 입력창
- 선택 버튼 구조


## 3.6 My Page / Settings
### strong reference
- `mypage.jpg`
- `mypage2.jpg`

### take from these
- 프로필 카드 + 기능 진입 목록 구조
- 설정형 리스트 리듬
- 글래스모피즘 포인트
- 파스텔 색상 그라데이션


### 3.7 Admin Screens
우선 참고:
- `manage-dashboard.jpg`
- `mypage.jpg`
- `mypage2.jpg`

목적:
- 관리자용 밀도 높은 카드/테이블/요약 영역
- 다만 사용자 화면보다 정보 밀도는 높여도, 색감은 같은 브랜드 체계를 유지

---

## 4. Brand and UI Principles for Mindsight

### 4.1 Product Personality
Mindsight는 다음 성격을 가진 서비스로 보이게 해야 한다.
- 자기 상태를 관찰하고 정리하는 도구
- 상담실/병원 시스템처럼 느껴지지 않음
- 가볍지만 얕지 않음
- 친절하지만 과하게 감성적이지 않음
- 부드럽고, 따뜻하고, 편안한 인상

### 4.2 Emotional Direction
- 불안을 자극하지 않는 화면
- 과도한 정보량 대신 안정적인 정보 블록
- 숫자와 그래프는 또렷하게 보여주되, 공격적인 색을 쓰지 않음
- 중요한 액션은 분명하지만 소리치지 않음

### 4.3 Copy Tone Rules
- 짧고 명확함
- 과장된 위로 문구 남용 금지
- 진단 단정 문구 금지
- 상태 설명은 사실 중심
- CTA는 동사형으로 짧게

---

## 5. Design Token Seed

### 5.1 Color Tokens
아래는 1차 seed다. 실제 구현 시 변수명은 유지하고 hex는 미세 조정 가능하다.

#### Background / Surface
- `bg.base` = `#FAFBFF`
- `bg.soft` = `#F6F3FB`
- `surface.base` = `#FFFFFF`
- `surface.alt` = `#F8F7FC`
- `surface.muted` = `#F3F5FA`
- `border.soft` = `#E9E7F2`
- `border.muted` = `#D8DCE8`

#### Text
- `text.primary` = `#1F2430`
- `text.secondary` = `#687085`
- `text.tertiary` = `#98A1B3`
- `text.inverse` = `#FFFFFF`

#### Brand / Accent
- `brand.primary` = `#7C6CF6`
- `brand.primary.hover` = `#6D5CE8`
- `brand.primary.soft` = `#EEEAFE`
- `accent.pink` = `#F5B8D0`
- `accent.sky` = `#BEE7F3`
- `accent.mint` = `#CDEEE5`
- `accent.peach` = `#F6D8C8`
- `accent.lavender` = `#D9CCF7`

#### Semantic
- `status.success` = `#5CC89B`
- `status.success.soft` = `#E8F8F1`
- `status.warning` = `#F3B764`
- `status.warning.soft` = `#FFF4E4`
- `status.danger` = `#EB7282`
- `status.danger.soft` = `#FDECEF`
- `status.info` = `#7EAEF7`
- `status.info.soft` = `#EBF4FF`

#### Chart Colors
- `chart.depression` = `#7C6CF6`
- `chart.anxiety` = `#F39AC1`
- `chart.insomnia` = `#6EC7C1`
- `chart.grid` = `#E9ECF4`
- `chart.axis` = `#8E97AB`

#### Gradients
- `gradient.hero.primary` = `linear-gradient(135deg, #E8F3FF 0%, #F8E8F5 100%)`
- `gradient.hero.alt` = `linear-gradient(135deg, #F5E9FF 0%, #E8FBF8 100%)`
- `gradient.card.soft` = `linear-gradient(135deg, #FFF7FB 0%, #F4F7FF 100%)`

### 5.2 Typography Scale
- `type.page_title` = `32px / 40px / 700`
- `type.section_title` = `22px / 30px / 700`
- `type.card_title` = `16px / 24px / 600`
- `type.body_lg` = `16px / 26px / 400`
- `type.body_md` = `14px / 22px / 400`
- `type.body_sm` = `13px / 20px / 400`
- `type.caption` = `12px / 18px / 400`
- `type.stat_number` = `28px / 34px / 700`

원칙:
- 한 화면에서 너무 많은 타입 크기 사용 금지
- 점수/숫자/기간 표시는 선명하게
- 본문은 14px 아래로 자주 떨어지지 않게

### 5.3 Spacing Scale
- `space.1` = `4px`
- `space.2` = `8px`
- `space.3` = `12px`
- `space.4` = `16px`
- `space.5` = `20px`
- `space.6` = `24px`
- `space.7` = `32px`
- `space.8` = `40px`
- `space.9` = `48px`
- `space.10` = `64px`

원칙:
- 기본 카드 padding은 `20px` 또는 `24px`
- 섹션 간 간격은 `24px` 이상
- 화면 상단 여백은 `24px~32px`

### 5.4 Radius Scale
- `radius.sm` = `10px`
- `radius.md` = `14px`
- `radius.lg` = `18px`
- `radius.xl` = `24px`
- `radius.pill` = `999px`

권장:
- 버튼/입력창: `14px`
- 카드: `20px~24px`
- 탭/세그먼트: `pill` 또는 `14px`

### 5.5 Shadow Scale
- `shadow.card` = `0 8px 24px rgba(29, 42, 80, 0.06)`
- `shadow.card.hover` = `0 12px 28px rgba(29, 42, 80, 0.10)`
- `shadow.modal` = `0 20px 48px rgba(21, 27, 38, 0.16)`
- `shadow.soft` = `0 4px 12px rgba(29, 42, 80, 0.05)`

원칙:
- 그림자는 얕고 넓게
- 검은 그림자처럼 보이지 않게 alpha 낮게 유지

---

## 6. Component Rules for Implementation

### 6.1 Button
#### Variants
- `primary`
- `secondary`
- `soft`
- `tertiary`
- `danger`

#### Style Rules
- Primary: `brand.primary` 배경 + 흰 텍스트
- Secondary: 흰 배경 + 보라 border + 보라 텍스트
- Soft: `brand.primary.soft` 또는 `accent` 계열 soft background
- Danger: `status.danger.soft` 배경 + danger text

#### Size Rules
- `sm` = 높이 `36px`
- `md` = 높이 `44px`
- `lg` = 높이 `48px~52px`

#### Usage Rules
- 한 화면의 핵심 CTA만 primary
- destructive action만 danger
- 로딩 상태 제공
- disabled 상태 색상 명확히 분리

### 6.2 Input / Textarea
- radius `14px`
- border `border.soft`
- background `surface.base`
- focus state는 `brand.primary` 계열 border 또는 ring
- helper / error text 아래 고정
- 긴 입력은 textarea 사용

### 6.3 Card
#### Common
- 배경 `surface.base`
- radius `20px~24px`
- 얕은 shadow + 얇은 border 중 하나 또는 둘 다 약하게 사용
- 내부 padding `20px` 이상

#### Types
- summary card
- content card
- chart card
- settings card
- stat card

### 6.4 Tabs / Segmented Controls
- 짧은 전환은 segmented control
- 상위 영역 전환은 tabs
- 선택 상태는 soft purple fill 또는 white + shadow active
- pill 형태 권장

### 6.5 Modal / Bottom Sheet
- 확인/신고/삭제/제출 전용
- 입력이 긴 폼은 모달 대신 별도 페이지
- 모바일에서는 bottom sheet 고려 가능

### 6.6 Tags / Badges
- 상태/카테고리용
- 색상 + 텍스트 병행
- 너무 많은 태그를 한 줄에 나열하지 않기

### 6.7 Charts
- 장식 최소화
- 얇고 정돈된 선
- 축과 grid는 옅게
- summary text 병행
- 결측 구간은 숨기지 않기

---

## 7. Screen-Level Layout Rules

### 7.1 Home
구조:
1. 상단 hero / 상태 요약
2. 오늘 할 수 있는 주요 행동 카드
   - 체크인
   - 일기 쓰기
   - 챌린지
   - CBT
3. 최근 상태/활동 요약

규칙:
- 첫 화면은 행동 유도와 안정감을 동시에 제공
- CTA를 너무 많이 두지 않기
- 큰 카드 1개 + 보조 카드 2~4개 조합이 적절

### 7.2 Symptom Dashboard
구조:
1. 상단 요약 카드 3개 또는 1행
2. 지표 모드 전환 (`최근 7일`, `최근 4주 평균`)
3. 우울/불안/불면 그래프 3개를 한 화면 안 세로 배치
4. 데이터 충분도, 최근 설문일, 마지막 업데이트 시점

규칙:
- 세 지표를 같은 그래프에 겹치지 않음
- 7일은 일별 연결
- 4주는 주평균 점 4개 연결
- 결측은 x축 상에서 숨기지 않음

### 7.3 Activity Dashboard
구조:
1. 이번 주 요약 카드
2. 월간 체크인 캘린더
3. 최근 7일 CBT / 챌린지 / 설문 요약

규칙:
- “출석률”보다 “기록한 날” 중심 표현
- 체크인/활동 사실을 부드럽게 보여주고 압박하지 않기

### 7.4 Feed / Board
구조:
1. 상단 검색 + 탭 (`피드`, `공지`, `북마크`)
2. 피드 리스트 단일 컬럼
3. 각 피드 카드: 번호, 작성자/익명, 시간, 제목, preview, 액션
4. 하단 `n개 더보기`

규칙:
- 완전 무한스크롤 지양
- 피드 고유번호는 검색/참조용으로 눈에 띄게
- 긴 본문은 줄 제한 후 더보기

### 7.5 Journal
구조:
1. 상단 일기 쓰기 CTA 또는 신규 작성 버튼
2. 일기 목록
3. 상세 / 수정 / 삭제 흐름

규칙:
- 입력 화면은 방해 요소 최소화
- 목록에는 제목 또는 첫 줄 일부만
- 상세에서 전체 본문 제공

### 7.6 My Page
구조:
1. 프로필/계정 요약
2. 최근 활동 요약 카드
3. 기능 진입 카드/리스트
   - 활동로그
   - 북마크
   - 내 글/댓글
   - 내 문의내역
   - 리포트 보관함
   - 회원정보
   - 보안 설정

규칙:
- 허브 역할
- 요약 + 진입 중심
- 상세 기능은 각 하위 화면에서 처리

### 7.7 Auth / Survey / Onboarding
구조:
- 중앙 카드형 레이아웃
- progress or step indicator
- 질문/입력 1개 또는 소수 항목 집중

규칙:
- 시선 분산 최소화
- 버튼 넓게
- 설문은 부드러운 톤이지만 공식 문항/척도는 유지

### 7.8 CBT
구조:
- 채팅형 + 구조형 보조 카드 + 현재 진행 순서 안내 카드 혼합 가능
- 안전 안내/숙제/요약 블록은 시각적으로 분리

규칙:
- 너무 메신저 앱처럼 만들지 않기
- 질문/반영/요약 흐름을 명확히
- 위험 관련 메시지는 일반 메시지와 구분

### 7.9 Admin Console
구조:
1. 운영 개요
2. 큐/리스트/테이블 중심
3. 필터와 상태 배지 적극 활용

규칙:
- 사용자 화면보다 정보 밀도 높아도 됨
- 다크 대시보드처럼 가지 말고 밝은 neutral 계열 유지
- 위험/민감 상태는 강도 있는 semantic color로 구분

---

## 8. Feature-Specific UX Notes

### Check-in
- 빠르게 끝나야 함
- segmented choice/button choice 우선
- 슬라이더는 꼭 필요한 곳에만

### Assessment
- 공식 문항 유지
- 결과는 비진단형 설명
- 현재 문항은 중앙카드, 이전문항 및 이후문항은 각각 작은 크기의 카드 좌우 배치(연속하여 넘어가는 느낌)
- score + band + date + delta 구성

### Challenge
- 압박보다 제안/격려 톤
- progress는 분명하되 실패 강조 금지

### CBT
- 구조화된 응답과 대화의 균형
- 단문 안내, 명확한 다음 행동

### Support / Inquiry
- 비공개 티켓 시스템의 안정감
- 상태 배지와 마지막 업데이트 시각 중요

---

## 9. Do / Don't Summary

### Do
- 밝고 부드러운 neutral 배경 유지
- 브랜드 포인트는 보라 계열 중심
- 파스텔 accent는 보조로 제한 사용
- 큰 radius와 넉넉한 padding 유지
- 정보 밀도보다 해석 가능성 우선
- 카드형 블록으로 내용을 정돈
- 관리자와 사용자 화면의 브랜드 일관성 유지

### Don't
- 강한 다크 테마 기반으로 전체 구현
- gradient를 모든 카드에 적용
- 세 지표 그래프를 한 그래프에 겹침
- 사용자 화면을 B2B 대시보드 템플릿처럼 만듦
- 활동/점수/연속일을 게임처럼 과도하게 강조
- 리스트에 민감 본문 전체 기본 노출

---

## 10. Implementation Order for Frontend Foundation

1. 디자인 토큰 파일 생성
   - colors
   - typography
   - spacing
   - radius
   - shadows
2. 공통 UI 컴포넌트 구현
   - Button
   - Input
   - Textarea
   - Select
   - Tabs
   - Card
   - Modal
   - Toast
   - Empty/Error/Loading states
3. 공통 레이아웃 프레임 구현
   - app shell
   - page container
   - section wrapper
   - card grid rules
4. 핵심 화면 틀 적용
   - home
   - symptom dashboard
   - feed
   - my page
   - auth/onboarding
5. 세부 기능 UI에 확장 적용

---

## 11. Acceptance Criteria

다음 조건을 만족하면 디자인 시스템 1차 구현이 적절하다.

### Foundation
- 색상, 타이포, spacing, radius, shadow 토큰이 코드에 정의됨
- 공통 컴포넌트가 최소 세 화면 이상에서 재사용됨

### Visual Consistency
- 홈, 대시보드, 피드, 마이페이지가 같은 브랜드 계열로 보임
- 카드, 버튼, 입력창 스타일이 화면마다 달라지지 않음

### UX
- loading / empty / error 상태가 최소 기본 제공됨
- 모바일에서 입력/탭/버튼 터치가 불편하지 않음
- 그래프가 보기 좋기보다 읽기 좋음

### Safety / Product Fit
- 의료 시스템처럼 차갑지 않음
- 지나치게 키치하거나 게임형으로 보이지 않음
- 민감 텍스트는 기본 화면에서 과노출되지 않음

---

## 12. Implementation Prompt Seed

아래는 구현 요청 시 사용할 수 있는 요약 프롬프트 seed다.

"design/reference_images 와 design/style_brief.md, design/component_rules.md, 그리고 이 문서를 읽고 디자인 시스템 초안을 구현하라. 레퍼런스 이미지를 복제하지 말고, Mindsight 서비스에 맞는 색상 토큰, 공통 컴포넌트, 홈/대시보드/피드/마이페이지 공통 레이아웃을 만든다. 밝은 neutral 배경, 보라 중심 brand color, 파스텔 accent, 넓은 여백, radius 큰 카드, 얕은 shadow를 유지한다. 사용자 화면은 차분하고 비의료적이어야 하며, 관리자 화면도 같은 브랜드 계열에서 더 높은 정보 밀도로 설계한다. 결과물에는 토큰, 공통 컴포넌트, docs/design-system.md, 최소한 홈/대시보드/피드/마이페이지 화면 골격이 포함되어야 한다."

---

## 13. Notes for Future Revision
- 실제 구현 스크린샷이 나오면 color saturation과 spacing density를 다시 미세 조정한다.
- `brand.primary`와 차트 색상 구분은 실제 데이터 카드와 그래프를 함께 본 뒤 2차 보정 가능하다.
- 관리자 화면은 정보 밀도가 과해지면 별도 density scale 도입 검토 가능.
