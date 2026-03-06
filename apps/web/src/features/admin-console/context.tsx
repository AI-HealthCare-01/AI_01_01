"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuthContext } from "../auth";
import { AdminApiError, getAdminMe } from "./api-client";
import type { AdminMeResponse } from "./types";

interface AdminConsoleContextValue {
  me: AdminMeResponse | null;
  loading: boolean;
  errorCode: string | null;
  refresh: () => Promise<void>;
}

const AdminConsoleContext = createContext<AdminConsoleContextValue | undefined>(undefined);

function parseErrorCode(error: unknown): string {
  if (error instanceof AdminApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown_error";
}

export function AdminConsoleProvider({ children }: { children: ReactNode }) {
  const { firebaseUser } = useAuthContext();
  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!firebaseUser) {
      setMe(null);
      setErrorCode("auth_required");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErrorCode(null);
      const response = await getAdminMe(firebaseUser);
      setMe(response);
    } catch (error) {
      setMe(null);
      setErrorCode(parseErrorCode(error));
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AdminConsoleContextValue>(
    () => ({
      me,
      loading,
      errorCode,
      refresh,
    }),
    [me, loading, errorCode, refresh]
  );

  return <AdminConsoleContext.Provider value={value}>{children}</AdminConsoleContext.Provider>;
}

export function useAdminConsoleContext(): AdminConsoleContextValue {
  const context = useContext(AdminConsoleContext);
  if (!context) {
    throw new Error("useAdminConsoleContext must be used within AdminConsoleProvider");
  }
  return context;
}
