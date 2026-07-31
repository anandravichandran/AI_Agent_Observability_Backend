import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { JwtConfig } from '@/config/config.types'
import { ErrorCode } from '@/core/constants/error-codes'
import { UnauthorizedError } from '@/core/errors/app-error'
import { TokenType } from '@/modules/auth/auth.constants'
import type {
  AccessTokenClaims,
  IssuedToken,
  RefreshTokenClaims,
  VerifiedAccessClaims,
  VerifiedRefreshClaims,
} from '@/modules/auth/auth.types'
import type { ITokenService } from './token-service.interface'

/** `jsonwebtoken` adapter for {@link ITokenService}. */
export class JwtTokenService implements ITokenService {
  private readonly config: JwtConfig

  constructor(config: JwtConfig) {
    this.config = config
  }

  public signAccessToken(claims: AccessTokenClaims): IssuedToken {
    // `sub` is carried in the payload itself, so the `subject` option is
    // intentionally omitted: jsonwebtoken rejects a payload that already
    // contains a claim the options also try to set.
    const token = jwt.sign({ ...claims }, this.config.accessSecret, {
      expiresIn: this.config.accessTtl,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: 'HS256',
    } as jwt.SignOptions)

    return { token, expiresAt: new Date(Date.now() + this.config.accessTtlMs) }
  }

  public signRefreshToken(claims: RefreshTokenClaims): IssuedToken {
    // `sub` and `jti` travel in the payload, so `subject`/`jwtid` are omitted
    // for the same reason as above.
    const token = jwt.sign({ ...claims }, this.config.refreshSecret, {
      expiresIn: this.config.refreshTtl,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: 'HS256',
    } as jwt.SignOptions)

    return { token, expiresAt: new Date(Date.now() + this.config.refreshTtlMs) }
  }

  public verifyAccessToken(token: string): VerifiedAccessClaims {
    const payload = this.verify(token, this.config.accessSecret)

    if (payload['type'] !== TokenType.ACCESS) {
      throw new UnauthorizedError('Invalid token type.', {
        code: ErrorCode.TOKEN_INVALID,
      })
    }

    return payload as unknown as VerifiedAccessClaims
  }

  public verifyRefreshToken(token: string): VerifiedRefreshClaims {
    const payload = this.verify(token, this.config.refreshSecret)

    if (payload['type'] !== TokenType.REFRESH) {
      throw new UnauthorizedError('Invalid token type.', {
        code: ErrorCode.TOKEN_INVALID,
      })
    }

    return payload as unknown as VerifiedRefreshClaims
  }

  public hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  /**
   * Shared verification, normalising library errors into `AppError`s.
   *
   * Expiry is reported with a distinct code so a client can tell “refresh me”
   * apart from “this token is garbage, send the user to the login screen”.
   */
  private verify(token: string, secret: string): jwt.JwtPayload {
    try {
      const decoded = jwt.verify(token, secret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        // Pinned explicitly. Without this, a token declaring `alg: none` or a
        // weaker algorithm would be accepted — the classic JWT bypass.
        algorithms: ['HS256'],
      })

      if (typeof decoded === 'string') {
        throw new UnauthorizedError('Malformed token payload.', {
          code: ErrorCode.TOKEN_INVALID,
        })
      }

      return decoded
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired.', {
          code: ErrorCode.TOKEN_EXPIRED,
          cause: error,
        })
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Token is invalid.', {
          code: ErrorCode.TOKEN_INVALID,
          cause: error,
        })
      }

      throw error
    }
  }
}
