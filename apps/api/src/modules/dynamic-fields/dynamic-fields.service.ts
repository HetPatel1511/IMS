import { Injectable } from '@nestjs/common';
import { FieldType, Prisma } from '@prisma/client';
import { RESERVED_ATTRIBUTE_KEYS } from '@ims/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors/domain-error';
import { CreateFieldDto, ReorderFieldsDto, UpdateFieldDto } from './dto/field.dto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/decorators/auth.decorators';

const schemaCacheKey = (typeId: string) => `schema:type:${typeId}`;

@Injectable()
export class DynamicFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  async getSchema(inventoryTypeId: string, useCache = true) {
    if (useCache) {
      const cached = await this.redis.get(schemaCacheKey(inventoryTypeId));
      if (cached) return JSON.parse(cached);
    }

    await this.ensureType(inventoryTypeId);

    const fields = await this.prisma.fieldDefinition.findMany({
      where: { inventoryTypeId, deletedAt: null, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        options: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    await this.redis.set(schemaCacheKey(inventoryTypeId), JSON.stringify(fields), 300);
    return fields;
  }

  async listAll(inventoryTypeId: string) {
    await this.ensureType(inventoryTypeId);
    return this.prisma.fieldDefinition.findMany({
      where: { inventoryTypeId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async create(
    inventoryTypeId: string,
    dto: CreateFieldDto,
    actor?: AuthUser,
    requestId?: string,
  ) {
    await this.ensureType(inventoryTypeId);

    if ((RESERVED_ATTRIBUTE_KEYS as readonly string[]).includes(dto.key)) {
      throw new ValidationFailedError(`Key '${dto.key}' is reserved`);
    }

    const existing = await this.prisma.fieldDefinition.findFirst({
      where: { inventoryTypeId, key: dto.key, deletedAt: null },
    });
    if (existing) throw new ConflictError('Field key already exists for this type');

    const created = await this.prisma.fieldDefinition.create({
      data: {
        inventoryTypeId,
        key: dto.key,
        displayName: dto.displayName,
        description: dto.description,
        fieldType: dto.fieldType as FieldType,
        isRequired: dto.isRequired ?? false,
        isUnique: dto.isUnique ?? false,
        defaultValue: dto.defaultValue as Prisma.InputJsonValue,
        validation: (dto.validation ?? {}) as Prisma.InputJsonValue,
        ui: (dto.ui ?? {}) as Prisma.InputJsonValue,
        sortOrder: dto.sortOrder ?? 0,
        isVisible: dto.isVisible ?? true,
        isFilterable: dto.isFilterable ?? false,
        isSearchable: dto.isSearchable ?? false,
        options: dto.options?.length
          ? {
              create: dto.options.map((o, i) => ({
                value: o.value,
                label: o.label,
                sortOrder: o.sortOrder ?? i,
                isActive: o.isActive ?? true,
              })),
            }
          : undefined,
      },
      include: { options: true },
    });

    await this.invalidateSchema(inventoryTypeId);
    await this.audit.log({
      actorId: actor?.id,
      action: 'CREATE',
      entityType: 'field_definitions',
      entityId: created.id,
      afterData: created,
      requestId,
      summary: `Created field ${created.key}`,
    });

    return created;
  }

  async update(
    inventoryTypeId: string,
    fieldId: string,
    dto: UpdateFieldDto,
    actor?: AuthUser,
    requestId?: string,
  ) {
    const before = await this.findOne(inventoryTypeId, fieldId);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.options) {
        await tx.fieldOption.deleteMany({ where: { fieldDefinitionId: fieldId } });
        await tx.fieldOption.createMany({
          data: dto.options.map((o, i) => ({
            fieldDefinitionId: fieldId,
            value: o.value,
            label: o.label,
            sortOrder: o.sortOrder ?? i,
            isActive: o.isActive ?? true,
          })),
        });
      }

      return tx.fieldDefinition.update({
        where: { id: fieldId },
        data: {
          displayName: dto.displayName,
          description: dto.description,
          isRequired: dto.isRequired,
          isUnique: dto.isUnique,
          defaultValue: dto.defaultValue as Prisma.InputJsonValue,
          validation: dto.validation as Prisma.InputJsonValue,
          ui: dto.ui as Prisma.InputJsonValue,
          sortOrder: dto.sortOrder,
          isVisible: dto.isVisible,
          isFilterable: dto.isFilterable,
          isSearchable: dto.isSearchable,
          isActive: dto.isActive,
        },
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    await this.invalidateSchema(inventoryTypeId);
    await this.audit.log({
      actorId: actor?.id,
      action: 'UPDATE',
      entityType: 'field_definitions',
      entityId: fieldId,
      beforeData: before,
      afterData: updated,
      requestId,
    });

    return updated;
  }

  async remove(inventoryTypeId: string, fieldId: string, actor?: AuthUser, requestId?: string) {
    const before = await this.findOne(inventoryTypeId, fieldId);
    const updated = await this.prisma.fieldDefinition.update({
      where: { id: fieldId },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.invalidateSchema(inventoryTypeId);
    await this.audit.log({
      actorId: actor?.id,
      action: 'DELETE',
      entityType: 'field_definitions',
      entityId: fieldId,
      beforeData: before,
      afterData: updated,
      requestId,
    });
    return updated;
  }

  async reorder(inventoryTypeId: string, dto: ReorderFieldsDto) {
    await this.ensureType(inventoryTypeId);
    await this.prisma.$transaction(
      dto.fieldIds.map((id, index) =>
        this.prisma.fieldDefinition.updateMany({
          where: { id, inventoryTypeId, deletedAt: null },
          data: { sortOrder: index },
        }),
      ),
    );
    await this.invalidateSchema(inventoryTypeId);
    return this.listAll(inventoryTypeId);
  }

  async invalidateSchema(inventoryTypeId: string) {
    await this.redis.del(schemaCacheKey(inventoryTypeId));
  }

  private async findOne(inventoryTypeId: string, fieldId: string) {
    const field = await this.prisma.fieldDefinition.findFirst({
      where: { id: fieldId, inventoryTypeId, deletedAt: null },
      include: { options: true },
    });
    if (!field) throw new NotFoundError('Field not found');
    return field;
  }

  private async ensureType(inventoryTypeId: string) {
    const type = await this.prisma.inventoryType.findFirst({
      where: { id: inventoryTypeId, deletedAt: null },
    });
    if (!type) throw new NotFoundError('Inventory type not found');
    return type;
  }
}
