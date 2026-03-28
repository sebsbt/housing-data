export type FetchWithRetryInit = RequestInit & {
  retries?: number;
  retryDelayMs?: number;
};

/**
 * Retries on network failure (e.g. API not yet listening after `npm run dev`).
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: FetchWithRetryInit,
): Promise<Response> {
  const { retries = 5, retryDelayMs = 450, ...fetchInit } = init ?? {};
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(input, fetchInit);
    } catch (e) {
      last = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  }
  throw last;
}
