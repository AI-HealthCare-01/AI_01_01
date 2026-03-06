"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { Card, LoadingSkeleton } from "../../components/ui";
import { useAuthContext } from "./context";

type GuardPolicy = "public-only" | "require-unverified" | "require-onboarding" | "require-active";

interface AuthRouteGuardProps {
  policy: GuardPolicy;
  children: ReactNode;
}

function GateLoading(): JSX.Element {
  return (
    <Card title="접근 상태 확인 중" description="인증/온보딩 상태를 확인하고 있습니다.">
      <LoadingSkeleton lines={3} />
    </Card>
  );
}

function getTargetForSignedIn(
  emailVerified: boolean,
  accountStatus: string | undefined,
  fallbackPathname: string
): string | null {
  if (!emailVerified) {
    if (fallbackPathname === "/auth/verify-email") {
      return null;
    }
    return "/auth/verify-email";
  }

  if (accountStatus === "active") {
    return "/";
  }

  return "/onboarding";
}

function readForceLoginFlag(pathname: string): boolean {
  if (pathname !== "/auth/login" || typeof window === "undefined") {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("force") === "1";
}

export function AuthRouteGuard({ policy, children }: AuthRouteGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { phase, isBootstrapping, firebaseUser, session } = useAuthContext();

  useEffect(() => {
    if (phase === "loading" || isBootstrapping) {
      return;
    }

    const user = phase === "signed_in" ? firebaseUser : null;
    const accountStatus = session?.account.account_status;
    const forceLoginPage = readForceLoginFlag(pathname);

    if (policy === "public-only") {
      if (forceLoginPage) {
        return;
      }
      if (!user) {
        return;
      }
      const target = getTargetForSignedIn(user.emailVerified, accountStatus, pathname);
      if (target && target !== pathname) {
        router.replace(target);
      }
      return;
    }

    if (policy === "require-unverified") {
      if (!user) {
        if (pathname !== "/auth/verify-email") {
          router.replace("/auth/login");
        }
        return;
      }
      if (user.emailVerified) {
        const target = getTargetForSignedIn(true, accountStatus, pathname);
        if (target && target !== pathname) {
          router.replace(target);
        }
      }
      return;
    }

    if (policy === "require-onboarding") {
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      if (!user.emailVerified) {
        router.replace("/auth/verify-email");
        return;
      }
      if (accountStatus === "active") {
        router.replace("/");
      }
      return;
    }

    if (policy === "require-active") {
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      if (!user.emailVerified) {
        router.replace("/auth/verify-email");
        return;
      }
      if (accountStatus !== "active") {
        router.replace("/onboarding");
      }
    }
  }, [phase, isBootstrapping, firebaseUser, session, policy, router, pathname]);

  if (phase === "loading" || isBootstrapping) {
    return <GateLoading />;
  }

  const user = phase === "signed_in" ? firebaseUser : null;
  const forceLoginPage = readForceLoginFlag(pathname);

  if (policy === "public-only") {
    if (forceLoginPage) {
      return <>{children}</>;
    }
    return user ? <GateLoading /> : <>{children}</>;
  }

  if (!user) {
    if (policy === "require-unverified" && pathname === "/auth/verify-email") {
      return <>{children}</>;
    }
    return <GateLoading />;
  }

  if (policy === "require-unverified") {
    return user.emailVerified ? <GateLoading /> : <>{children}</>;
  }

  if (!user.emailVerified) {
    return <GateLoading />;
  }

  if (policy === "require-onboarding") {
    return session?.account.account_status === "active" ? <GateLoading /> : <>{children}</>;
  }

  if (policy === "require-active") {
    return session?.account.account_status === "active" ? <>{children}</> : <GateLoading />;
  }

  return <>{children}</>;
}
