/** Compare server revisions at PostgreSQL microsecond precision. */
export function cloudRevisionTime(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  const parts = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!parts) return null;
  const seconds = Date.parse(parts[1] + parts[3]);
  return Number.isFinite(seconds) ? BigInt(seconds) * 1000n + BigInt((parts[2] ?? '').padEnd(6, '0')) : null;
}
