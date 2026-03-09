"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  CenteredFormContainer,
  Input,
  SectionContainer
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import { isAuthEmulatorEnabled } from "../../../src/features/auth/firebase";

const RESEND_COOLDOWN_SECONDS = 60;

function mapResetError(code: string): string {
  if (code.includes("auth/user-not-found")) {
    return "해당 이메일로 가입된 계정을 찾을 수 없습니다.";
  }
  if (code.includes("auth/invalid-email")) {
    return "이메일 형식을 확인해주세요.";
  }
  if (code.includes("auth/unauthorized-continue-uri")) {
    return "인증 링크 이동 도메인이 허용되지 않았습니다. Firebase Authorized domains 설정을 확인해주세요.";
  }
  if (code.includes("auth/invalid-continue-uri") || code.includes("auth/missing-continue-uri")) {
    return "재설정 링크 설정이 올바르지 않습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("auth/operation-not-allowed")) {
    return "현재 비밀번호 재설정 기능이 비활성화되어 있습니다. Firebase 설정을 확인해주세요.";
  }
  if (code.includes("auth/invalid-api-key")) {
    return "Firebase API 키 설정이 올바르지 않습니다. 관리자에게 문의해주세요.";
  }
  if (code.includes("auth/network-request-failed")) {
    return "네트워크 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("auth/too-many-requests")) {
    return "요청이 너무 많아 잠시 제한되었습니다. 잠시 후 다시 시도해주세요.";
  }
  return `재설정 메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요. (${code})`;
}

export default function ResetPasswordPage() {
  const { sendPasswordReset } = useAuthContext();
  const emulatorEnabled = isAuthEmulatorEnabled();

  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    const interval = window.setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || cooldown > 0) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setNotice(null);
      await sendPasswordReset(email);
      setNotice(
        emulatorEnabled
          ? "요청을 처리했습니다. 에뮬레이터 모드에서는 실제 메일이 발송되지 않으며 Emulator UI에서 링크를 확인할 수 있습니다."
          : "비밀번호 재설정 메일을 보냈습니다. 받은편지함에 없으면 스팸함도 확인해주세요. 등록된 이메일이 아닐 경우 보안 정책상 메일이 오지 않을 수 있습니다."
      );
      startCooldown();
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown";
      setErrorMessage(mapResetError(code));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthRouteGuard policy="public-only">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="info">Reset Password</Badge>
          </div>
        }
      >
        <CenteredFormContainer>
          <SectionContainer title="비밀번호 재설정" description="가입한 이메일로 재설정 링크를 전송합니다.">
            <Card>
              <form className="ms-stack" onSubmit={onSubmit}>
                <Input
                  label="이메일"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />

                {notice ? <Banner variant="success" title="메일 전송 완료" description={notice} /> : null}
                {errorMessage ? <Banner variant="danger" title="요청 실패" description={errorMessage} /> : null}

                <Button type="submit" loading={isSubmitting} disabled={cooldown > 0 || email.trim().length < 5}>
                  {cooldown > 0 ? `재전송 가능까지 ${cooldown}s` : "재설정 메일 보내기"}
                </Button>
                <Link href="/auth/login" className="ms-inline-link">
                  로그인으로 돌아가기
                </Link>
              </form>
            </Card>
          </SectionContainer>
        </CenteredFormContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
