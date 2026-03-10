"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { Card, LoadingSkeleton } from "../../components/ui";
import { useAuthContext } from "./context";
import { isOnboardingComplete, shouldGoOnboarding } from "./status";

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
  sessionKnown: boolean,
  complete: boolean,
  needsOnboarding: boolean,
  fallbackPathname: string
): string | null {
  if (!emailVerified) {
    if (fallbackPathname === "/auth/verify-email") {
      return null;
    }
    return "/auth/verify-email";
  }

  if (!sessionKnown) {
    return null;
  }

  if (complete) {
    return "/";
  }

  if (needsOnboarding) {
    return "/onboarding";
  }

  return "/auth/login";
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
    const hasSession = Boolean(session);
    const complete = isOnboardingComplete(session);
    const needsOnboarding = shouldGoOnboarding(session);
    const forceLoginPage = readForceLoginFlag(pathname);

    if (policy === "public-only") {
      if (forceLoginPage) {
        return;
      }
      if (!user) {
        return;
      }
      const target = getTargetForSignedIn(
        user.emailVerified,
        hasSession,
        complete,
        needsOnboarding,
        pathname,
      );
      if (target && target !== pathname) {
        router.replace(target);
      }
      return;
    }

    if (policy === "require-unverified") {
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      if (user.emailVerified) {
        const target = getTargetForSignedIn(
          true,
          hasSession,
          complete,
          needsOnboarding,
          pathname,
        );
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
      if (!hasSession) {
        return;
      }
      if (complete) {
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
      if (!hasSession) {
        return;
      }
      if (needsOnboarding) {
        router.replace("/onboarding");
        return;
      }
      if (!complete) {
        router.replace("/auth/login");
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
    return <GateLoading />;
  }

  if (policy === "require-unverified") {
    return user.emailVerified ? <GateLoading /> : <>{children}</>;
  }

  if (!user.emailVerified) {
    return <GateLoading />;
  }

  if (policy === "require-onboarding") {
    if (!session) {
      return <GateLoading />;
    }
    return shouldGoOnboarding(session) ? <>{children}</> : <GateLoading />;
  }

  if (policy === "require-active") {
    if (!session) {
      return <GateLoading />;
    }
    return isOnboardingComplete(session) ? <>{children}</> : <GateLoading />;
  }

  return <>{children}</>;
}
