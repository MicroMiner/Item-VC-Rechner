// Standalone Cloudflare ES-module Worker. No secrets or bindings required.
// Deploy as a NEW worker; never replace the economy/news worker with this file.
const UPSTREAM = 'http://bluemap-origin.microminer.ch:13003';
const SITE = 'https://microminer.github.io';
const requestHeaders = ['accept', 'accept-language', 'range', 'if-range', 'if-none-match', 'if-modified-since'];
const responseHeaders = ['content-type', 'content-encoding', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'vary'];

function failure(message, status = 502) {
  return new Response(message, {status, headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}

export default {
  async fetch(request) {
    if (!['GET', 'HEAD'].includes(request.method)) {
      const response = failure('Nur GET und HEAD sind erlaubt.', 405);
      response.headers.set('Allow', 'GET, HEAD');
      return response;
    }
    if (request.headers.get('Upgrade')) return failure('WebSocket-Verbindungen werden von diesem Kartenproxy nicht unterstützt.', 400);
    const incoming = new URL(request.url);
    // Assign paths on a fixed origin: user-supplied paths, queries and headers
    // can never select another upstream (including //host or ?url= inputs).
    const target = new URL(UPSTREAM);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    const headers = new Headers();
    for (const name of requestHeaders) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    let upstream;
    try {
      upstream = await fetch(target.href, {
        method:request.method, headers, redirect:'manual',
        signal:AbortSignal.timeout(20000),
      });
    } catch {
      return failure('BlueMap ist über den Proxy nicht erreichbar. Cloudflare konnte den Nitrado-Server auf Port 13003 nicht erreichen. Bitte diese Meldung zur Prüfung weitergeben.');
    }
    if ([301,302,303,307,308].includes(upstream.status)) {
      const location = upstream.headers.get('Location');
      let redirect;
      try { redirect = new URL(location || '', target); } catch { return failure('Ungültige Weiterleitung des Kartenservers.'); }
      if (!location || redirect.origin !== UPSTREAM || redirect.username || redirect.password) return failure('Die Weiterleitung des Kartenservers verlässt die konfigurierte BlueMap-Adresse.');
      const destination = new URL(incoming.origin);
      destination.pathname = redirect.pathname;
      destination.search = redirect.search;
      destination.hash = redirect.hash;
      return new Response(null, {status:upstream.status,headers:{Location:destination.href,'Cache-Control':'no-store'}});
    }
    const out = new Headers();
    for (const name of responseHeaders) if (upstream.headers.has(name)) out.set(name, upstream.headers.get(name));
    // Public map content only; never relay cookies, credentials or admin headers.
    // Preserve binary/compressed bodies by streaming without text conversion.
    out.set('Cache-Control', 'no-store');
    out.set('Content-Security-Policy', "frame-ancestors 'self' " + SITE);
    out.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    out.set('X-Content-Type-Options', 'nosniff');
    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status:upstream.status, statusText:upstream.statusText, headers:out,
    });
  },
};
