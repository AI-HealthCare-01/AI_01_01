"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  CenteredFormContainer,
  Input,
  SectionContainer,
  Select,
} from "../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../src/features/auth";
import type { Gender } from "../../src/features/auth/types";

type Step = "profile" | "baseline";

const genderOptions = [
  { label: "선택 안 함", value: "" },
  { label: "여성", value: "female" },
  { label: "남성", value: "male" },
  { label: "논바이너리", value: "nonbinary" },
  { label: "응답 안 함", value: "prefer_not_to_say" }
] as const;

function mapOnboardingError(code: string): string {
  if (code.includes("firebase_token_invalid")) {
    return "인증 세션 검증에 실패했습니다. 다시 로그인 후 시도해주세요.";
  }
  if (code.includes("missing_firebase_auth")) {
    return "로그인 세션이 없습니다. 다시 로그인해주세요.";
  }
  if (code.includes("account_not_found")) {
    return "계정 동기화가 완료되지 않았습니다. 잠시 후 다시 시도하거나 다시 로그인해주세요.";
  }
  if (code.includes("email_verification_required")) {
    return "이메일 확인 완료 후 온보딩을 진행할 수 있습니다.";
  }
  return `온보딩 정보 저장에 실패했습니다. (${code})`;
}

function parseBirthYear(value: string): number | null {
  if (!/^\d{4}$/.test(value)) {
    return null;
  }
  const year = Number(value);
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear) {
    return null;
  }
  return year;
}

function StepStrip({ step }: { step: Step }) {
  const activeIndex = step === "profile" ? 2 : 3;
  const labels = ["온보딩 시작", "기본 정보", "동의 설정", "초기 진단척도"];

  return (
    <div className="ms-row" aria-label="온보딩 단계">
      {labels.map((label, index) => {
        const variant = index < activeIndex ? "success" : index === activeIndex ? "brand" : "neutral";
        return (
          <Badge key={label} variant={variant}>
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { session, saveOnboardingProfile, refreshSession } = useAuthContext();

  const [step, setStep] = useState<Step>("profile");
  const [birthYearRaw, setBirthYearRaw] = useState("");
  const [gender, setGender] = useState<Gender | "">("");

  const [sensitiveDataRequired, setSensitiveDataRequired] = useState(false);
  const [personalizationOptional, setPersonalizationOptional] = useState(false);
  const [modelImprovementOptional, setModelImprovementOptional] = useState(false);

  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (session.profile.birth_year) {
      setBirthYearRaw(String(session.profile.birth_year));
    }
    if (session.profile.gender) {
      setGender(session.profile.gender);
    }

    setSensitiveDataRequired(session.consents.sensitive_data_required);
    setPersonalizationOptional(session.consents.personalization_optional);
    setModelImprovementOptional(session.consents.model_improvement_optional);

    if (session.onboarding.onboarding_status === "baseline_pending") {
      setStep("baseline");
    }
  }, [session]);

  const birthYear = useMemo(() => parseBirthYear(birthYearRaw), [birthYearRaw]);

  const onSubmitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!birthYear || !sensitiveDataRequired || isSubmittingProfile) {
      return;
    }

    const profilePayload = {
      birth_year: birthYear,
      gender: gender || null,
      consents: {
        sensitive_data_required: sensitiveDataRequired,
        personalization_optional: personalizationOptional,
        model_improvement_optional: modelImprovementOptional,
        marketing_optional: false
      }
    };

    try {
      setIsSubmittingProfile(true);
      setErrorMessage(null);

      await saveOnboardingProfile(profilePayload);
      setStep("baseline");
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown";
      if (code.includes("account_not_found")) {
        const recovered = await refreshSession();
        if (recovered) {
          try {
            await saveOnboardingProfile(profilePayload);
            setStep("baseline");
            return;
          } catch (retryError) {
            const retryCode = retryError instanceof Error ? retryError.message : "unknown";
            setErrorMessage(mapOnboardingError(retryCode));
            return;
          }
        }
      }
      setErrorMessage(mapOnboardingError(code));
    } finally {
      setIsSubmittingProfile(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-onboarding">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">온보딩</Badge>
          </div>
        }
      >
        <CenteredFormContainer>
          <SectionContainer title="첫 로그인 온보딩" description="기본 정보와 동의 설정을 마치면 초기 진단척도로 이동합니다.">
            <StepStrip step={step} />
            {errorMessage ? <Banner variant="danger" title="저장 실패" description={errorMessage} /> : null}

            {step === "profile" ? (
              <form className="ms-stack" onSubmit={onSubmitProfile}>
                <Card title="온보딩 시작" description="출생년도와 동의를 기반으로 맞춤형 흐름을 제공합니다.">
                  <Banner
                    variant="info"
                    title="수집 원칙"
                    description="출생년도(YYYY)만 저장하고, 나이는 파생값으로 계산합니다. 민감정보는 동의 후에만 처리됩니다."
                  />
                </Card>

                <Card title="기본 정보" description="출생년도와 성별(선택)을 입력해주세요.">
                  <div className="ms-stack">
                    <Input
                      label="출생년도 (YYYY)"
                      placeholder="예: 1998"
                      inputMode="numeric"
                      value={birthYearRaw}
                      onChange={(event) => setBirthYearRaw(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                      helperText="유효한 연도 범위(1900~현재 연도)만 허용됩니다."
                      required
                      errorText={birthYearRaw.length === 4 && !birthYear ? "유효한 출생년도를 입력해주세요." : undefined}
                    />

                    <Select
                      label="성별 (선택)"
                      value={gender}
                      onChange={(event) => setGender(event.target.value as Gender | "")}
                      options={[...genderOptions]}
                    />
                  </div>
                </Card>

                <Card title="동의 설정" description="필수 동의 완료 후 다음 단계로 이동할 수 있습니다.">
                  <div className="ms-stack">
                    <label className="ms-check-row">
                      <input
                        type="checkbox"
                        checked={sensitiveDataRequired}
                        onChange={(event) => setSensitiveDataRequired(event.target.checked)}
                      />
                      <span>민감정보 처리 동의 (필수)</span>
                    </label>
                    <label className="ms-check-row">
                      <input
                        type="checkbox"
                        checked={personalizationOptional}
                        onChange={(event) => setPersonalizationOptional(event.target.checked)}
                      />
                      <span>개인화 추천 동의 (선택)</span>
                    </label>
                    <label className="ms-check-row">
                      <input
                        type="checkbox"
                        checked={modelImprovementOptional}
                        onChange={(event) => setModelImprovementOptional(event.target.checked)}
                      />
                      <span>모델 개선/품질 향상 활용 동의 (선택)</span>
                    </label>
                  </div>
                </Card>

                <Button type="submit" fullWidth loading={isSubmittingProfile} disabled={!birthYear || !sensitiveDataRequired}>
                  초기 진단척도로 진행
                </Button>
              </form>
            ) : (
              <Card title="초기 진단척도" description="실제 문항 검사 완료 결과로 baseline을 저장합니다.">
                <div className="ms-stack">
                  <Banner
                    variant="info"
                    title="진행 안내"
                    description="문항별 선택 응답을 완료하면 온보딩이 종료되고 홈으로 이동합니다."
                  />
                  <Button type="button" fullWidth onClick={() => router.push("/onboarding/assessment")}>
                    초기 진단 검사 시작
                  </Button>
                  <Button type="button" variant="secondary" fullWidth onClick={() => setStep("profile")}>
                    이전 단계로
                  </Button>
                </div>
              </Card>
            )}
          </SectionContainer>
        </CenteredFormContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
