"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  StatCard,
} from "../../../src/components/ui";
import { useAuthContext } from "../../../src/features/auth";
import {
  type AdminBaseRole,
  AdminApiError,
  listAdminUsers,
  useAdminConsoleContext,
  type AdminUserListItem,
} from "../../../src/features/admin-console";

const PAGE_SIZE = 10;

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

function resolveUserRole(item: AdminUserListItem): AdminBaseRole | "general_member" {
  return item.admin_role ?? "general_member";
}

function roleLabel(role: AdminBaseRole | "general_member"): string {
  if (role === "owner") {
    return "owner";
  }
  if (role === "admin") {
    return "admin";
  }
  if (role === "support") {
    return "support";
  }
  return "일반회원";
}

function roleBadgeVariant(role: AdminBaseRole | "general_member"): "neutral" | "warning" | "success" | "danger" | "info" | "brand" {
  if (role === "owner") {
    return "brand";
  }
  if (role === "admin") {
    return "info";
  }
  if (role === "support") {
    return "warning";
  }
  return "neutral";
}

function matchesUserKeyword(item: AdminUserListItem, keyword: string): boolean {
  const role = resolveUserRole(item);
  const source = [
    item.user_id,
    item.nickname,
    item.account_status,
    roleLabel(role),
  ]
    .join(" ")
    .toLowerCase();
  return source.includes(keyword.toLowerCase());
}

interface PageNumberNavProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function PageNumberNav({ page, totalPages, onPageChange }: PageNumberNavProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="ms-admin-pagination" aria-label="페이지 선택">
      {Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => (
        <Button
          key={value}
          size="sm"
          variant={page === value ? "secondary" : "tertiary"}
          onClick={() => onPageChange(value)}
        >
          {value}
        </Button>
      ))}
    </div>
  );
}

export default function AdminUsersPage() {
  const { firebaseUser } = useAuthContext();
  const { me } = useAdminConsoleContext();

  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [highRiskQuery, setHighRiskQuery] = useState("");
  const [submittedHighRiskQuery, setSubmittedHighRiskQuery] = useState("");
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [userListCollapsed, setUserListCollapsed] = useState(true);
  const [highRiskListCollapsed, setHighRiskListCollapsed] = useState(true);
  const [userPage, setUserPage] = useState(1);
  const [highRiskPage, setHighRiskPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canOpenRestrictionScreen =
    me?.actor.base_role === "owner" || me?.actor.base_role === "admin";

  const loadUsers = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await listAdminUsers(firebaseUser, { q: submittedQuery, limit: 100 });
      setItems(response.items);
    } catch (error) {
      setErrorMessage(parseError(error));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, submittedQuery]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const summary = useMemo(() => {
    const active = items.filter((item) => item.account_status === "active").length;
    const suspended = items.filter((item) => item.account_status !== "active").length;
    const highActivity = items.filter((item) => item.activity_count >= 10).length;
    const highRiskUsers = items.filter((item) => item.high_risk_flag).length;
    const roleCounts = {
      general_member: items.filter((item) => resolveUserRole(item) === "general_member").length,
      support: items.filter((item) => resolveUserRole(item) === "support").length,
      admin: items.filter((item) => resolveUserRole(item) === "admin").length,
      owner: items.filter((item) => resolveUserRole(item) === "owner").length,
    };
    return { active, suspended, highActivity, highRiskUsers, roleCounts };
  }, [items]);

  const highRiskItems = useMemo(
    () => items.filter((item) => item.high_risk_flag),
    [items]
  );

  const filteredHighRiskItems = useMemo(() => {
    const keyword = submittedHighRiskQuery.trim();
    if (!keyword) {
      return highRiskItems;
    }
    return highRiskItems.filter((item) => matchesUserKeyword(item, keyword));
  }, [highRiskItems, submittedHighRiskQuery]);

  const userTotalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const highRiskTotalPages = Math.max(1, Math.ceil(filteredHighRiskItems.length / PAGE_SIZE));

  useEffect(() => {
    setUserPage((previous) => Math.min(previous, userTotalPages));
  }, [userTotalPages]);

  useEffect(() => {
    setHighRiskPage((previous) => Math.min(previous, highRiskTotalPages));
  }, [highRiskTotalPages]);

  const pagedUsers = useMemo(() => {
    const start = (userPage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, userPage]);

  const pagedHighRiskUsers = useMemo(() => {
    const start = (highRiskPage - 1) * PAGE_SIZE;
    return filteredHighRiskItems.slice(start, start + PAGE_SIZE);
  }, [filteredHighRiskItems, highRiskPage]);

  const handleMainSearch = () => {
    setSubmittedQuery(query.trim());
    setUserPage(1);
    setHighRiskPage(1);
    setSubmittedHighRiskQuery("");
  };

  const handleHighRiskSearch = () => {
    setSubmittedHighRiskQuery(highRiskQuery.trim());
    setHighRiskPage(1);
  };

  const renderUserRow = (item: AdminUserListItem) => {
    const role = resolveUserRole(item);
    const ownerProtected = role === "owner";
    const canOpenRestriction = canOpenRestrictionScreen && !ownerProtected;

    return (
      <article key={item.user_id} className="ms-admin-list__item">
        <div>
          <p className="ms-admin-list__title">{item.nickname}</p>
          <p className="ms-card__desc">{item.user_id}</p>
          <p className="ms-card__desc">
            상태 {item.account_status} · 활동 {item.activity_count} · 문의 {item.support_ticket_count}
          </p>
        </div>
        <div className="ms-row">
          <Badge variant={roleBadgeVariant(role)}>{roleLabel(role)}</Badge>
          {item.high_risk_flag ? <Badge variant="danger">고위험</Badge> : null}
          <Badge variant="info">IP 비노출</Badge>
          {item.account_status !== "active" ? <Badge variant="warning">{item.account_status}</Badge> : null}
          {ownerProtected ? (
            <Button size="sm" variant="tertiary" disabled>
              Owner는 제재 불가
            </Button>
          ) : canOpenRestriction ? (
            <Link
              href={`/admin/restrictions?user_id=${encodeURIComponent(item.user_id)}`}
              className="ms-inline-link"
            >
              제재/차단
            </Link>
          ) : (
            <Button size="sm" variant="tertiary" disabled>
              제재/차단
            </Button>
          )}
        </div>
      </article>
    );
  };

  return (
    <SectionContainer
      title="사용자 관리"
      description="기본 사용자 목록에서는 IP/이메일을 노출하지 않습니다. 차단/보안 조치는 전용 화면에서만 처리합니다."
    >
      {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}
      {!canOpenRestrictionScreen ? (
        <Banner
          variant="warning"
          title="권한 제한"
          description="Support는 사용자 기본 조회만 가능합니다. 제재/차단 화면 접근은 Admin/Owner만 허용됩니다."
        />
      ) : null}

      {!loading && !errorMessage ? (
        <div className="ms-grid ms-grid--three">
          <StatCard label="조회 결과" value={String(items.length)} helperText="현재 검색 조건" />
          <StatCard label="활성 계정" value={String(summary.active)} helperText="account_status=active" />
          <StatCard label="제한 상태 계정" value={String(summary.suspended)} helperText="active 외 상태" />
          <StatCard label="활동 높은 계정" value={String(summary.highActivity)} helperText="activity_count 10+" />
          <StatCard label="일반회원" value={String(summary.roleCounts.general_member)} helperText="관리자 권한 없음" />
          <StatCard label="고위험 사용자" value={String(summary.highRiskUsers)} helperText="위험 플래그/높은 지표" />
          <StatCard label="Support" value={String(summary.roleCounts.support)} helperText="지원 권한" />
          <StatCard label="Admin" value={String(summary.roleCounts.admin)} helperText="운영 권한" />
          <StatCard label="Owner" value={String(summary.roleCounts.owner)} helperText="최종 승인 권한" />
        </div>
      ) : null}

      {loading ? (
        <Card>
          <LoadingSkeleton lines={10} />
        </Card>
      ) : errorMessage ? (
        <ErrorState
          title="사용자 목록을 불러오지 못했습니다"
          description="잠시 후 다시 시도해 주세요."
          retryAction={<Button onClick={() => void loadUsers()}>다시 시도</Button>}
        />
      ) : items.length === 0 ? (
        <EmptyState title="검색 결과가 없습니다" description="조건을 변경해 다시 시도하세요." />
      ) : (
        <>
          <Card className="ms-admin-list-panel">
            <div className="ms-admin-list-panel__header">
              <div>
                <p className="ms-admin-list__title">사용자 목록</p>
                <p className="ms-card__desc">
                  페이지 {userPage}/{userTotalPages} · 총 {items.length}명
                </p>
              </div>
              <Button size="sm" variant="tertiary" onClick={() => setUserListCollapsed((prev) => !prev)}>
                {userListCollapsed ? "펼치기" : "접기"}
              </Button>
            </div>

            {userListCollapsed ? (
              <p className="ms-card__desc">사용자 목록이 접혀 있습니다.</p>
            ) : (
              <>
                <div className="ms-admin-users-search__row ms-admin-users-search__row--inline">
                  <Input
                    label="사용자 조회"
                    placeholder="user_id / email / nickname"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <Button size="sm" variant="secondary" onClick={handleMainSearch}>
                    조회
                  </Button>
                </div>
                <div className="ms-admin-list">{pagedUsers.map((item) => renderUserRow(item))}</div>
                <PageNumberNav page={userPage} totalPages={userTotalPages} onPageChange={setUserPage} />
              </>
            )}
          </Card>

          <Card className="ms-admin-list-panel">
            <div className="ms-admin-list-panel__header">
              <div>
                <p className="ms-admin-list__title">고위험 사용자 조회</p>
                <p className="ms-card__desc">위험 플래그가 있거나 최근 지표 점수가 높은 사용자</p>
              </div>
              <Button size="sm" variant="tertiary" onClick={() => setHighRiskListCollapsed((prev) => !prev)}>
                {highRiskListCollapsed ? "펼치기" : "접기"}
              </Button>
            </div>

            {highRiskListCollapsed ? (
              <p className="ms-card__desc">고위험 사용자 목록이 접혀 있습니다.</p>
            ) : (
              <>
                <div className="ms-admin-users-search__row ms-admin-users-search__row--inline">
                  <Input
                    label="고위험 사용자 조회"
                    placeholder="user_id / nickname / 상태"
                    value={highRiskQuery}
                    onChange={(event) => setHighRiskQuery(event.target.value)}
                  />
                  <Button size="sm" variant="secondary" onClick={handleHighRiskSearch}>
                    조회
                  </Button>
                </div>

                {filteredHighRiskItems.length === 0 ? (
                  <EmptyState title="고위험 사용자 결과가 없습니다" description="조회 조건을 조정해 다시 확인해 주세요." />
                ) : (
                  <>
                    <div className="ms-admin-list">{pagedHighRiskUsers.map((item) => renderUserRow(item))}</div>
                    <PageNumberNav
                      page={highRiskPage}
                      totalPages={highRiskTotalPages}
                      onPageChange={setHighRiskPage}
                    />
                  </>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </SectionContainer>
  );
}
