"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingSkeleton,
  SectionContainer,
  Select,
  Textarea,
} from "../../../src/components/ui";
import { useAuthContext } from "../../../src/features/auth";
import {
  AdminApiError,
  decideSupportExtension,
  listAdminRoles,
  listSupportExtensions,
  requestSupportExtension,
  setAdminRole,
  useAdminConsoleContext,
  type AdminBaseRole,
  type AdminRoleListResponse,
  type ExtensionRecord,
} from "../../../src/features/admin-console";

function parseError(error: unknown): string {
  if (error instanceof AdminApiError) {
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

export default function AdminRolesPage() {
  const { firebaseUser } = useAuthContext();
  const { me } = useAdminConsoleContext();

  const [targetUserId, setTargetUserId] = useState("");
  const [targetRole, setTargetRole] = useState<AdminBaseRole>("support");
  const [requestNote, setRequestNote] = useState("모델 운영 모니터링 권한 요청");

  const [roles, setRoles] = useState<AdminRoleListResponse | null>(null);
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const isOwner = me?.actor.base_role === "owner";
  const canReviewExtension = me?.actor.base_role === "owner" || me?.actor.base_role === "admin";
  const isSupport = me?.actor.base_role === "support";

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const roleResponse = await listAdminRoles(firebaseUser, { limit: 200 });
      setRoles(roleResponse);

      if (canReviewExtension) {
        const extResponse = await listSupportExtensions(firebaseUser, { limit: 100 });
        setExtensions(extResponse);
      } else {
        setExtensions([]);
      }
    } catch (error) {
      setErrorMessage(parseError(error));
      setRoles(null);
      setExtensions([]);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, canReviewExtension]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAssignRole = async () => {
    if (!firebaseUser || !isOwner || !targetUserId.trim()) {
      return;
    }

    try {
      setWorkingId("assign-role");
      setActionMessage(null);
      await setAdminRole(firebaseUser, targetUserId.trim(), { base_role: targetRole });
      setActionMessage("관리자 권한이 반영되었습니다.");
      setTargetUserId("");
      await load();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorkingId(null);
    }
  };

  const handleRequestExtension = async () => {
    if (!firebaseUser || !isSupport) {
      return;
    }

    try {
      setWorkingId("request-extension");
      setActionMessage(null);
      await requestSupportExtension(firebaseUser, {
        extension_code: "analyst_ml_extension",
        note: requestNote,
      });
      setActionMessage("확장 권한 요청이 등록되었습니다.");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorkingId(null);
    }
  };

  const handleDecideExtension = async (
    extensionId: string,
    decision: "approved" | "rejected" | "revoked"
  ) => {
    if (!firebaseUser || !canReviewExtension) {
      return;
    }

    try {
      setWorkingId(extensionId);
      setActionMessage(null);
      await decideSupportExtension(firebaseUser, extensionId, {
        decision,
        note: `${decision} by ${me?.actor.base_role ?? "admin"}`,
      });
      setActionMessage(`확장 권한 요청이 ${decision} 처리되었습니다.`);
      await load();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <SectionContainer
      title="관리자 권한 관리"
      description="Owner/Admin/Support 역할과 Support의 analyst_ml_extension 요청/심사 흐름을 관리합니다."
    >
      {actionMessage ? <Banner variant="success" title="완료" description={actionMessage} /> : null}
      {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

      {isOwner ? (
        <Card title="기본 역할 부여" description="Owner만 관리자 역할 부여/회수 가능">
          <div className="ms-grid ms-grid--two">
            <Input
              label="target_user_id"
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
              placeholder="usr_xxx"
            />
            <Select
              label="base_role"
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value as AdminBaseRole)}
              options={[
                { label: "support", value: "support" },
                { label: "admin", value: "admin" },
                { label: "owner", value: "owner" },
              ]}
            />
          </div>
          <Button onClick={() => void handleAssignRole()} loading={workingId === "assign-role"}>
            역할 부여
          </Button>
        </Card>
      ) : null}

      {isSupport ? (
        <Card title="확장 권한 신청" description="analyst_ml_extension은 신청 후 Owner/Admin 검토를 거칩니다.">
          <Textarea
            label="신청 사유"
            value={requestNote}
            onChange={(event) => setRequestNote(event.target.value)}
          />
          <Button
            variant="secondary"
            onClick={() => void handleRequestExtension()}
            loading={workingId === "request-extension"}
          >
            extension 요청
          </Button>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <LoadingSkeleton lines={8} />
        </Card>
      ) : errorMessage ? (
        <ErrorState
          title="권한 데이터를 불러오지 못했습니다"
          description="잠시 후 다시 시도해 주세요."
          retryAction={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      ) : !roles || roles.items.length === 0 ? (
        <EmptyState title="등록된 관리자 역할이 없습니다" description="Owner가 첫 권한을 설정해야 합니다." />
      ) : (
        <>
          <Card title="기본 역할 목록">
            <div className="ms-admin-list">
              {roles.items.map((item) => (
                <article key={item.role.admin_user_id} className="ms-admin-list__item">
                  <div>
                    <p className="ms-admin-list__title">{item.role.admin_user_id}</p>
                    <p className="ms-card__desc">업데이트 {item.role.updated_at.slice(0, 16).replace("T", " ")}</p>
                  </div>
                  <div className="ms-row">
                    <Badge variant="brand">{item.role.base_role}</Badge>
                    {item.extension_status ? (
                      <Badge variant="info">ext:{item.extension_status.status}</Badge>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </Card>

          {canReviewExtension ? (
            <Card title="확장 권한 요청 큐" description="Owner/Admin 검토">
              {extensions.length === 0 ? (
                <p className="ms-card__desc">확장 권한 요청이 없습니다.</p>
              ) : (
                <div className="ms-admin-list">
                  {extensions.map((extension) => (
                    <article key={extension.extension_id} className="ms-admin-list__item">
                      <div>
                        <p className="ms-admin-list__title">{extension.admin_user_id}</p>
                        <p className="ms-card__desc">
                          {extension.extension_code} · {extension.note ?? "-"}
                        </p>
                        <p className="ms-card__desc">
                          요청 {extension.requested_at.slice(0, 16).replace("T", " ")}
                        </p>
                      </div>
                      <div className="ms-row">
                        <Badge variant="warning">{extension.status}</Badge>
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={() => void handleDecideExtension(extension.extension_id, "approved")}
                          loading={workingId === extension.extension_id}
                        >
                          승인
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => void handleDecideExtension(extension.extension_id, "rejected")}
                          loading={workingId === extension.extension_id}
                        >
                          반려
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Card>
          ) : null}
        </>
      )}
    </SectionContainer>
  );
}
