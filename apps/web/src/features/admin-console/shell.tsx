"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  LoadingSkeleton,
  PageContainer,
} from "../../components/ui";
import { AuthRouteGuard } from "../auth";
import { AdminConsoleProvider, useAdminConsoleContext } from "./context";

const NAV_ITEMS = [
  { href: "/admin", label: "운영 개요", requiredPermissions: ["overview:view"] },
  { href: "/admin/users", label: "사용자 관리", requiredPermissions: ["users:view", "users:view_basic"] },
  {
    href: "/admin/moderation",
    label: "모더레이션",
    requiredPermissions: ["moderation:view"],
  },
  { href: "/admin/support", label: "문의 큐", requiredPermissions: ["support_queue:view"] },
  {
    href: "/admin/policies",
    label: "정책 관리",
    requiredPermissions: ["policy:draft", "policy:approve", "policy:apply"],
  },
  {
    href: "/admin/model-ops",
    label: "모델 운영",
    requiredPermissions: ["model_ops:view", "model_ops:edit", "model_ops:edit_request"],
  },
  { href: "/admin/roles", label: "권한 관리", requiredPermissions: ["roles:view", "roles:manage"] },
  { href: "/admin/audit-log", label: "감사 로그", requiredPermissions: ["audit:view", "audit:view_limited"] },
] as const;

function roleLabel(role: "owner" | "admin" | "support"): string {
  if (role === "owner") {
    return "Owner";
  }
  if (role === "admin") {
    return "Admin";
  }
  return "Support";
}

function hasAnyPermission(permissions: string[], expected: readonly string[]): boolean {
  return expected.some((permission) => permissions.includes(permission));
}

function AdminConsoleShellBody({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, loading, errorCode, refresh } = useAdminConsoleContext();

  const canRenderAdmin = !loading && !!me;

  const visibleNavItems = me
    ? NAV_ITEMS.filter((item) => hasAnyPermission(me.permissions, item.requiredPermissions))
    : [];

  return (
    <AppShell
      brand="MindSight Admin"
      headerAction={
        me ? (
          <div className="ms-row">
            <Badge variant="brand">{roleLabel(me.actor.base_role)}</Badge>
            {me.actor.extension_codes.includes("analyst_ml_extension") ? (
              <Badge variant="info">analyst_ml_extension</Badge>
            ) : null}
          </div>
        ) : null
      }
    >
      <PageContainer size="lg">
        {loading ? (
          <Card title="관리자 권한 확인 중">
            <LoadingSkeleton lines={5} />
          </Card>
        ) : !me ? (
          <ErrorState
            title="관리자 권한이 없습니다"
            description={
              errorCode === "admin_role_not_assigned"
                ? "관리자 권한이 할당되지 않았습니다. Owner에게 권한 부여를 요청하세요."
                : `관리자 화면 접근에 실패했습니다: ${errorCode ?? "unknown_error"}`
            }
            retryAction={<Button onClick={() => void refresh()}>다시 확인</Button>}
          />
        ) : (
          <div className="ms-admin-layout">
            <Card title="관리자 메뉴" className="ms-admin-sidebar">
              <nav aria-label="관리자 메뉴" className="ms-admin-nav">
                {visibleNavItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/admin" && pathname?.startsWith(`${item.href}/`));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`ms-admin-nav__link${isActive ? " ms-admin-nav__link--active" : ""}`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <Banner
                variant="info"
                title="PII 노출 제한"
                description="IP/이메일 상세는 사용자 목록이 아니라 제재/차단 컨텍스트에서만 확인합니다."
              />
            </Card>
            <div className="ms-admin-content">{children}</div>
          </div>
        )}
      </PageContainer>
      {!canRenderAdmin && !loading ? (
        <div className="ms-visually-hidden" aria-live="polite">
          관리자 접근 불가
        </div>
      ) : null}
    </AppShell>
  );
}

export function AdminConsoleShell({ children }: { children: ReactNode }) {
  return (
    <AuthRouteGuard policy="require-active">
      <AdminConsoleProvider>
        <AdminConsoleShellBody>{children}</AdminConsoleShellBody>
      </AdminConsoleProvider>
    </AuthRouteGuard>
  );
}
