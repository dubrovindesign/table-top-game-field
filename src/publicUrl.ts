/**
 * Root-relative URLs (`/catalog-units/...`) must be prefixed with `import.meta.env.BASE_URL`
 * when the app is served under a subpath (Vite `base` ≠ `/`).
 */
export function publicUrl(path: string): string {
  const p = path.trim();
  if (!p || p.startsWith('data:') || p.startsWith('blob:')) return p;
  if (!p.startsWith('/')) return p;
  const base = import.meta.env.BASE_URL;
  if (!base || base === '/') return p;
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${prefix}${p}`;
}
