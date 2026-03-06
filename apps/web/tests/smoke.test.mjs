import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("core route skeleton files exist", () => {
  const requiredPages = [
    "app/page.tsx",
    "app/auth/signup/page.tsx",
    "app/auth/login/page.tsx",
    "app/auth/change-email/page.tsx",
    "app/onboarding/page.tsx",
    "app/dashboard/page.tsx",
    "app/dashboard/state/page.tsx",
    "app/dashboard/activity/page.tsx",
    "app/board-feed/page.tsx",
    "app/board-feed/new/page.tsx",
    "app/journal/page.tsx",
    "app/mypage/page.tsx",
    "app/mypage/support-tickets/new/page.tsx",
    "app/mypage/support-tickets/[ticketId]/page.tsx",
    "app/admin/page.tsx",
    "app/admin/restrictions/page.tsx",
    "app/internal/design-system/page.tsx",
  ];

  for (const relativePath of requiredPages) {
    assert.equal(fs.existsSync(path.resolve(relativePath)), true, relativePath);
  }
});

test("design system foundation files exist", () => {
  const requiredFiles = [
    "src/design-system/tokens.ts",
    "src/components/ui/index.tsx",
    "src/styles/theme.css",
  ];

  for (const relativePath of requiredFiles) {
    assert.equal(fs.existsSync(path.resolve(relativePath)), true, relativePath);
  }
});
