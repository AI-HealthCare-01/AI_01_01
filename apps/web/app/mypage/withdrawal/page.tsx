"use client";

import { useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  Modal,
  PageContainer,
  PasswordInput,
  SectionContainer,
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import { MyPageTabShell } from "../../../src/features/mypage/tab-shell";

function mapDeleteError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("auth/wrong-password") || code.includes("auth/invalid-credential")) {
    return "현재 비밀번호가 올바르지 않습니다.";
  }
  if (code.includes("auth/too-many-requests")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("auth/network-request-failed") || code.includes("Failed to fetch")) {
    return "네트워크 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("auth/requires-recent-login")) {
    return "보안을 위해 다시 로그인한 뒤 회원탈퇴를 진행해주세요.";
  }
  return "회원탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요.";
}

export default function MyPageWithdrawalPage() {
  const { deleteAccountWithReauth } = useAuthContext();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteAgreementChecked, setDeleteAgreementChecked] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const closeDeleteModal = () => {
    if (deletingAccount) {
      return;
    }
    setDeleteModalOpen(false);
    setDeletePassword("");
    setDeleteAgreementChecked(false);
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword || !deleteAgreementChecked || deletingAccount) {
      return;
    }

    try {
      setDeletingAccount(true);
      setErrorMessage(null);
      await deleteAccountWithReauth(deletePassword);
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login?source=account-deleted";
      }
    } catch (error) {
      setErrorMessage(mapDeleteError(error));
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="danger">회원탈퇴</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="마이페이지" description="왼쪽 탭을 선택하면 해당 항목 내용을 오른쪽에서 확인할 수 있습니다.">
            <MyPageTabShell>
              {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

              <Card title="회원탈퇴" description="탈퇴 시 계정 세션이 종료되며 복구가 어려울 수 있습니다.">
                <Banner
                  variant="warning"
                  title="탈퇴 전 확인"
                  description="게시글, 댓글, 활동 기록 등 계정 기반 데이터 접근이 제한될 수 있습니다. 진행 전 반드시 확인해주세요."
                />
                <div className="ms-row">
                  <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
                    회원탈퇴
                  </Button>
                </div>
              </Card>
            </MyPageTabShell>
          </SectionContainer>
        </PageContainer>
      </AppShell>
      <Modal
        open={deleteModalOpen}
        title="정말 회원탈퇴 하시겠습니까?"
        description="보안을 위해 현재 비밀번호를 다시 확인합니다."
        onClose={closeDeleteModal}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeDeleteModal} disabled={deletingAccount}>
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void handleDeleteAccount()}
              loading={deletingAccount}
              disabled={!deletePassword || !deleteAgreementChecked}
            >
              회원탈퇴 진행
            </Button>
          </>
        }
      >
        <div className="ms-stack">
          <PasswordInput
            label="현재 비밀번호"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
            required
          />
          <label className="ms-check-row">
            <input
              type="checkbox"
              checked={deleteAgreementChecked}
              onChange={(event) => setDeleteAgreementChecked(event.target.checked)}
            />
            <span>회원탈퇴 시 계정 복구가 어려울 수 있음을 확인했습니다.</span>
          </label>
          <Banner
            variant="warning"
            title="안내"
            description="탈퇴 후에는 현재 계정으로 로그인할 수 없으며, 일부 데이터는 관련 정책에 따라 보관 또는 삭제됩니다."
          />
        </div>
      </Modal>
    </AuthRouteGuard>
  );
}
