import { ApiError, errorMessage } from "@/lib/api";
import { t } from "@/lib/i18n";
import type { Frequency } from "@/lib/types";

export const PROFILE_KEY = ["profile"];
export const CURRENCIES = ["KZT", "USD", "EUR", "RUB"] as const;
export const FREQUENCIES: Frequency[] = ["weekly", "biweekly", "monthly", "quarterly", "yearly"];

/** Translate the server's error codes for account/security actions; fall back to its message. */
export function securityError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "password_wrong": return t("The current password is wrong");
      case "email_taken": return t("An account with this email already exists");
      case "email_format": return t("Enter a valid email address");
      case "code_wrong": return t("Wrong code. Check the email and try again.");
      case "code_expired": return t("The code has expired. Send a new one.");
      case "mail_unavailable": return t("Email can't be sent right now. Try again later.");
    }
    if (e.status === 429) return t("Too many attempts. Wait a minute and try again.");
    if (e.status === 503) return t("Email can't be sent right now. Try again later.");
  }
  return errorMessage(e);
}

/** Initials for the avatar fallback ("Alex Kim" → "AK", "admin" → "A"). */
export function initials(first: string, last: string, username: string): string {
  const a = first.trim()[0] ?? "";
  const b = last.trim()[0] ?? "";
  return (a + b || username.trim()[0] || "?").toUpperCase();
}

/** Downscale to a center-cropped square JPEG before upload (keeps uploads small and uniform). */
export async function squareJpeg(file: File, size = 512, quality = 0.9): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("not-image");
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not-image")); };
      img.src = url;
    });
  }
  const w = bitmap.width, h = bitmap.height;
  if (!w || !h) throw new Error("not-image");
  const side = Math.min(w, h);
  const out = Math.min(size, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("not-image");
  ctx.fillStyle = "#fff"; // transparent PNGs get a white background in JPEG
  ctx.fillRect(0, 0, out, out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
  if ("close" in bitmap) bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("not-image");
  return blob;
}

/** Decimal string → number for display ratios only (bars), never for money math. */
export const num = (s: string | null | undefined) => (s ? Number(s) || 0 : 0);
