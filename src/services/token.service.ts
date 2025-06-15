import jwt from 'jsonwebtoken';
import winston from 'winston';

export class TokenService {
  private jwtSecret: string;
  private logger: winston.Logger;

  constructor(jwtSecret: string, loggerInstance: winston.Logger) {
    if (!jwtSecret) {
      loggerInstance.error('TokenService: JWT_SECRET is not defined. Authentication will fail.', { type: 'ConfigError.TokenService' });
      throw new Error('JWT_SECRET is not defined for TokenService');
    }
    this.jwtSecret = jwtSecret;
    this.logger = loggerInstance;
  }

  public async verifyToken(token: string, correlationId?: string): Promise<{ userId: string } | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string; iat: number; exp: number }; // Add iat, exp for more complete type
      if (!decoded.userId) {
        this.logger.warn('TokenService: Token verification failed - userId missing in decoded token', { correlationId, type: 'AuthVerification.Fail.NoUserIdInToken' });
        return null;
      }
      return { userId: decoded.userId };
    } catch (error: any) {
      this.logger.warn('TokenService: Token verification failed', {
        correlationId,
        tokenPreview: token ? token.substring(0, 15) + '...' : 'No token provided',
        errorName: error.name,
        errorMessage: error.message,
        type: 'AuthVerification.Fail.JwtError'
      });
      return null;
    }
  }
}