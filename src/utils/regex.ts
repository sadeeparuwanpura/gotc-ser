/** Escapes user input before it becomes a search `RegExp`. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A case-insensitive contains-match across the given fields. */
export function searchAcross(fields: string[], term: string | undefined): Record<string, unknown> {
  if (!term) return {};
  const pattern = new RegExp(escapeRegex(term), 'i');
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}
