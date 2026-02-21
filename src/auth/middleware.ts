import type { Context, MiddlewareHandler, Next } from 'hono';
import type { AppEnv, MoltbotEnv } from '../types';
import { verifyAccessJWT } from './jwt';

/**
 * Create an HTTP Basic Auth middleware.
 *
 * If BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD are set, requires valid
 * credentials via the standard WWW-Authenticate / Authorization: Basic flow.
 * If neither is set, auth is skipped (open access).
 * In dev mode, auth is also skipped.
 */
export function createBasicAuthMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c: Context<AppEnv>, next: Next) => {
    // Skip auth in dev mode
    if (isDevMode(c.env)) {
      return next();
    }

    const username = c.env.BASIC_AUTH_USERNAME;
    const password = c.env.BASIC_AUTH_PASSWORD;

    // If credentials not configured, skip auth
    if (!username || !password) {
      return next();
    }

    const authHeader = c.req.header('Authorization');
    if (authHeader) {
      const match = authHeader.match(/^Basic\s+(.+)$/i);
      if (match) {
        const decoded = atob(match[1]);
        const [user, pass] = [decoded.slice(0, decoded.indexOf(':')), decoded.slice(decoded.indexOf(':') + 1)];
        if (user === username && pass === password) {
          return next();
        }
      }
    }

    return c.text('Unauthorized', 401, {
      'WWW-Authenticate': 'Basic realm="Moltbot"',
    });
  };
}

/**
 * Options for creating an access middleware
 */
export interface AccessMiddlewareOptions {
  /** Response type: 'json' for API routes, 'html' for UI routes */
  type: 'json' | 'html';
  /** Whether to redirect to login when JWT is missing (only for 'html' type) */
  redirectOnMissing?: boolean;
}

/**
 * Check if running in development mode (skips CF Access auth + device pairing)
 */
export function isDevMode(env: MoltbotEnv): boolean {
  return env.DEV_MODE === 'true';
}

/**
 * Check if running in E2E test mode (skips CF Access auth but keeps device pairing)
 */
export function isE2ETestMode(env: MoltbotEnv): boolean {
  return env.E2E_TEST_MODE === 'true';
}

/**
 * Extract JWT from request headers or cookies
 */
export function extractJWT(c: Context<AppEnv>): string | null {
  const jwtHeader = c.req.header('CF-Access-JWT-Assertion');
  const jwtCookie = c.req.raw.headers
    .get('Cookie')
    ?.split(';')
    .find((cookie) => cookie.trim().startsWith('CF_Authorization='))
    ?.split('=')[1];

  return jwtHeader || jwtCookie || null;
}

/**
 * Create a Cloudflare Access authentication middleware
 *
 * @param options - Middleware options
 * @returns Hono middleware function
 */
export function createAccessMiddleware(options: AccessMiddlewareOptions) {
  const { type, redirectOnMissing = false } = options;

  return async (c: Context<AppEnv>, next: Next) => {
    // Skip auth in dev mode or E2E test mode
    if (isDevMode(c.env) || isE2ETestMode(c.env)) {
      c.set('accessUser', { email: 'dev@localhost', name: 'Dev User' });
      return next();
    }

    const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN;
    const expectedAud = c.env.CF_ACCESS_AUD;

    // If CF Access is not configured, skip auth (allow direct access)
    if (!teamDomain || !expectedAud) {
      c.set('accessUser', { email: 'anonymous@local', name: 'Anonymous' });
      return next();
    }

    // Get JWT
    const jwt = extractJWT(c);

    if (!jwt) {
      if (type === 'html' && redirectOnMissing) {
        return c.redirect(`https://${teamDomain}`, 302);
      }

      if (type === 'json') {
        return c.json(
          {
            error: 'Unauthorized',
            hint: 'Missing Cloudflare Access JWT. Ensure this route is protected by Cloudflare Access.',
          },
          401,
        );
      } else {
        return c.html(
          `
          <html>
            <body>
              <h1>Unauthorized</h1>
              <p>Missing Cloudflare Access token.</p>
              <a href="https://${teamDomain}">Login</a>
            </body>
          </html>
        `,
          401,
        );
      }
    }

    // Verify JWT
    try {
      const payload = await verifyAccessJWT(jwt, teamDomain, expectedAud);
      c.set('accessUser', { email: payload.email, name: payload.name });
      await next();
    } catch (err) {
      console.error('Access JWT verification failed:', err);

      if (type === 'json') {
        return c.json(
          {
            error: 'Unauthorized',
            details: err instanceof Error ? err.message : 'JWT verification failed',
          },
          401,
        );
      } else {
        return c.html(
          `
          <html>
            <body>
              <h1>Unauthorized</h1>
              <p>Your Cloudflare Access session is invalid or expired.</p>
              <a href="https://${teamDomain}">Login again</a>
            </body>
          </html>
        `,
          401,
        );
      }
    }
  };
}
