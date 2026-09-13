/**
 * Exponential backoff with jitter for Drive API rate limits (429) and transient 5xx.
 * Production workers would share the same helper across job retries.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    label?: string;
  } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxAttempts) {
        throw enrichError(error, options.label);
      }
      const delay =
        baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
      await sleep(delay);
    }
  }

  throw enrichError(lastError, options.label);
}

function isRetryable(error: unknown): boolean {
  const status = getStatus(error);
  if (status === 429 || status === 500 || status === 502 || status === 503) {
    return true;
  }
  const message = String((error as { message?: string })?.message ?? error);
  return /rate limit|quota|ECONNRESET|ETIMEDOUT|socket hang up/i.test(message);
}

function getStatus(error: unknown): number | undefined {
  const err = error as {
    code?: number | string;
    status?: number;
    response?: { status?: number };
  };
  if (typeof err?.code === "number") return err.code;
  if (typeof err?.status === "number") return err.status;
  if (typeof err?.response?.status === "number") return err.response.status;
  if (typeof err?.code === "string" && /^\d+$/.test(err.code)) {
    return Number(err.code);
  }
  return undefined;
}

function enrichError(error: unknown, label?: string): Error {
  const status = getStatus(error);
  const base =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";

  if (status === 401 || status === 403) {
    return new Error(
      `${label ? `${label}: ` : ""}Permission denied or expired credentials (HTTP ${status}). Re-authenticate and ensure the Drive metadata scope was granted.`,
    );
  }
  if (status === 429) {
    return new Error(
      `${label ? `${label}: ` : ""}Google Drive API rate limit exceeded after retries. Wait a moment and try again.`,
    );
  }
  return new Error(`${label ? `${label}: ` : ""}${base}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
