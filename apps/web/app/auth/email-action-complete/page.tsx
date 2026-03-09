"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  AppShell,
  Badge,
  Card,
  CenteredFormContainer,
  SectionContainer
} from "../../../src/components/ui";

export default function EmailActionCompletePage() {
  const router = useRouter();

  useEffect(() => {
    window.close();
    const timer = window.setTimeout(() => {
      router.replace("/auth/login");
    }, 400);
    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <AppShell
      headerAction={
        <div className="ms-row">
          <Badge variant="success">완료</Badge>
        </div>
      }
    >
      <CenteredFormContainer>
        <SectionContainer title="이메일 인증 완료" description="이제 새 계정으로 로그인할 수 있습니다.">
          <Card>
            <div className="ms-stack">
              <p className="ms-card__desc">
                다시 웹사이트로 돌아가서 로그인 후 온보딩을 진행해주세요. 이 탭은 자동으로 닫힙니다.
              </p>
            </div>
          </Card>
        </SectionContainer>
      </CenteredFormContainer>
    </AppShell>
  );
}
