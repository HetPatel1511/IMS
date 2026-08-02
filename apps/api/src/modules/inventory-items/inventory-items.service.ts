import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  validateAttributes,
  type FieldDefinitionInput,
  type FieldType,
} from '@ims/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { DynamicFieldsService } from '../dynamic-fields/dynamic-fields.service';
import { AuditService } from '../audit/audit.service';
import {
  ConflictError,
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/domain-error';
import { paginateMeta, PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  CreateInventoryItemDto,
  SetItemSuppliersDto,
  UpdateInventoryItemDto,
} from './dto/item.dto';
import type { AuthUser } from '../../common/decorators/auth.decorators';

@Injectable()
export class InventoryItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fields: DynamicFieldsService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateInventoryItemDto, actor?: AuthUser, requestId?: string) {
    await this.ensureType(dto.inventoryTypeId);
    if (dto.categoryId) await this.ensureCategory(dto.inventoryTypeId, dto.categoryId);

    const attributes = await this.validateAndNormalizeAttributes(
      dto.inventoryTypeId,
      dto.attributes ?? {},
    );
    await this.assertUniqueAttributes(dto.inventoryTypeId, attributes);

    try {
      const created = await this.prisma.inventoryItem.create({
        data: {
          inventoryTypeId: dto.inventoryTypeId,
          categoryId: dto.categoryId,
          sku: dto.sku,
          name: dto.name,
          description: dto.description,
          quantity: dto.quantity ?? 0,
          minQuantity: dto.minQuantity ?? 0,
          unit: dto.unit,
          attributes: attributes as Prisma.InputJsonValue,
          createdById: actor?.id,
          updatedById: actor?.id,
        },
        include: this.defaultInclude(),
      });

      await this.audit.log({
        actorId: actor?.id,
        action: 'CREATE',
        entityType: 'inventory_items',
        entityId: created.id,
        afterData: created,
        requestId,
        summary: `Created item ${created.sku}`,
      });

      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('SKU already exists for this inventory type');
      }
      throw err;
    }
  }

  async findAll(
    query: PaginationQueryDto & {
      inventoryTypeId?: string;
      categoryId?: string;
      attr?: Record<string, string>;
    },
  ) {
    const where: Prisma.InventoryItemWhereInput = {
      deletedAt: null,
      inventoryTypeId: query.inventoryTypeId,
      categoryId: query.categoryId,
    };

    if (query.q) {
      where.OR = [
        { sku: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    if (query.attr && Object.keys(query.attr).length) {
      const attrFilters: Prisma.InventoryItemWhereInput[] = [];
      for (const [key, value] of Object.entries(query.attr)) {
        if (key.endsWith('_gte') || key.endsWith('_lte')) continue;
        const parsed =
          /^-?\d+(\.\d+)?$/.test(value.trim()) && Number.isFinite(Number(value))
            ? Number(value)
            : value;
        attrFilters.push({
          attributes: {
            path: [key],
            equals: parsed as Prisma.InputJsonValue,
          },
        });
      }
      if (attrFilters.length) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          ...attrFilters,
        ];
      }
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.inventoryItem.count({ where }),
      this.prisma.inventoryItem.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { updatedAt: 'desc' },
        include: this.defaultInclude(),
      }),
    ]);

    return { data, meta: paginateMeta(query.page, query.pageSize, total) };
  }

  async findOne(id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...this.defaultInclude(),
        suppliers: { include: { supplier: true } },
      },
    });
    if (!item) throw new NotFoundError('Inventory item not found');
    return item;
  }

  async update(id: string, dto: UpdateInventoryItemDto, actor?: AuthUser, requestId?: string) {
    const before = await this.findOne(id);

    let attributes: Record<string, unknown> | undefined;
    if (dto.attributes) {
      attributes = await this.validateAndNormalizeAttributes(
        before.inventoryTypeId,
        dto.attributes,
      );
      await this.assertUniqueAttributes(before.inventoryTypeId, attributes, id);
    }

    if (dto.categoryId) {
      await this.ensureCategory(before.inventoryTypeId, dto.categoryId);
    }

    try {
      const updated = await this.prisma.inventoryItem.update({
        where: { id },
        data: {
          categoryId: dto.categoryId === null ? null : dto.categoryId,
          sku: dto.sku,
          name: dto.name,
          description: dto.description,
          quantity: dto.quantity,
          minQuantity: dto.minQuantity,
          unit: dto.unit,
          isActive: dto.isActive,
          attributes: attributes as Prisma.InputJsonValue | undefined,
          updatedById: actor?.id,
        },
        include: this.defaultInclude(),
      });

      await this.audit.log({
        actorId: actor?.id,
        action: 'UPDATE',
        entityType: 'inventory_items',
        entityId: id,
        beforeData: before,
        afterData: updated,
        requestId,
      });

      return updated;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('SKU already exists for this inventory type');
      }
      throw err;
    }
  }

  async remove(id: string, actor?: AuthUser, requestId?: string) {
    const before = await this.findOne(id);
    const updated = await this.prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedById: actor?.id },
    });
    await this.audit.log({
      actorId: actor?.id,
      action: 'DELETE',
      entityType: 'inventory_items',
      entityId: id,
      beforeData: before,
      afterData: updated,
      requestId,
    });
    return updated;
  }

  async setSuppliers(id: string, dto: SetItemSuppliersDto) {
    await this.findOne(id);
    const preferredCount = dto.suppliers.filter((s) => s.isPreferred).length;
    if (preferredCount > 1) {
      throw new ValidationFailedError('Only one preferred supplier is allowed');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItemSupplier.deleteMany({ where: { inventoryItemId: id } });
      if (dto.suppliers.length) {
        await tx.inventoryItemSupplier.createMany({
          data: dto.suppliers.map((s) => ({
            inventoryItemId: id,
            supplierId: s.supplierId,
            isPreferred: s.isPreferred ?? false,
            supplierSku: s.supplierSku,
            leadTimeDays: s.leadTimeDays,
            notes: s.notes,
          })),
        });
      }
    });

    return this.findOne(id);
  }

  private async validateAndNormalizeAttributes(
    inventoryTypeId: string,
    attributes: Record<string, unknown>,
  ) {
    const schema = (await this.fields.getSchema(inventoryTypeId)) as Array<{
      key: string;
      displayName: string;
      fieldType: FieldType;
      isRequired: boolean;
      isUnique: boolean;
      defaultValue: unknown;
      validation: Record<string, unknown> | null;
      isActive: boolean;
      options: Array<{ value: string; label: string; isActive: boolean }>;
    }>;

    const fieldInputs: FieldDefinitionInput[] = schema.map((f) => ({
      key: f.key,
      displayName: f.displayName,
      fieldType: f.fieldType,
      isRequired: f.isRequired,
      isUnique: f.isUnique,
      defaultValue: f.defaultValue,
      validation: f.validation as FieldDefinitionInput['validation'],
      options: f.options,
      isActive: f.isActive,
    }));

    const result = validateAttributes(fieldInputs, attributes);
    if (!result.success) {
      throw new ValidationFailedError('Invalid attributes', result.issues);
    }
    return result.data;
  }

  private async assertUniqueAttributes(
    inventoryTypeId: string,
    attributes: Record<string, unknown>,
    excludeItemId?: string,
  ) {
    const schema = (await this.fields.getSchema(inventoryTypeId)) as Array<{
      key: string;
      isUnique: boolean;
    }>;

    for (const field of schema.filter((f) => f.isUnique)) {
      const value = attributes[field.key];
      if (value == null || value === '') continue;

      const matches = await this.prisma.inventoryItem.findMany({
        where: {
          inventoryTypeId,
          deletedAt: null,
          id: excludeItemId ? { not: excludeItemId } : undefined,
          attributes: {
            path: [field.key],
            equals: value as Prisma.InputJsonValue,
          },
        },
        take: 1,
        select: { id: true },
      });

      if (matches.length) {
        throw new ConflictError(`Attribute '${field.key}' must be unique`, [
          { path: `attributes.${field.key}`, message: 'Value already exists' },
        ]);
      }
    }
  }

  private defaultInclude() {
    return {
      inventoryType: { select: { id: true, code: true, name: true } },
      category: { select: { id: true, code: true, name: true } },
    } as const;
  }

  private async ensureType(id: string) {
    const type = await this.prisma.inventoryType.findFirst({ where: { id, deletedAt: null } });
    if (!type) throw new NotFoundError('Inventory type not found');
  }

  private async ensureCategory(inventoryTypeId: string, categoryId: string) {
    const cat = await this.prisma.category.findFirst({
      where: { id: categoryId, inventoryTypeId, deletedAt: null },
    });
    if (!cat) throw new ValidationFailedError('Category not found for this inventory type');
  }
}
