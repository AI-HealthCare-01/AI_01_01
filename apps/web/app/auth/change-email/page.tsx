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
  SectionContainer,
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";

function mapError(code: string): string {
  if (code.includes("auth/invalid-email")) {
    return "변경할 이메일 형식을 확인해주세요.";
  }
  if (code.includes("auth/email-already-in-use")) {
    return "이미 사용 중인 이메일입니다.";
  }
  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) {
    return "현재 비밀번호가 올바르지 않습니다.";
  }
  if (code.includes("auth/requires-recent-login")) {
    return "보안을 위해 다시 로그인한 뒤 이메일 변경을 시도해주세요.";
  }
  return `이메일 변경 요청에 실패했습니다. (${code})`;
}

export default function ChangeEmailPage() {
  const router = useRouter();
  const { session, changeEmailWithReauth } = useAuthContext();

  const [nextEmail, setNextEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentEmail = session?.account.email ?? "";

  const canSubmit = useMemo(() => {
    if (nextEmail.trim().length < 5 || password.trim().length < 8) {
      return false;
    }
    return nextEmail.trim().toLowerCase() !== currentEmail.trim().toLowerCase();
  }, [currentEmail, nextEmail, password]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || submitting) {
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      setNotice(null);
      const normalizedEmail = nextEmail.trim().toLowerCase();
      await changeEmailWithReauth(normalizedEmail, password);
      window.sessionStorage.setItem("ms_pending_email_change", normalizedEmail);
      setNotice("새 이메일로 확인 메일을 보냈습니다. 메일 확인 후 다시 진행해주세요.");
      setPassword("");
      router.push(`/auth/verify-email?source=email-change&pending_email=${encodeURIComponent(normalizedEmail)}`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown_error";
      setErrorMessage(mapError(code));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-unverified">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="warning">Change Email</Badge>
          </div>
        }
      >
        <CenteredFormContainer>
          <SectionContainer title="이메일 변경" description="보안을 위해 현재 비밀번호로 재인증 후 새 이메일 확인 메일을 보냅니다.">
            <Card>
              <form className="ms-stack" onSubmit={onSubmit}>
                <Input label="현재 이메일" value={currentEmail} readOnly />
                <Input
                  label="변경할 이메일"
                  type="email"
                  required
                  value={nextEmail}
                  onChange={(event) => setNextEmail(event.target.value)}
                />
                <PasswordInput
                  label="현재 비밀번호"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />

                {notice ? <Banner variant="success" title="요청 완료" description={notice} /> : null}
                {errorMessage ? <Banner variant="danger" title="요청 실패" description={errorMessage} /> : null}

                <Button type="submit" loading={submitting} disabled={!canSubmit}>
                  새 이메일 확인 메일 보내기
                </Button>
                <div className="ms-row">
                  <Button type="button" variant="secondary" onClick={() => router.push("/auth/verify-email")}>
                    이메일 확인 화면으로 돌아가기
                  </Button>
                </div>
                <Link className="ms-inline-link" href="/auth/login">
                  로그인 화면으로 이동
                </Link>
              </form>
            </Card>
          </SectionContainer>
        </CenteredFormContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
