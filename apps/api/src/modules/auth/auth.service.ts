import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundError, ValidationFailedError } from '../../common/errors/domain-error';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import type { UserRole } from '@ims/shared';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null, isActive: true },
    });
    if (!user) throw new ValidationFailedError('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new ValidationFailedError('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
    };

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      accessToken: await this.signAccess(authUser),
      refreshToken: await this.signRefresh(authUser),
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string; role: UserRole }>(
        refreshToken,
        { secret: this.config.getOrThrow('JWT_REFRESH_SECRET') },
      );
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null, isActive: true },
      });
      if (!user) throw new NotFoundError('User not found');
      const authUser: AuthUser = {
        id: user.id,
        email: user.email,
        role: user.role as UserRole,
      };
      return {
        accessToken: await this.signAccess(authUser),
        refreshToken: await this.signRefresh(authUser),
      };
    } catch {
      throw new ValidationFailedError('Invalid refresh token');
    }
  }

  async hashPassword(password: string) {
    return argon2.hash(password);
  }

  private signAccess(user: AuthUser) {
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') ?? '15m',
      },
    );
  }

  private signRefresh(user: AuthUser) {
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') ?? '7d',
      },
    );
  }
}
