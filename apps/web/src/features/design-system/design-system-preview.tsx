"use client";

import { useMemo, useState } from "react";

import { colorTokens, spacingTokens, typographyTokens } from "../../design-system/tokens";
import {
  AppShell,
  Badge,
  Banner,
  BottomSheet,
  Button,
  Card,
  CenteredFormContainer,
  ChartBars,
  ChartCard,
  Chip,
  EmptyState,
  ErrorState,
  FeedContainer,
  IconButton,
  Input,
  LoadingSkeleton,
  Modal,
  PageContainer,
  PasswordInput,
  SectionContainer,
  SegmentedControl,
  Select,
  StatCard,
  TabItem,
  Tabs,
  Tag,
  Textarea,
  Toast
} from "../../components/ui";

type SegValue = "7d" | "4w" | "12w";
type TabValue = "overview" | "journal" | "challenge";
type ToastTone = "success" | "warning" | "danger" | "info";

const selectOptions = [
  { label: "카테고리를 선택하세요", value: "" },
  { label: "체크인", value: "checkin" },
  { label: "일기", value: "journal" },
  { label: "챌린지", value: "challenge" }
];

const segmentedOptions: Array<{ label: string; value: SegValue }> = [
  { label: "7일", value: "7d" },
  { label: "4주", value: "4w" },
  { label: "12주", value: "12w" }
];

const colorPalette = [
  ["bg.base", colorTokens.bg.base],
  ["surface.base", colorTokens.surface.base],
  ["surface.alt", colorTokens.surface.alt],
  ["text.primary", colorTokens.text.primary],
  ["brand.primary", colorTokens.brand.primary],
  ["brand.primaryHover", colorTokens.brand.primaryHover],
  ["accent.lavender", colorTokens.accent.lavender],
  ["accent.sky", colorTokens.accent.sky],
  ["status.success", colorTokens.status.success],
  ["status.warning", colorTokens.status.warning],
  ["status.danger", colorTokens.status.danger],
  ["status.info", colorTokens.status.info]
] as const;

const typographyScale = [
  ["pageTitle", typographyTokens.pageTitle],
  ["sectionTitle", typographyTokens.sectionTitle],
  ["cardTitle", typographyTokens.cardTitle],
  ["bodyLg", typographyTokens.bodyLg],
  ["bodyMd", typographyTokens.bodyMd],
  ["bodySm", typographyTokens.bodySm],
  ["caption", typographyTokens.caption],
  ["statNumber", typographyTokens.statNumber]
] as const;

const toastMessageByTone: Record<ToastTone, { title: string; message: string }> = {
  success: {
    title: "저장 완료",
    message: "디자인 시스템 프리뷰 설정이 저장되었습니다."
  },
  warning: {
    title: "검토 필요",
    message: "일부 컴포넌트에서 접근성 대비를 재확인하세요."
  },
  danger: {
    title: "실패",
    message: "프리뷰 데이터를 불러오지 못했습니다. 다시 시도하세요."
  },
  info: {
    title: "안내",
    message: "variant, size, 상태를 한 화면에서 비교할 수 있습니다."
  }
};

export default function DesignSystemPreview() {
  const [segment, setSegment] = useState<SegValue>("7d");
  const [tab, setTab] = useState<TabValue>("overview");
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastTone, setToastTone] = useState<ToastTone>("success");

  const tabs: TabItem<TabValue>[] = [
    {
      value: "overview",
      label: "개요",
      content: <Card description="서비스 상태와 오늘 행동을 요약하는 탭입니다." />
    },
    {
      value: "journal",
      label: "일기",
      content: <Card description="일기 작성 및 회고 진입을 제공하는 탭입니다." />
    },
    {
      value: "challenge",
      label: "챌린지",
      content: <Card description="챌린지 추천과 진행 상태를 확인하는 탭입니다." />
    }
  ];

  const spacingRows = useMemo(
    () =>
      Object.entries(spacingTokens).map(([key, value]) => ({
        key,
        value
      })),
    []
  );

  const toastContent = toastMessageByTone[toastTone];

  return (
    <AppShell
      headerAction={
        <div className="ms-row">
          <Badge variant="brand">Internal Style Guide</Badge>
          <IconButton label="Settings" icon="⚙" />
        </div>
      }
    >
      <PageContainer size="lg">
        <SectionContainer
          title="MindMe Design System Preview"
          description="디자이너/개발자/리뷰어가 토큰과 공통 컴포넌트를 한 화면에서 검토하기 위한 내부 프리뷰 페이지"
        >
          <Banner
            variant="info"
            title="Mobile-first Preview"
            description="기본 단일 컬럼 기준으로 구성하고, 데스크톱에서 카드 그리드로 확장됩니다."
          />
        </SectionContainer>

        <SectionContainer title="Color Palette" description="Base, brand, accent, semantic status 색상 토큰">
          <div className="ms-token-grid">
            {colorPalette.map(([name, value]) => (
              <article key={name} className="ms-token">
                <div className="ms-token__swatch" style={{ background: value }} />
                <div className="ms-token__meta">
                  <strong>{name}</strong>
                  <div>{value}</div>
                </div>
              </article>
            ))}
          </div>
        </SectionContainer>

        <SectionContainer title="Typography Scale" description="Page/Section/Card/Body/Caption/Stat scale">
          <div className="ms-stack">
            {typographyScale.map(([name, token]) => (
              <div key={name} className="ms-type-row">
                <div className="ms-type-row__meta">
                  <strong>{name}</strong>
                  <span>
                    {token.fontSize} / {token.lineHeight} / {token.fontWeight}
                  </span>
                </div>
                <p
                  className="ms-type-row__sample"
                  style={{
                    fontSize: token.fontSize,
                    lineHeight: token.lineHeight,
                    fontWeight: token.fontWeight
                  }}
                >
                  오늘의 상태를 차분하게 확인해보세요.
                </p>
              </div>
            ))}
          </div>
        </SectionContainer>

        <SectionContainer title="Spacing Examples" description="space-1 ~ space-10 토큰 간격 예시">
          <div className="ms-spacing-list">
            {spacingRows.map((item) => (
              <div key={item.key} className="ms-spacing-row">
                <span className="ms-spacing-row__name">space-{item.key}</span>
                <div className="ms-spacing-row__track">
                  <div className="ms-spacing-row__bar" style={{ width: `calc(${item.value} * 3)` }} />
                </div>
                <span className="ms-spacing-row__value">{item.value}</span>
              </div>
            ))}
          </div>
        </SectionContainer>

        <SectionContainer title="Button Variants" description="variant, size, disabled, loading 상태를 한 번에 확인">
          <div className="ms-stack">
            <div className="ms-row">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="soft">Soft</Button>
              <Button variant="tertiary">Tertiary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
            <div className="ms-row">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button disabled>Disabled</Button>
              <Button loading>Loading</Button>
              <IconButton icon="🔖" label="Bookmark" />
              <IconButton icon="🗑" label="Delete" variant="danger" />
            </div>
          </div>
        </SectionContainer>

        <SectionContainer
          title="Input / Textarea / Select States"
          description="default, error, disabled 상태 예시"
        >
          <div className="ms-grid ms-grid--two">
            <Input
              label="이메일 (default)"
              placeholder="you@example.com"
              helperText="가입 시 이메일 인증에 사용됩니다."
            />
            <Input
              label="이메일 (error)"
              placeholder="you@example.com"
              errorText="유효한 이메일 형식이 아닙니다."
              defaultValue="invalid-email"
            />
            <PasswordInput label="비밀번호" placeholder="8자 이상" helperText="영문/숫자/특수문자 조합 권장" />
            <Input label="닉네임 (disabled)" defaultValue="mindsight-user" disabled helperText="현재 편집할 수 없습니다." />
            <Textarea label="일기 (default)" placeholder="간단한 감정/상황을 남겨보세요." maxLengthHint="120 / 500" />
            <Textarea
              label="일기 (error)"
              defaultValue=""
              errorText="최소 10자 이상 작성해주세요."
              maxLengthHint="0 / 500"
            />
            <Select
              label="기록 유형"
              defaultValue=""
              options={selectOptions}
              helperText="카테고리를 선택하면 관련 입력이 표시됩니다."
            />
            <Select label="기록 유형 (disabled)" defaultValue="journal" options={selectOptions} disabled />
          </div>
        </SectionContainer>

        <SectionContainer title="Tabs / Segmented Control" description="모바일 우선 전환 컨트롤">
          <div className="ms-stack">
            <SegmentedControl
              fullWidth
              options={segmentedOptions}
              value={segment}
              onChange={(next) => setSegment(next)}
              ariaLabel="기간 선택"
            />
            <Tabs value={tab} onChange={setTab} items={tabs} ariaLabel="요약 탭" />
          </div>
        </SectionContainer>

        <SectionContainer title="Card / Stat Card / Badge" description="카드 계층과 상태 라벨 표현">
          <div className="ms-grid ms-grid--three">
            <Card title="요약 카드" description="기록/활동 상태를 확인하세요.">
              <div className="ms-row">
                <Badge variant="brand">Brand</Badge>
                <Badge variant="success">Success</Badge>
                <Tag variant="warning">Warning</Tag>
                <Tag variant="danger">Danger</Tag>
                <Chip selected>선택됨</Chip>
                <Chip>기본</Chip>
              </div>
            </Card>
            <StatCard label="우울 지표" value="42" delta="지난주 대비 -4" deltaVariant="up" helperText="낮을수록 안정" />
            <StatCard label="수면 지표" value="58" delta="지난주 대비 +2" deltaVariant="down" helperText="규칙성 점수" />
          </div>
        </SectionContainer>

        <SectionContainer title="Modal / Banner / Toast Examples" description="오버레이 및 피드백 컴포넌트 예시">
          <div className="ms-stack">
            <div className="ms-row">
              <Button onClick={() => setModalOpen(true)}>모달 열기</Button>
              <Button variant="soft" onClick={() => setSheetOpen(true)}>
                바텀시트 열기
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setToastTone("success");
                  setToastOpen(true);
                }}
              >
                Success Toast
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setToastTone("warning");
                  setToastOpen(true);
                }}
              >
                Warning Toast
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setToastTone("danger");
                  setToastOpen(true);
                }}
              >
                Danger Toast
              </Button>
            </div>
            <div className="ms-stack">
              <Banner variant="success" title="성공 배너" description="저장 요청이 정상적으로 처리되었습니다." />
              <Banner variant="warning" title="주의 배너" description="일부 항목은 추가 확인이 필요합니다." />
              <Banner variant="danger" title="오류 배너" description="네트워크 오류로 데이터를 가져오지 못했습니다." />
            </div>
          </div>
        </SectionContainer>

        <SectionContainer title="Empty / Error / Loading States" description="필수 상태 컴포넌트 검토">
          <div className="ms-grid ms-grid--two">
            <Card title="Loading">
              <LoadingSkeleton lines={5} />
            </Card>
            <Card title="Empty / Error">
              <div className="ms-stack">
                <EmptyState
                  title="아직 기록이 없습니다"
                  description="오늘의 체크인 또는 일기 작성을 시작해보세요."
                  action={<Button size="sm">기록 시작</Button>}
                />
                <ErrorState
                  title="데이터를 불러오지 못했습니다"
                  description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
                  retryAction={
                    <Button size="sm" variant="secondary">
                      다시 시도
                    </Button>
                  }
                />
              </div>
            </Card>
          </div>
        </SectionContainer>

        <SectionContainer title="Chart Container Examples" description="대시보드/활동 로그 공통 차트 래퍼 스타일">
          <div className="ms-grid ms-grid--two">
            <ChartCard
              title="감정 지표 추이"
              subtitle="최근 7일"
              summary="우울/불안/불면 지표를 공통 레이아웃으로 표시합니다."
              legend={[
                { label: "우울", color: "var(--color-chart-depression)", value: "42" },
                { label: "불안", color: "var(--color-chart-anxiety)", value: "35" },
                { label: "불면", color: "var(--color-chart-insomnia)", value: "58" }
              ]}
            >
              <ChartBars
                bars={[28, 36, 44, 41, 52, 47, 58]}
                color="var(--color-chart-depression)"
                axisLabels={["월", "화", "수", "목", "금", "토", "일"]}
              />
            </ChartCard>
            <ChartCard
              title="활동 일수"
              subtitle="최근 7일"
              summary="기록한 날/활동한 날 요약을 동일한 카드 규칙으로 표현합니다."
              legend={[{ label: "활동", color: "var(--color-chart-insomnia)", value: "5일" }]}
            >
              <ChartBars
                bars={[22, 55, 34, 62, 69, 45, 74]}
                color="var(--color-chart-insomnia)"
                axisLabels={["월", "화", "수", "목", "금", "토", "일"]}
              />
            </ChartCard>
          </div>
        </SectionContainer>

        <SectionContainer title="Layout Shell Examples" description="공통 컨테이너 폭 규칙 검토">
          <div className="ms-grid ms-grid--two">
            <Card title="FeedContainer">
              <FeedContainer>
                <Card description="피드 목록은 단일 컬럼 리듬을 유지합니다." />
              </FeedContainer>
            </Card>
            <Card title="CenteredFormContainer">
              <CenteredFormContainer>
                <Card description="가입/로그인/설문 폼은 중앙 정렬 폭 규칙을 사용합니다." />
              </CenteredFormContainer>
            </Card>
          </div>
        </SectionContainer>
      </PageContainer>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="공통 모달"
        description="중요 확인, 정책 동의, 삭제 확인에 사용합니다."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button onClick={() => setModalOpen(false)}>확인</Button>
          </>
        }
      >
        <p className="ms-card__desc">모달은 핵심 의사결정 맥락에서만 사용하고, 중첩 호출을 피합니다.</p>
      </Modal>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="모바일 우선 바텀시트"
        description="필터/정렬/짧은 폼 입력에 권장"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              닫기
            </Button>
            <Button onClick={() => setSheetOpen(false)}>적용</Button>
          </>
        }
      >
        <div className="ms-stack">
          <Chip selected>최근순</Chip>
          <Chip>좋아요순</Chip>
          <Chip>댓글순</Chip>
        </div>
      </BottomSheet>

      <Toast
        open={toastOpen}
        onClose={() => setToastOpen(false)}
        title={toastContent.title}
        message={toastContent.message}
        variant={toastTone}
        actionLabel="확인"
        onAction={() => setToastOpen(false)}
      />
    </AppShell>
  );
}
