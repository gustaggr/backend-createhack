import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service.js';
import { SESSION_COOKIE_NAME } from '../auth.constants.js';
import type { AuthenticatedUser } from '../auth.types.js';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  sessionToken: string;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[SESSION_COOKIE_NAME];

    if (!token) {
      throw new UnauthorizedException('Sessão ausente');
    }

    const user = await this.authService.validateSessionToken(token);
    if (!user) {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    (request as AuthenticatedRequest).user = user;
    (request as AuthenticatedRequest).sessionToken = token;
    return true;
  }
}
