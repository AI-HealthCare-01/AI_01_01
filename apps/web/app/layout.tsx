import type { Metadata } from "next";

import { AuthProvider } from "../src/features/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: "MindSight",
  description: "MindSight design system scaffold"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('theme');
                  var theme = saved
                    ? saved
                    : window.matchMedia(
                        '(prefers-color-scheme: dark)'
                      ).matches ? 'dark' : 'light';
                  document.documentElement
                    .setAttribute('data-theme', theme);
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
