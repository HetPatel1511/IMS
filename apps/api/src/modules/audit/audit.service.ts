import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginateMeta, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    actorId?: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    summary?: string;
    beforeData?: unknown;
    afterData?: unknown;
    requestId?: string;
    ipAddress?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        summary: input.summary,
        beforeData: input.beforeData as Prisma.InputJsonValue,
        afterData: input.afterData as Prisma.InputJsonValue,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
      },
    });
  }

  async findAll(query: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      entityType: query.entityType,
      entityId: query.entityId,
      actorId: query.actorId,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, email: true, fullName: true } },
        },
      }),
    ]);

    return { data, meta: paginateMeta(query.page, query.pageSize, total) };
  }
}
