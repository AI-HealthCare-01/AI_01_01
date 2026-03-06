"use client";

import type { ReactNode } from "react";

import { AdminConsoleShell } from "../../src/features/admin-console";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminConsoleShell>{children}</AdminConsoleShell>;
}
