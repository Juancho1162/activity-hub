import { HttpError, input, frontInput, checkInput, uuidHex, queryInput } from './contracts.js';
import { Auth, settings, requireOrigin, privateHeaders, cookieToken, publicSession, signupInput, loginInput } from './auth.js';
import { Operations } from './operations.js';
import { health } from './sql.js';
import { databaseClock } from './time.js';

// The first registered method matches FastAPI's Allow header on a 405.
function allow(path) {
  return ({ '/health': 'GET', '/auth/session': 'GET', '/auth/signup': 'POST', '/auth/login': 'POST',
    '/auth/logout': 'POST', '/api/fronts': 'POST', '/api/history': 'GET', '/api/dashboard': 'GET' })[path]
    || (/^\/api\/fronts\/[^/]+\/check$/.test(path) ? 'PUT' : /^\/api\/fronts\/[^/]+$/.test(path) ? 'GET' : null);
}

// Construction injection is only for isolated clock tests. No HTTP endpoint,
// env var, token, Origin exception or permission override selects another clock.
// The deployable export below ALWAYS uses SQL's clock at batch serialization.
export function createWorker({ clock = databaseClock } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const path = url.pathname;
      const privatePath = path === '/api' || path.startsWith('/api/');
      const noStore = privatePath || path === '/auth' || path.startsWith('/auth/');
      const reserved = noStore || path === '/health' || path.startsWith('/health/')
        || ['/docs', '/redoc', '/openapi.json'].includes(path) || path.startsWith('/docs/');
      if (!reserved && env.ASSETS) return env.ASSETS.fetch(request);
      let response;
      try {
        const config = settings(env.WEB_ORIGIN);
        const auth = new Auth(env.DB, clock);
        const prior = cookieToken(request, config);
        // Cookie, expected account, Origin and CSRF precede UUID/body parsing,
        // including unknown API paths. Proofs are rechecked by Operations' batch.
        let proof;
        if (privatePath || (path === '/auth/logout' && request.method === 'POST')) {
          proof = await auth.authenticate(prior);
          privateHeaders(request, config, proof);
        }
        const canonical = path.replace(/\/+$/, '');
        if (canonical !== path && allow(canonical)) {
          url.pathname = canonical;
          response = new Response(null, { status: 307, headers: { Location: url.toString() } });
        } else if (path === '/health' && request.method === 'GET') {
          await health(env.DB);
          response = Response.json({ status: 'ok' });
        } else if (path === '/auth/session' && request.method === 'GET') {
          response = Response.json(publicSession(await auth.authenticate(prior)));
        } else if (path === '/auth/signup' && request.method === 'POST') {
          requireOrigin(request, config);
          let rateError;
          try { await auth.reserve('signup'); } catch (error) {
            if (!(error instanceof HttpError) || error.status !== 429) throw error;
            rateError = error;
          }
          // Signed-in 409 remains explicit even if the public limiter is full.
          await auth.signupAllowed(prior);
          if (rateError) throw rateError;
          signupInput(await input(request, true));
          response = Response.json(await auth.signup(prior), { status: 201 });
        } else if (path === '/auth/login' && request.method === 'POST') {
          requireOrigin(request, config);
          await auth.reserve('login'); // Durable, independent commit BEFORE parsing.
          const code = loginInput(await input(request, true));
          const { raw, response: session } = await auth.login(code, prior);
          const cookie = `${config.cookie}=${raw}; Max-Age=2592000; Expires=${new Date(session.expires_at).toUTCString()}; Path=/; HttpOnly; SameSite=Strict${config.secure ? '; Secure' : ''}`;
          response = Response.json(session, { headers: { 'Set-Cookie': cookie } });
        } else if (path === '/auth/logout' && request.method === 'POST') {
          await auth.logout(proof);
          // Delayed logout MUST NOT delete another tab's newer login cookie.
          response = new Response(null, { status: 204 });
        } else if (path === '/api/fronts' && request.method === 'POST') {
          const key = uuidHex(request.headers.get('Idempotency-Key'));
          const data = frontInput(await input(request));
          response = Response.json(await new Operations(env.DB, clock, proof).create(data, key), { status: 201 });
        } else if (['/api/fronts', '/api/history', '/api/dashboard'].includes(path) && request.method === 'GET') {
          const kind = path.slice('/api/'.length);
          const query = queryInput(new URL(request.url).searchParams, kind);
          const operations = new Operations(env.DB, clock, proof);
          response = Response.json(await operations[kind === 'fronts' ? 'list' : kind](query));
        } else {
          const frontRoute = /^\/api\/fronts\/([^/]+)(\/check)?$/.exec(path);
          if (frontRoute && ((!frontRoute[2] && ['GET', 'PATCH'].includes(request.method)) || (frontRoute[2] && request.method === 'PUT'))) {
            const id = uuidHex(frontRoute[1]);
            const operations = new Operations(env.DB, clock, proof);
            if (request.method === 'GET') response = Response.json(await operations.get(id));
            else if (request.method === 'PATCH') response = Response.json(await operations.patch(id, frontInput(await input(request), true)));
            else response = Response.json(await operations.check(id, checkInput(await input(request)), uuidHex(request.headers.get('Idempotency-Key'))));
          } else {
            const method = allow(path);
            throw new HttpError(method ? 405 : 404, method ? 'Method Not Allowed' : 'Not Found', method ? { Allow: method } : {});
          }
        }
      } catch (error) {
        // Do not log rejected inputs, SQL, parameters, error messages/stacks or
        // credential-bearing headers. All messages that escape are fixed strings.
        response = error instanceof HttpError
          ? Response.json({ detail: error.message }, { status: error.status, headers: error.headers })
          : Response.json({ detail: 'Internal server error' }, { status: 500 });
      }
      if (noStore) response.headers.set('Cache-Control', 'no-store');
      return response;
    },
  };
}
export default createWorker();
