"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  CenteredFormContainer,
  Input,
  PasswordInput,
  SectionContainer
} from "../../../src/components/ui";
import { useAuthContext, AuthRouteGuard } from "../../../src/features/auth";

const COOLDOWN_MS = 800;

function mapSignupError(code: string): string {
  if (code.includes("auth/email-already-in-use")) {
    return "이미 사용 중인 이메일입니다.";
  }
  if (code.includes("auth/weak-password")) {
    return "비밀번호 보안 수준이 낮습니다. 8자 이상으로 설정하세요.";
  }
  if (code.includes("auth/invalid-email")) {
    return "이메일 형식이 올바르지 않습니다.";
  }
  if (code.includes("auth/operation-not-allowed")) {
    return "현재 이메일/비밀번호 회원가입이 비활성화되어 있습니다. Firebase 설정을 확인해주세요.";
  }
  if (code.includes("auth/invalid-api-key")) {
    return "Firebase API 키가 올바르지 않습니다. 환경변수를 확인해주세요.";
  }
  if (code.includes("auth/configuration-not-found")) {
    return "Firebase Auth 설정이 아직 적용되지 않았습니다. 콘솔에서 Email/Password 제공자를 확인해주세요.";
  }
  if (code.includes("auth/unauthorized-domain")) {
    return "현재 도메인이 Firebase 인증 허용 도메인에 없습니다. Firebase Console에서 localhost를 추가해주세요.";
  }
  if (code.includes("auth/network-request-failed")) {
    return "네트워크 요청에 실패했습니다. 인터넷 연결 또는 브라우저 네트워크 차단 설정을 확인해주세요.";
  }
  if (code.includes("nickname") && code.includes("string_too_short")) {
    return "닉네임은 2자 이상 입력해주세요.";
  }
  if (code.includes("coach_name") && code.includes("string_too_short")) {
    return "마음코치 이름은 2자 이상 입력해주세요.";
  }
  if (code.includes("email_or_uid_already_exists")) {
    return "이미 가입 처리된 이메일입니다. 로그인하거나 비밀번호 재설정을 시도해주세요.";
  }
  if (code.includes("required_consents_missing")) {
    return "필수 동의 항목에 동의해야 회원가입이 가능합니다.";
  }
  const compactCode = code.replace(/\s+/g, " ").slice(0, 180);
  return `회원가입에 실패했습니다. 잠시 후 다시 시도해주세요. (${compactCode || "unknown"})`;
}

export default function SignupPage() {
  const router = useRouter();
  const { signUpWithEmail } = useAuthContext();

  const [nickname, setNickname] = useState("");
  const [coachName, setCoachName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [termsRequired, setTermsRequired] = useState(false);
  const [privacyRequired, setPrivacyRequired] = useState(false);
  const [ageRequired, setAgeRequired] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isValid = useMemo(() => {
    if (nickname.trim().length < 2) {
      return false;
    }
    if (coachName.trim().length < 2) {
      return false;
    }
    if (!email.trim()) {
      return false;
    }
    if (!password || password.length < 8) {
      return false;
    }
    if (password !== passwordConfirm) {
      return false;
    }
    return termsRequired && privacyRequired && ageRequired;
  }, [ageRequired, coachName, email, nickname, password, passwordConfirm, privacyRequired, termsRequired]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid || isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      await signUpWithEmail(email, password, {
        firebase_uid: "",
        email,
        nickname,
        coach_name: coachName,
        terms_required: termsRequired,
        privacy_required: privacyRequired,
        age_required: ageRequired
      });

      setTimeout(() => {
        router.replace("/auth/verify-email");
      }, COOLDOWN_MS);
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown";
      setErrorMessage(mapSignupError(code));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthRouteGuard policy="public-only">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">회원가입</Badge>
          </div>
        }
      >
        <CenteredFormContainer>
          <SectionContainer title="계정 만들기" description="가입 단계에서는 최소 정보만 수집하고, 상세 정보는 첫 로그인 온보딩에서 입력합니다.">
            <Card title="기본 정보 입력" description="닉네임, 이메일, 비밀번호를 먼저 설정해주세요.">
              <form className="ms-stack" onSubmit={onSubmit}>
                <Input
                  label="닉네임"
                  placeholder="닉네임을 입력하세요"
                  required
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  errorText={nickname.length > 0 && nickname.trim().length < 2 ? "닉네임은 2자 이상 입력해주세요." : undefined}
                />
                <Input
                  label="마음코치 이름"
                  labelHint="대화 화면에서 AI 마음코치로 표시될 이름입니다."
                  hideRequiredMark
                  placeholder="예: 미루"
                  required
                  value={coachName}
                  onChange={(event) => setCoachName(event.target.value)}
                  errorText={
                    coachName.length > 0 && coachName.trim().length < 2
                      ? "마음코치 이름은 2자 이상 입력해주세요."
                      : undefined
                  }
                />
                <Input
                  label="이메일"
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <PasswordInput
                  label="비밀번호"
                  placeholder="8자 이상"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <PasswordInput
                  label="비밀번호 확인"
                  placeholder="비밀번호를 다시 입력"
                  required
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  errorText={
                    passwordConfirm.length > 0 && password !== passwordConfirm
                      ? "비밀번호가 일치하지 않습니다."
                      : undefined
                  }
                />

                <Card title="필수 동의" description="회원가입 단계 필수 동의 항목">
                  <div className="ms-stack">
                    <label className="ms-check-row">
                      <input type="checkbox" checked={termsRequired} onChange={(event) => setTermsRequired(event.target.checked)} />
                      <span>서비스 이용약관에 동의합니다. (필수)</span>
                    </label>
                    <label className="ms-check-row">
                      <input type="checkbox" checked={privacyRequired} onChange={(event) => setPrivacyRequired(event.target.checked)} />
                      <span>개인정보 수집/이용에 동의합니다. (필수)</span>
                    </label>
                    <label className="ms-check-row">
                      <input type="checkbox" checked={ageRequired} onChange={(event) => setAgeRequired(event.target.checked)} />
                      <span>이용 가능 연령 기준을 확인했습니다. (필수)</span>
                    </label>
                  </div>
                </Card>

                {errorMessage ? <Banner variant="danger" title="회원가입 실패" description={errorMessage} /> : null}

                <Button fullWidth loading={isSubmitting} disabled={!isValid} type="submit">
                  회원가입
                </Button>
              </form>
            </Card>

            <Card title="가입 후 진행" description="이메일 확인 후 첫 로그인 시 온보딩(출생년도/동의/초기 진단척도)이 이어집니다.">
              <Link href="/auth/login" className="ms-inline-link">
                이미 계정이 있나요? 로그인
              </Link>
            </Card>
          </SectionContainer>
        </CenteredFormContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
