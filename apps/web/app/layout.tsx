import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";

import { AuthProvider } from "../src/features/auth";
import { getGoogleAnalyticsId, MonitoringProvider } from "../src/features/monitoring";

import "./globals.css";

export const metadata: Metadata = {
  title: "MindMe",
  description: "MindMe design system scaffold"
};

const googleAnalyticsId = getGoogleAnalyticsId();

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
      <body suppressHydrationWarning>
        <AuthProvider>
          <MonitoringProvider>{children}</MonitoringProvider>
        </AuthProvider>
        {googleAnalyticsId ? <GoogleAnalytics gaId={googleAnalyticsId} /> : null}
      </body>
    </html>
  );
}
