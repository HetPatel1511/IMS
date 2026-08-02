import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { CreateInventoryTypeDto, UpdateInventoryTypeDto } from './dto/inventory-type.dto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/decorators/auth.decorators';

@Injectable()
export class InventoryTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateInventoryTypeDto, actor?: AuthUser, requestId?: string) {
    const existing = await this.prisma.inventoryType.findFirst({
      where: { code: dto.code, deletedAt: null },
    });
    if (existing) throw new ConflictError('Inventory type code already exists');

    const created = await this.prisma.inventoryType.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.audit.log({
      actorId: actor?.id,
      action: 'CREATE',
      entityType: 'inventory_types',
      entityId: created.id,
      afterData: created,
      requestId,
      summary: `Created inventory type ${created.code}`,
    });

    return created;
  }

  findAll() {
    return this.prisma.inventoryType.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const type = await this.prisma.inventoryType.findFirst({
      where: { id, deletedAt: null },
    });
    if (!type) throw new NotFoundError('Inventory type not found');
    return type;
  }

  async update(id: string, dto: UpdateInventoryTypeDto, actor?: AuthUser, requestId?: string) {
    const before = await this.findOne(id);
    const updated = await this.prisma.inventoryType.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      actorId: actor?.id,
      action: 'UPDATE',
      entityType: 'inventory_types',
      entityId: id,
      beforeData: before,
      afterData: updated,
      requestId,
    });
    return updated;
  }

  async remove(id: string, actor?: AuthUser, requestId?: string) {
    const before = await this.findOne(id);
    const updated = await this.prisma.inventoryType.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.log({
      actorId: actor?.id,
      action: 'DELETE',
      entityType: 'inventory_types',
      entityId: id,
      beforeData: before,
      afterData: updated,
      requestId,
    });
    return updated;
  }
}
