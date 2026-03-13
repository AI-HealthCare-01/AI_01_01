"use client";

export default function SentryExamplePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Sentry Example Page</h1>
      <p>버튼을 눌러 테스트 에러를 발생시켜 보세요.</p>
      <button
        type="button"
        onClick={() => {
          throw new Error("Sentry test error from /sentry-example-page");
        }}
      >
        테스트 에러 발생
      </button>
    </main>
  );
}
