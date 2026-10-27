import { t } from "./i18n";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}

type ErrorBody = { error?: { message?: string; code?: string; details?: unknown }; detail?: string };

/** The API's error body ({"error": {...}} or FastAPI's {"detail"}) as an ApiError with a readable message. */
export function toApiError(status: number, data: unknown): ApiError {
  const err = data && typeof data === "object" ? (data as ErrorBody) : null;
  const message = err?.error?.message ?? err?.detail ?? (status === 401 ? t("Sign in required") : t("Request failed ({status})", { status }));
  return new ApiError(status, message, err?.error?.code, err?.error?.details);
}
