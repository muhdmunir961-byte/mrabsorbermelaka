/**
 * The API origin is configuration, not a convention. In development it stays
 * empty so the Vite proxy keeps the cookie same-origin; in a split deployment it
 * points at the API host and the browser sends credentials cross-site.
 *
 * `import.meta.env` is typed by Vite's client types, which the ESLint project
 * service does not load here, so the value is read through one narrow assertion
 * instead of leaving the whole module untyped.
 */
interface ViteImportMeta {
  env: { VITE_API_BASE_URL?: string };
}

const rawBase = (import.meta as unknown as ViteImportMeta).env.VITE_API_BASE_URL ?? '';
const API_BASE = rawBase.replace(/\/$/, '');

export const apiUrl = (path: string): string => `${API_BASE}/api/v1${path}`;
