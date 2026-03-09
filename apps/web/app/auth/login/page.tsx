"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

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
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import { isOnboardingComplete } from "../../../src/features/auth/status";

function mapLoginError(code: string): string {
  if (code.includes("auth/user-not-found")) {
    return "등록되지 않은 이메일 계정입니다. 회원가입 여부를 확인해주세요.";
  }
  if (code.includes("auth/wrong-password")) {
    return "비밀번호가 올바르지 않습니다. 다시 입력해주세요.";
  }
  if (code.includes("auth/account-exists-with-different-credential")) {
    return "계정은 존재하지만 비밀번호 로그인 방식이 설정되어 있지 않습니다.";
  }
  if (code.includes("auth/user-disabled")) {
    return "해당 계정은 비활성화 상태입니다. 고객지원으로 문의해주세요.";
  }
  if (code.includes("auth/too-many-requests")) {
    return "로그인 시도가 많아 잠시 제한되었습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("auth/network-request-failed")) {
    return "네트워크 연결을 확인한 뒤 다시 시도해주세요.";
  }
  if (code.includes("auth/invalid-api-key")) {
    return "인증 설정이 올바르지 않습니다. 관리자에게 문의해주세요.";
  }
  if (code.includes("auth/operation-not-allowed")) {
    return "현재 이메일/비밀번호 로그인이 비활성화되어 있습니다. Firebase 설정을 확인해주세요.";
  }
  if (code.includes("auth/invalid-credential") || code.includes("auth/invalid-login-credentials")) {
    return "이메일 또는 비밀번호를 다시 확인해주세요.";
  }
  if (code.includes("firebase_token_invalid")) {
    return "로그인은 되었지만 서버 세션 확인에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("missing_firebase_auth")) {
    return "인증 토큰이 누락되었습니다. 페이지를 새로고침 후 다시 시도해주세요.";
  }
  if (code.includes("account_not_found")) {
    return "계정 동기화가 완료되지 않았습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("session_bootstrap_failed")) {
    return "로그인 후 계정 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
  return `로그인에 실패했습니다. 잠시 후 다시 시도해주세요. (${code})`;
}

export default function LoginPage() {
  const router = useRouter();
  const { phase, signInWithEmail, logout } = useAuthContext();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    const force = params.get("force");

    if (source === "password-reset") {
      setSourceNotice("비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해주세요.");
      return;
    }

    if (source === "email-action") {
      setSourceNotice("이메일 인증 링크 처리가 완료되었습니다. 로그인 후 계정 상태를 확인해주세요.");
      return;
    }

    if (force === "1") {
      setSourceNotice("현재 세션이 남아 있을 경우, 아래에서 로그아웃 후 다른 계정으로 로그인할 수 있습니다.");
    }
  }, []);

  const onForceLogout = async () => {
    try {
      setErrorMessage(null);
      await logout();
      setSourceNotice("현재 세션에서 로그아웃했습니다. 다른 계정으로 로그인할 수 있습니다.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown";
      setErrorMessage(`로그아웃에 실패했습니다. (${code})`);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const nextSession = await signInWithEmail(email, password);
      if (!nextSession) {
        throw new Error("session_bootstrap_failed");
      }

      if (!nextSession.account.email_verified) {
        router.replace("/auth/verify-email");
        return;
      }

      if (isOnboardingComplete(nextSession)) {
        router.replace("/");
        return;
      }

      router.replace("/onboarding");
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown";
      setErrorMessage(mapLoginError(code));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthRouteGuard policy="public-only">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">계정 로그인</Badge>
          </div>
        }
      >
        <CenteredFormContainer>
          <SectionContainer title="로그인" description="이메일 인증 상태에 따라 접근 가능한 기능이 달라집니다.">
            <Card title="계속 진행하려면 로그인해주세요" description="이메일 확인 완료 후 홈, 대시보드, 커뮤니티를 사용할 수 있습니다.">
              <form className="ms-stack" onSubmit={onSubmit}>
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
                  placeholder="비밀번호 입력"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />

                {errorMessage ? <Banner variant="danger" title="로그인 실패" description={errorMessage} /> : null}
                {sourceNotice ? <Banner variant="info" title="안내" description={sourceNotice} /> : null}

                <Button fullWidth loading={isSubmitting} type="submit">
                  로그인
                </Button>
                {phase === "signed_in" ? (
                  <Button type="button" variant="secondary" fullWidth onClick={onForceLogout}>
                    현재 세션 로그아웃
                  </Button>
                ) : null}

                <Link href="/auth/reset-password" className="ms-inline-link">
                  비밀번호를 잊으셨나요?
                </Link>
              </form>
            </Card>

            <Card title="처음 이용하시나요?" description="회원가입 후 온보딩을 완료하면 바로 개인 홈을 사용할 수 있습니다.">
              <Link href="/auth/signup" className="ms-inline-link">
                회원가입으로 이동
              </Link>
            </Card>
          </SectionContainer>
        </CenteredFormContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
