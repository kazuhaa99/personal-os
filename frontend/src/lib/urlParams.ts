// Search parameters are user input (bookmarks, hand-edited URLs): read them through these so a
// bad value falls back to the default instead of crashing a page or reaching the API.

const MONTH = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
const DATE = /^([1-9]\d{3})-(\d{2})-(\d{2})$/;

/** "YYYY-MM" with a real month, else `fallback`. */
export function monthParam(value: string | null, fallback: string): string {
  return value && MONTH.test(value) ? value : fallback;
}

/** "YYYY-MM-DD" that exists on the calendar, else "". */
export function dateParam(value: string | null): string {
  const m = value ? DATE.exec(value) : null;
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? value! : "";
}

/** A non-negative whole number (list offsets), else 0. */
export function offsetParam(value: string | null): number {
  return value && /^\d{1,9}$/.test(value) ? Number(value) : 0;
}

/** A positive whole number as a string (record ids), else "". */
export function idParam(value: string | null): string {
  return value && /^[1-9]\d{0,9}$/.test(value) ? value : "";
}

/** `value` if it is one of `allowed`, else `fallback`. */
export function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}
