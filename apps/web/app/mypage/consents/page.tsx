"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  LoadingSkeleton,
  PageContainer,
  SectionContainer,
  StatCard,
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import { MyPageTabShell } from "../../../src/features/mypage/tab-shell";
import {
  CommunityApiError,
  getMyPageConsents,
  patchMyPageConsents,
  type MyPageConsentResponse,
} from "../../../src/features/community";

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

export default function ConsentsPage() {
  const { firebaseUser } = useAuthContext();

  const [consents, setConsents] = useState<MyPageConsentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await getMyPageConsents(firebaseUser);
      setConsents(response);
    } catch (error) {
      setErrorMessage(parseError(error));
      setConsents(null);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!firebaseUser || !consents) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);
      setErrorMessage(null);
      const response = await patchMyPageConsents(firebaseUser, {
        personalization_optional: consents.personalization_optional,
        model_improvement_optional: consents.model_improvement_optional,
        marketing_optional: consents.marketing_optional,
      });
      setConsents(response);
      setMessage("동의 설정이 저장되었습니다.");
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
            <Badge variant="brand">동의 설정</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="마이페이지" description="왼쪽 탭을 선택하면 해당 항목 내용을 오른쪽에서 확인할 수 있습니다.">
            <MyPageTabShell>
              {message ? <Banner variant="success" title="완료" description={message} /> : null}
              {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

              {loading ? (
                <Card>
                  <LoadingSkeleton lines={6} />
                </Card>
              ) : !consents ? (
                <Card title="동의 정보를 불러오지 못했습니다" description="잠시 후 다시 시도해 주세요." />
              ) : (
                <>
                  <div className="ms-grid ms-grid--two">
                    <StatCard label="필수 동의" value="3/3" helperText="서비스 이용 필수 항목" />
                    <StatCard
                      label="선택 동의"
                      value={String(
                        [consents.personalization_optional, consents.model_improvement_optional, consents.marketing_optional]
                          .filter(Boolean)
                          .length
                      )}
                      helperText="개인화/모델개선/마케팅"
                    />
                  </div>

                  <Card title="동의 상태">
                    <div className="ms-stack">
                      <p className="ms-card__desc">약관 동의(필수): {consents.terms_required ? "동의" : "미동의"}</p>
                      <p className="ms-card__desc">개인정보 동의(필수): {consents.privacy_required ? "동의" : "미동의"}</p>
                      <p className="ms-card__desc">민감정보 동의(필수): {consents.sensitive_data_required ? "동의" : "미동의"}</p>
                    </div>

                    <div className="ms-row">
                      <Button
                        variant={consents.personalization_optional ? "secondary" : "ghost"}
                        onClick={() =>
                          setConsents((previous) =>
                            previous
                              ? { ...previous, personalization_optional: !previous.personalization_optional }
                              : previous
                          )
                        }
                      >
                        개인화 동의 {consents.personalization_optional ? "ON" : "OFF"}
                      </Button>
                      <Button
                        variant={consents.model_improvement_optional ? "secondary" : "ghost"}
                        onClick={() =>
                          setConsents((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  model_improvement_optional: !previous.model_improvement_optional,
                                }
                              : previous
                          )
                        }
                      >
                        모델개선 동의 {consents.model_improvement_optional ? "ON" : "OFF"}
                      </Button>
                    </div>

                    <div className="ms-row">
                      <Button
                        variant={consents.marketing_optional ? "secondary" : "ghost"}
                        onClick={() =>
                          setConsents((previous) =>
                            previous
                              ? { ...previous, marketing_optional: !previous.marketing_optional }
                              : previous
                          )
                        }
                      >
                        마케팅 안내 수신 {consents.marketing_optional ? "ON" : "OFF"}
                      </Button>
                      <Button onClick={handleSave} loading={saving}>
                        저장
                      </Button>
                    </div>
                  </Card>
                </>
              )}
            </MyPageTabShell>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
