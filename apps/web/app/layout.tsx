import type { Metadata } from "next";

import { AuthProvider } from "../src/features/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: "MindSight",
  description: "MindSight design system scaffold"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
