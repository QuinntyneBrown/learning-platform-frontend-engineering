import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { components } from '@coursewright/contracts';
import { sendProblem } from '../problem';
import type { AccessTokens, AuthUser } from './access-tokens';

type Role = components['schemas']['Role'];

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Skip the access-token check. For login, refresh, logout, RUM beacons and health. */
    public?: boolean;
  }

  interface FastifyRequest {
    /** The verified caller. Set on every route that isn't `public`. */
    user: AuthUser;
  }
}

/** Requires `Authorization: Bearer <access token>` on every route in `app` not marked public. */
export function registerAuthentication(app: FastifyInstance, tokens: AccessTokens): void {
  app.decorateRequest('user');

  app.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.config.public) return;

    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return unauthorized(reply, 'Send an access token as "Authorization: Bearer <token>".');
    }
    try {
      request.user = await tokens.verify(token);
    } catch {
      return unauthorized(reply, 'The access token is invalid or has expired.');
    }
  });
}

/**
 * A route-level onRequest hook. It runs after authentication but before body validation,
 * so a caller without the role can't probe the request schema.
 */
export function requireRole(role: Role) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user.roles.includes(role)) {
      return sendProblem(reply, { status: 403, detail: `This needs the ${role} role.` });
    }
  };
}

function unauthorized(reply: FastifyReply, detail: string): FastifyReply {
  // RFC 6750: a 401 names the scheme the client should use.
  return sendProblem(reply.header('www-authenticate', 'Bearer'), { status: 401, detail });
}
