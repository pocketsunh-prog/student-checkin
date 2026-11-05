import { type NextRequest } from 'next/server';

/**
 * Same-origin API proxy for the Android kiosk.
 *
 * School networks often expose only the web port (3000). The kiosk can therefore use
 * `http://<school-host>:3000/api/...` and this route forwards it to the backend API
 * (default `http://localhost:3001` locally, `http://backend:3001` in Docker).
 *
 * The admin/student web app itself still talks to NEXT_PUBLIC_API_URL directly.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TARGET = (process.env.API_PROXY_TARGET || 'http://localhost:3001').replace(/\/+$/, '');

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const destination = `${TARGET}/api/${path.join('/')}${incoming.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(destination, init);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'API_PROXY_UNAVAILABLE', message: 'The school API is not reachable from the web service.' },
      },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers(upstream.headers);
  // fetch() transparently decompresses; do not let the browser try to decode again.
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as OPTIONS,
  proxy as HEAD,
};
