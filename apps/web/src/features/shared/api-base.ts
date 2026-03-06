const DEFAULT_API_BASE_URL = "http://localhost:8000";

function normalizeBase(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function pushCandidate(candidates: string[], value: string | null | undefined): void {
  if (!value) {
    return;
  }
  const normalized = normalizeBase(value);
  if (!normalized) {
    return;
  }
  if (!candidates.includes(normalized)) {
    candidates.push(normalized);
  }
}

function inferRuntimeCandidates(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const { protocol, hostname, port } = window.location;
  const inferred: string[] = [];

  pushCandidate(inferred, `${protocol}//${hostname}:8000`);
  pushCandidate(inferred, `${protocol}//${hostname}:8010`);

  if (port === "3000") {
    pushCandidate(inferred, `${protocol}//${hostname}:8000`);
  }
  if (port === "3001") {
    pushCandidate(inferred, `${protocol}//${hostname}:8010`);
  }

  return inferred;
}

export function resolveApiBaseCandidates(): string[] {
  const candidates: string[] = [];
  pushCandidate(candidates, process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL);
  for (const runtimeCandidate of inferRuntimeCandidates()) {
    pushCandidate(candidates, runtimeCandidate);
  }
  pushCandidate(candidates, DEFAULT_API_BASE_URL);
  pushCandidate(candidates, "http://localhost:8010");
  return candidates;
}

export async function fetchWithApiFallback(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const bases = resolveApiBaseCandidates();
  let lastNetworkError: unknown = null;

  for (const base of bases) {
    try {
      return await fetch(`${base}${path}`, init);
    } catch (error) {
      lastNetworkError = error;
    }
  }

  throw lastNetworkError ?? new Error("api_network_unreachable");
}
