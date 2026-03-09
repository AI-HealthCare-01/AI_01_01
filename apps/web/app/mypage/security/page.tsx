"use client";

import { useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  PageContainer,
  PasswordInput,
  SectionContainer,
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import { MyPageTabShell } from "../../../src/features/mypage/tab-shell";
import { CommunityApiError, requestMyPagePasswordChange } from "../../../src/features/community";

function parseError(error: unknown): string {
  if (error instanceof CommunityApiError) {
    if (error.message === "Failed to fetch") {
      return "서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
    }
    return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
    }
    return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "알 수 없는 오류가 발생했습니다.";
}

export default function MyPageSecurityPage() {
  const { firebaseUser } = useAuthContext();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleChangePassword = async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);
      setErrorMessage(null);
      const response = await requestMyPagePasswordChange(firebaseUser, {
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      });
      setMessage(response.message);
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">보안 설정</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="마이페이지" description="왼쪽 탭을 선택하면 해당 항목 내용을 오른쪽에서 확인할 수 있습니다.">
            <MyPageTabShell>
              {message ? <Banner variant="success" title="안내" description={message} /> : null}
              {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

              <Card title="비밀번호 변경" description="현재 비밀번호는 변경 요청 시에만 입력합니다.">
                <PasswordInput
                  label="현재 비밀번호"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
                <PasswordInput
                  label="새 비밀번호"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
                <PasswordInput
                  label="새 비밀번호 확인"
                  value={newPasswordConfirm}
                  onChange={(event) => setNewPasswordConfirm(event.target.value)}
                  required
                />
                <Button onClick={handleChangePassword} loading={saving}>
                  비밀번호 변경 요청
                </Button>
              </Card>
            </MyPageTabShell>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
