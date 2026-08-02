import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { paginateMeta, PaginationQueryDto } from '../../common/dto/pagination.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });
    if (existing) throw new ConflictError('Email already registered');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        role: dto.role,
        passwordHash: await this.auth.hashPassword(dto.password),
      },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
    });
    return user;
  }

  async findAll(query: PaginationQueryDto) {
    const where = { deletedAt: null as null };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
    ]);
    return { data, meta: paginateMeta(query.page, query.pageSize, total) };
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.ensureExists(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        role: dto.role,
        isActive: dto.isActive,
      },
      select: { id: true, email: true, fullName: true, role: true, isActive: true },
    });
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundError('User not found');
    return user;
  }
}
