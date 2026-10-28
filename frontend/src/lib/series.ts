/** Rows from the first one where any of `keys` has data (non-zero, non-null): months before a
 * person started recording aren't zeros, so charts shouldn't draw them as such. */
export function trimLeadingEmpty<T>(rows: readonly T[], keys: readonly (keyof T)[]): T[] {
  const first = rows.findIndex((row) => keys.some((k) => row[k] !== null && row[k] !== undefined && Number(row[k]) !== 0));
  return first < 0 ? [] : rows.slice(first);
}
