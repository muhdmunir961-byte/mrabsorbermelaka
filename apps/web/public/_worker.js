/**
 * Cloudflare Pages worker (advanced mode).
 *
 * Deployed as `_worker.js` at the site root, so it owns every request.
 *
 * Why the proxy: the API lives on api.mrabsorbermelaka.biz.id while this site is
 * on *.pages.dev. Those are different *sites*, so the session cookie would be a
 * third-party cookie and browsers drop it — the user signs in, then every later
 * request looks anonymous. Proxying /api/* through this origin makes the cookie
 * first-party and removes CORS from the picture entirely.
 *
 * _headers and _redirects are NOT applied in advanced mode, so the security
 * headers and the SPA fallback live here.
 */
const API_ORIGIN = 'https://api.mrabsorbermelaka.biz.id';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  // Same-origin now that the API is proxied, so 'self' is enough.
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': CONTENT_SECURITY_POLICY,
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

async function proxy(request, url) {
  const target = new URL(url.pathname + url.search, API_ORIGIN);
  const headers = new Headers(request.headers);

  // The API rate-limits per IP. Without the real client address every user would
  // share the worker's IP and exhaust the OTP limit for everyone.
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));

  const upstream = await fetch(
    new Request(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    }),
  );

  // The body is streamed through untouched so Set-Cookie reaches the browser.
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return proxy(request, url);
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404 && !/\.[a-z0-9]+$/i.test(url.pathname)) {
      const index = await env.ASSETS.fetch(new URL('/index.html', url));
      return withSecurityHeaders(new Response(index.body, { status: 200, headers: index.headers }));
    }
    return withSecurityHeaders(asset);
  },
};
