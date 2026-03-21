"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            background: "#f7f5ef",
            color: "#1f2937",
          }}
        >
          <section
            style={{
              width: "100%",
              maxWidth: "420px",
              borderRadius: "20px",
              padding: "24px",
              background: "#ffffff",
              boxShadow: "0 16px 40px rgba(15, 23, 42, 0.08)",
            }}
          >
            <h1 style={{ margin: 0, fontSize: "1.5rem" }}>문제가 발생했습니다</h1>
            <p style={{ marginTop: "12px", lineHeight: 1.6 }}>
              일시적인 오류가 발생했습니다. 같은 문제가 반복되면 잠시 후 다시 시도해 주세요.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: "16px",
                border: "none",
                borderRadius: "999px",
                padding: "12px 18px",
                background: "#2f6fed",
                color: "#ffffff",
                fontSize: "0.95rem",
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
