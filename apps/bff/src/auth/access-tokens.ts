import { jwtVerify, SignJWT } from 'jose';
import type { components } from '@coursewright/contracts';

type Role = components['schemas']['Role'];

/** Who is calling, as proven by a verified access token. */
export interface AuthUser {
  id: string;
  tenantId: string;
  roles: Role[];
}

const ISSUER = 'coursewright-bff';
const AUDIENCE = 'coursewright-web';

export interface AccessTokens {
  readonly ttlSeconds: number;
  sign(user: AuthUser): Promise<string>;
  /** Resolves to the caller, or rejects if the token is invalid, expired or for someone else. */
  verify(token: string): Promise<AuthUser>;
}

export function createAccessTokens(secret: string, ttlSeconds: number): AccessTokens {
  const key = new TextEncoder().encode(secret);

  return {
    ttlSeconds,

    sign: (user) =>
      new SignJWT({ tid: user.tenantId, roles: user.roles })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${ttlSeconds}s`)
        .sign(key),

    async verify(token) {
      // Pin the algorithm: never let the token's own header choose how it is checked.
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      const { sub, tid, roles } = payload;
      if (typeof sub !== 'string' || typeof tid !== 'string' || !Array.isArray(roles)) {
        throw new Error('Access token is missing claims');
      }
      return { id: sub, tenantId: tid, roles: roles as Role[] };
    },
  };
}
