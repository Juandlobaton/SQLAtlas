/**
 * Generate a URL-friendly slug from a name.
 * Handles SQL-style names like "dbo.sp_CancelOrder" → "dbo-sp-cancel-order"
 */
export function slugify(name: string): string {
  return name
    .replace(/\./g, '-')          // dots → hyphens (schema.name)
    .replace(/_/g, '-')           // underscores → hyphens
    .replace(/([a-z])([A-Z])/g, '$1-$2') // camelCase → kebab-case
    .replace(/[^a-zA-Z0-9-]/g, '') // strip non-alphanumeric
    .replace(/-+/g, '-')          // collapse multiple hyphens
    .replace(/^-|-$/g, '')        // trim leading/trailing hyphens
    .toLowerCase();
}
