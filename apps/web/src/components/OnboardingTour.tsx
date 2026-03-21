"use client";

import { useEffect, useMemo, useState } from "react";

type SpotlightStep = {
  step: 2 | 3 | 4 | 5;
  id: string;
  title: string;
  description: string;
  side: "left" | "right";
};

type PreviewStep = {
  step: 6 | 7 | 8;
  title: string;
  description: string;
  iframeSrc: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const SPOTLIGHT_STEPS: SpotlightStep[] = [
  {
    step: 2,
    id: "tour-checkin",
    title: "데일리 체크인",
    description: "매일 수면·기분·에너지를 기록하세요. 쌓인 데이터가 리포트가 됩니다.",
    side: "right",
  },
  {
    step: 3,
    id: "tour-challenge",
    title: "진행 중인 챌린지",
    description: "작은 습관 챌린지를 매일 수행하고 기록을 남겨보세요.",
    side: "right",
  },
  {
    step: 4,
    id: "tour-posts",
    title: "커뮤니티 인기글",
    description: "다른 사람들의 이야기를 보고 공감하며 함께 성장해요.",
    side: "left",
  },
  {
    step: 5,
    id: "tour-calendar",
    title: "월간 출석 캘린더",
    description: "체크인한 날이 색으로 표시돼요. 꾸준히 기록할수록 채워집니다.",
    side: "left",
  },
];

const PREVIEW_STEPS: PreviewStep[] = [
  {
    step: 6,
    title: "CBT 대화",
    description: "AI와 6단계로 생각을 정리하는 인지행동치료 대화를 해보세요.",
    iframeSrc: "/cbt",
  },
  {
    step: 7,
    title: "챌린지 카탈로그",
    description: "다양한 카테고리의 챌린지를 골라 나만의 루틴을 만들어보세요.",
    iframeSrc: "/challenge",
  },
  {
    step: 8,
    title: "리포트",
    description: "기록이 쌓이면 우울·불안·불면 변화를 PDF로 내보낼 수 있어요.",
    iframeSrc: "/report",
  },
];

function getSpotlightRect(step: SpotlightStep): Rect | null {
  const target = document.getElementById(step.id);
  if (!target) {
    return null;
  }

  const homeContainer = document.querySelector(".ms-home-v3");
  const targetRect = target.getBoundingClientRect();
  if (!homeContainer) {
    return {
      top: targetRect.top,
      left: targetRect.left,
      width: targetRect.width,
      height: targetRect.height,
    };
  }

  const containerRect = homeContainer.getBoundingClientRect();
  const relativeTop = targetRect.top - containerRect.top;
  const relativeLeft = targetRect.left - containerRect.left;
  return {
    top: containerRect.top + relativeTop,
    left: containerRect.left + relativeLeft,
    width: targetRect.width,
    height: targetRect.height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function previewFallback(title: string): JSX.Element {
  return (
    <div
      style={{
        height: "100%",
        borderRadius: 10,
        border: "1px solid var(--color-border)",
        background: "var(--color-surface-sub)",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)" }}>{title} 미리보기</div>
      <div style={{ height: 10, borderRadius: 999, background: "var(--color-surface)" }} />
      <div style={{ height: 10, borderRadius: 999, background: "var(--color-surface)" }} />
      <div style={{ height: 10, width: "75%", borderRadius: 999, background: "var(--color-surface)" }} />
      <div style={{ marginTop: "auto", height: 22, borderRadius: 8, background: "var(--color-primary-light)" }} />
    </div>
  );
}

export function OnboardingTour() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("hasSeenTour") !== "true";
  });
  const [step, setStep] = useState<number>(1);
  const [spotlightRect, setSpotlightRect] = useState<Rect | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState<Record<number, boolean>>({});
  const [previewFailed, setPreviewFailed] = useState<Record<number, boolean>>({});

  const spotlightStep = useMemo(() => SPOTLIGHT_STEPS.find((item) => item.step === step) ?? null, [step]);
  const previewStep = useMemo(() => PREVIEW_STEPS.find((item) => item.step === step) ?? null, [step]);

  const finishTour = (scrollToCheckin: boolean) => {
    localStorage.setItem("hasSeenTour", "true");
    setVisible(false);
    if (scrollToCheckin) {
      document.getElementById("tour-checkin")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const onNext = () => setStep((prev) => Math.min(9, prev + 1));
  const onPrev = () => setStep((prev) => Math.max(1, prev - 1));

  useEffect(() => {
    if (!visible || !spotlightStep) {
      setSpotlightRect(null);
      return;
    }

    const calculate = () => {
      const rect = getSpotlightRect(spotlightStep);
      setSpotlightRect(rect);
    };
    calculate();

    window.addEventListener("resize", calculate);
    return () => {
      window.removeEventListener("resize", calculate);
    };
  }, [visible, spotlightStep]);

  useEffect(() => {
    if (!visible || !previewStep) {
      return;
    }

    setPreviewLoaded((prev) => ({ ...prev, [previewStep.step]: false }));
    setPreviewFailed((prev) => ({ ...prev, [previewStep.step]: false }));
  }, [visible, previewStep]);

  useEffect(() => {
    if (!visible || !previewStep) {
      return;
    }
    if (previewLoaded[previewStep.step]) {
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      setPreviewFailed((prev) => ({ ...prev, [previewStep.step]: true }));
    }, 3000);

    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, [visible, previewLoaded, previewStep]);

  if (!visible) {
    return null;
  }

  if (step === 1) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "rgba(0,0,0,0.55)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "opacity 0.3s ease",
          padding: 16,
        }}
      >
        <div
          style={{
            width: "min(560px, 100%)",
            borderRadius: 16,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            padding: 24,
            boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            transition: "opacity 0.3s ease",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>🧠</div>
            <h2 style={{ margin: 0, fontSize: 24, color: "var(--color-text-primary)" }}>마음 건강을 기록하고 성장하세요</h2>
          </div>
          <p style={{ margin: "0 0 18px", textAlign: "center", color: "var(--color-text-secondary)" }}>
            매일의 상태를 기록하고 AI와 대화하며 나만의 멘탈 케어 루틴을 만들어보세요.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 8, marginBottom: 20 }}>
            {[
              { icon: "✅", label: "체크인" },
              { icon: "💬", label: "CBT" },
              { icon: "🏁", label: "챌린지" },
              { icon: "📊", label: "리포트" },
              { icon: "📝", label: "한줄일기" },
            ].map((item) => (
              <div key={item.label} style={{ textAlign: "center", borderRadius: 10, background: "var(--color-surface-sub)", padding: 8 }}>
                <div style={{ fontSize: 18 }}>{item.icon}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{item.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => finishTour(false)}
              style={{
                border: "1px solid var(--color-border)",
                background: "var(--color-surface-sub)",
                color: "var(--color-text-secondary)",
                borderRadius: 10,
                padding: "10px 14px",
                cursor: "pointer",
              }}
            >
              건너뛰기
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              style={{
                border: "none",
                background: "var(--color-primary)",
                color: "#fff",
                borderRadius: 10,
                padding: "10px 14px",
                cursor: "pointer",
              }}
            >
              투어 시작하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (spotlightStep && spotlightRect) {
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;
    const pad = 8;
    const cutoutTop = spotlightRect.top - pad;
    const cutoutLeft = spotlightRect.left - pad;
    const cutoutWidth = spotlightRect.width + pad * 2;
    const cutoutHeight = spotlightRect.height + pad * 2;
    const tooltipWidth = Math.min(340, Math.max(260, viewportWidth - 24));
    const sideGap = 16;
    const sideLeft = spotlightStep.side === "right" ? cutoutLeft + cutoutWidth + sideGap : cutoutLeft - tooltipWidth - sideGap;
    const tooltipLeft = clamp(sideLeft, 12, viewportWidth - tooltipWidth - 12);
    const tooltipTop = clamp(cutoutTop + cutoutHeight / 2 - 96, 12, viewportHeight - 220);

    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, transition: "opacity 0.3s ease" }}>
        <div
          style={{
            position: "fixed",
            top: cutoutTop,
            left: cutoutLeft,
            width: cutoutWidth,
            height: cutoutHeight,
            borderRadius: 14,
            outline: "2px solid rgba(127,119,221,0.7)",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
            transition: "all 0.3s ease",
          }}
        />

        <div
          style={{
            position: "fixed",
            top: tooltipTop,
            left: tooltipLeft,
            width: tooltipWidth,
            borderRadius: 14,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
            padding: 14,
            transition: "opacity 0.3s ease",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{step} / 9</div>
          <div style={{ marginTop: 4, fontSize: 17, fontWeight: 700, color: "var(--color-text-primary)" }}>{spotlightStep.title}</div>
          <p style={{ margin: "6px 0 10px", fontSize: 14, lineHeight: 1.45, color: "var(--color-text-secondary)" }}>
            {spotlightStep.description}
          </p>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[2, 3, 4, 5].map((dotStep) => (
              <span
                key={dotStep}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: dotStep === step ? "var(--color-primary)" : "var(--color-border)",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <button
              type="button"
              onClick={() => finishTour(false)}
              style={{ border: "none", background: "transparent", color: "var(--color-text-muted)", cursor: "pointer" }}
            >
              건너뛰기
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={onPrev}
                disabled={step <= 2}
                style={{
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-sub)",
                  color: "var(--color-text-secondary)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  cursor: step <= 2 ? "not-allowed" : "pointer",
                  opacity: step <= 2 ? 0.5 : 1,
                }}
              >
                이전
              </button>
              <button
                type="button"
                onClick={onNext}
                style={{
                  border: "none",
                  background: "var(--color-primary)",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                다음
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (previewStep) {
    const failed = previewFailed[previewStep.step];
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "rgba(0,0,0,0.55)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "opacity 0.3s ease",
          padding: 16,
        }}
      >
        <div
          style={{
            width: "min(640px, 100%)",
            borderRadius: 14,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            padding: 16,
            transition: "opacity 0.3s ease",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{step} / 9</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>{previewStep.title}</div>
          <p style={{ margin: "6px 0 12px", color: "var(--color-text-secondary)" }}>{previewStep.description}</p>

          <div
            style={{
              position: "relative",
              height: 140,
              borderRadius: 10,
              overflow: "hidden",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface-sub)",
              marginBottom: 14,
            }}
          >
            {failed ? (
              previewFallback(previewStep.title)
            ) : (
              <iframe
                title={`tour-preview-${previewStep.step}`}
                src={previewStep.iframeSrc}
                onLoad={() => setPreviewLoaded((prev) => ({ ...prev, [previewStep.step]: true }))}
                onError={() => setPreviewFailed((prev) => ({ ...prev, [previewStep.step]: true }))}
                style={{
                  transform: "scale(0.5)",
                  transformOrigin: "top left",
                  width: "200%",
                  height: "200%",
                  pointerEvents: "none",
                  border: "none",
                }}
              />
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <button
              type="button"
              onClick={onPrev}
              style={{
                border: "1px solid var(--color-border)",
                background: "var(--color-surface-sub)",
                color: "var(--color-text-secondary)",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
              }}
            >
              이전
            </button>
            <button
              type="button"
              onClick={onNext}
              style={{
                border: "none",
                background: "var(--color-primary)",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
              }}
            >
              다음
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "opacity 0.3s ease",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(360px, 100%)",
          borderRadius: 14,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          padding: 22,
          textAlign: "center",
          transition: "opacity 0.3s ease",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
        <h3 style={{ margin: "0 0 8px", fontSize: 20, color: "var(--color-text-primary)" }}>준비 완료!</h3>
        <p style={{ margin: "0 0 14px", color: "var(--color-text-secondary)" }}>오늘의 체크인부터 시작해볼까요?</p>
        <button
          type="button"
          onClick={() => finishTour(true)}
          style={{
            border: "none",
            background: "var(--color-primary)",
            color: "#fff",
            borderRadius: 10,
            padding: "10px 14px",
            cursor: "pointer",
            width: "100%",
          }}
        >
          체크인 하러 가기
        </button>
      </div>
    </div>
  );
}
