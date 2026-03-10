"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  CenteredFormContainer,
  SectionContainer
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import { isOnboardingComplete } from "../../../src/features/auth/status";
import { isAuthEmulatorEnabled } from "../../../src/features/auth/firebase";

const RESEND_COOLDOWN_SECONDS = 60;

function mapResendError(code: string): string {
  if (code.includes("auth/too-many-requests")) {
    return "재전송 요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("auth/network-request-failed")) {
    return "네트워크 연결을 확인한 뒤 다시 시도해주세요.";
  }
  if (code.includes("auth/unauthorized-continue-uri")) {
    return "인증 링크 이동 도메인이 허용되지 않았습니다. Firebase Authorized domains 설정을 확인해주세요.";
  }
  if (code.includes("auth/invalid-continue-uri") || code.includes("auth/missing-continue-uri")) {
    return "인증 링크 설정이 올바르지 않습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("auth/invalid-api-key")) {
    return "Firebase 설정이 올바르지 않습니다. 관리자에게 문의해주세요.";
  }
  return `재전송에 실패했습니다. (${code})`;
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const { firebaseUser, refreshSession, resendVerificationEmail, logout } = useAuthContext();
  const emulatorEnabled = isAuthEmulatorEnabled();

  const [isSending, setIsSending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const email = useMemo(() => firebaseUser?.email ?? "", [firebaseUser?.email]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") === "email-action") {
      setSourceNotice("인증 버튼을 통해 돌아왔습니다. 아래 버튼으로 확인 상태를 동기화하세요.");
    }

    const pendingFromQuery = params.get("pending_email")?.trim().toLowerCase() || "";
    if (pendingFromQuery) {
      setPendingEmail(pendingFromQuery);
      window.sessionStorage.setItem("ms_pending_email_change", pendingFromQuery);
      return;
    }

    const pendingFromStorage = window.sessionStorage.getItem("ms_pending_email_change")?.trim().toLowerCase() || "";
    if (pendingFromStorage) {
      setPendingEmail(pendingFromStorage);
    }
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      return;
    }

    let active = true;
    let syncing = false;

    const syncIfNeeded = async () => {
      if (!active || syncing) {
        return;
      }
      syncing = true;
      try {
        await firebaseUser.reload();
        const nextSession = await refreshSession();
        if (!active) {
          return;
        }
        if (firebaseUser.emailVerified && nextSession) {
          window.sessionStorage.removeItem("ms_pending_email_change");
          setPendingEmail(null);
          if (isOnboardingComplete(nextSession)) {
            router.replace("/");
          } else {
            router.replace("/onboarding");
          }
        }
      } catch {
        // no-op: user can still manually trigger check button.
      } finally {
        syncing = false;
      }
    };

    const onFocus = () => {
      void syncIfNeeded();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncIfNeeded();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    void syncIfNeeded();

    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [firebaseUser, refreshSession, router]);

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

  const onResend = async () => {
    if (cooldown > 0 || isSending) {
      return;
    }

    try {
      setIsSending(true);
      setErrorMessage(null);
      await resendVerificationEmail();
      setNotice(
        emulatorEnabled
          ? "요청을 처리했습니다. 에뮬레이터 모드에서는 실제 메일이 발송되지 않고 Emulator UI에서 링크를 확인합니다."
          : "이메일 확인 메일을 다시 보냈습니다. 받은편지함에 없으면 스팸함도 확인해주세요."
      );
      startCooldown();
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown";
      setErrorMessage(mapResendError(code));
    } finally {
      setIsSending(false);
    }
  };

  const onChecked = async () => {
    if (!firebaseUser || isChecking) {
      return;
    }

    try {
      setIsChecking(true);
      setErrorMessage(null);
      await firebaseUser.reload();
      const nextSession = await refreshSession();

      if (firebaseUser.emailVerified && nextSession) {
        window.sessionStorage.removeItem("ms_pending_email_change");
        setPendingEmail(null);
        if (isOnboardingComplete(nextSession)) {
          router.replace("/");
        } else {
          router.replace("/onboarding");
        }
        return;
      }

      setNotice("아직 이메일 확인이 완료되지 않았습니다. 메일함을 다시 확인해주세요.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown";
      setErrorMessage(`확인 상태를 가져오지 못했습니다. (${code})`);
    } finally {
      setIsChecking(false);
    }
  };

  const onLogout = async () => {
    await logout();
    router.replace("/auth/login");
  };

  return (
    <AuthRouteGuard policy="require-unverified">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="warning">Verify Email</Badge>
          </div>
        }
      >
        <CenteredFormContainer>
          <SectionContainer title="이메일 확인 대기" description="이메일 확인 전에는 주요 기능 접근이 제한됩니다.">
            <Card>
              <div className="ms-stack">
                <p className="ms-card__desc">
                  가입한 이메일 <strong>{pendingEmail || email || "(이메일 없음)"}</strong> 로 확인 메일을 보냈습니다.
                </p>
                <Banner
                  variant="warning"
                  title="메일이 안 보이나요?"
                  description="받은편지함에 없으면 스팸/프로모션/광고함을 확인해주세요. 발신자 이름은 midnight로 보이며 주소는 no-reply@<firebase-project>.firebaseapp.com 형식입니다."
                />

                {notice ? <Banner variant="info" title="안내" description={notice} /> : null}
                {sourceNotice ? <Banner variant="success" title="링크 처리됨" description={sourceNotice} /> : null}
                {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

                <Button onClick={onChecked} loading={isChecking}>
                  확인 완료 후 계속하기
                </Button>
                <Button variant="secondary" onClick={onResend} loading={isSending} disabled={cooldown > 0}>
                  {cooldown > 0 ? `다시 보내기 (${cooldown}s)` : "확인 메일 다시 보내기"}
                </Button>
                <Button variant="ghost" onClick={() => router.push("/auth/change-email")}>
                  이메일 변경하기
                </Button>
                <Button variant="ghost" onClick={onLogout}>
                  다른 계정으로 로그인
                </Button>
                <Link className="ms-inline-link" href="/auth/login">
                  로그인 화면으로 이동
                </Link>
              </div>
            </Card>
          </SectionContainer>
        </CenteredFormContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
