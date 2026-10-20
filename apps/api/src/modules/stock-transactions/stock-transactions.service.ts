import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/domain-error';
import { paginateMeta } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import {
  AdjustStockDto,
  BuyStockDto,
  SellStockDto,
  StockTransactionQueryDto,
} from './dto/stock-transaction.dto';

@Injectable()
export class StockTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async buy(dto: BuyStockDto, actor?: AuthUser, requestId?: string) {
    const item = await this.requireItem(dto.inventoryItemId);
    await this.requireSupplier(dto.supplierId);

    const quantityBefore = new Prisma.Decimal(item.quantity);
    const qty = new Prisma.Decimal(dto.quantity);
    const quantityAfter = quantityBefore.add(qty);

    const tx = await this.prisma.$transaction(async (db) => {
      await db.inventoryItem.update({
        where: { id: item.id },
        data: {
          quantity: quantityAfter,
          updatedById: actor?.id,
        },
      });

      return db.stockTransaction.create({
        data: {
          type: 'PURCHASE',
          inventoryItemId: item.id,
          inventoryTypeId: item.inventoryTypeId,
          quantity: qty,
          quantityBefore,
          quantityAfter,
          supplierId: dto.supplierId,
          unitPrice: dto.unitPrice != null ? new Prisma.Decimal(dto.unitPrice) : undefined,
          notes: dto.notes,
          createdById: actor?.id,
        },
        include: this.defaultInclude(),
      });
    });

    await this.audit.log({
      actorId: actor?.id,
      action: 'CREATE',
      entityType: 'stock_transactions',
      entityId: tx.id,
      afterData: tx,
      requestId,
      summary: `Purchased ${dto.quantity} of ${item.sku} from supplier`,
    });

    return tx;
  }

  async adjust(dto: AdjustStockDto, actor?: AuthUser, requestId?: string) {
    const item = await this.requireItem(dto.inventoryItemId);
    if (!dto.reason?.trim()) {
      throw new ValidationFailedError('A reason is required for a stock adjustment', [
        { path: 'reason', message: 'Required' },
      ]);
    }

    const quantityBefore = new Prisma.Decimal(item.quantity);
    const quantityAfter = new Prisma.Decimal(dto.newQuantity);
    const delta = quantityAfter.sub(quantityBefore);
    if (delta.isZero()) {
      throw new ValidationFailedError('New quantity is the same as the current quantity', [
        { path: 'newQuantity', message: 'No change' },
      ]);
    }

    const tx = await this.prisma.$transaction(async (db) => {
      await db.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: quantityAfter, updatedById: actor?.id },
      });

      return db.stockTransaction.create({
        data: {
          type: 'ADJUSTMENT',
          inventoryItemId: item.id,
          inventoryTypeId: item.inventoryTypeId,
          quantity: delta.abs(),
          quantityBefore,
          quantityAfter,
          notes: dto.reason,
          createdById: actor?.id,
        },
        include: this.defaultInclude(),
      });
    });

    await this.audit.log({
      actorId: actor?.id,
      action: 'UPDATE',
      entityType: 'stock_transactions',
      entityId: tx.id,
      afterData: tx,
      requestId,
      summary: `Adjusted ${item.sku} from ${quantityBefore.toString()} to ${quantityAfter.toString()}`,
    });

    return tx;
  }

  async sell(dto: SellStockDto, actor?: AuthUser, requestId?: string) {
    const item = await this.requireItem(dto.inventoryItemId);
    await this.requireBuyer(dto.buyerId);

    const quantityBefore = new Prisma.Decimal(item.quantity);
    const qty = new Prisma.Decimal(dto.quantity);

    if (quantityBefore.lessThan(qty)) {
      throw new ValidationFailedError('Insufficient stock', [
        {
          path: 'quantity',
          message: `Available ${quantityBefore.toString()}, requested ${qty.toString()}`,
        },
      ]);
    }

    const quantityAfter = quantityBefore.sub(qty);

    const tx = await this.prisma.$transaction(async (db) => {
      await db.inventoryItem.update({
        where: { id: item.id },
        data: {
          quantity: quantityAfter,
          updatedById: actor?.id,
        },
      });

      return db.stockTransaction.create({
        data: {
          type: 'SALE',
          inventoryItemId: item.id,
          inventoryTypeId: item.inventoryTypeId,
          quantity: qty,
          quantityBefore,
          quantityAfter,
          buyerId: dto.buyerId,
          unitPrice: dto.unitPrice != null ? new Prisma.Decimal(dto.unitPrice) : undefined,
          notes: dto.notes,
          createdById: actor?.id,
        },
        include: this.defaultInclude(),
      });
    });

    await this.audit.log({
      actorId: actor?.id,
      action: 'CREATE',
      entityType: 'stock_transactions',
      entityId: tx.id,
      afterData: tx,
      requestId,
      summary: `Sold ${dto.quantity} of ${item.sku} to buyer`,
    });

    return tx;
  }

  async findAll(query: StockTransactionQueryDto) {
    const quantityFilter: Prisma.DecimalFilter | undefined = (() => {
      if (query.quantity != null) return { equals: query.quantity };
      const filter: Prisma.DecimalFilter = {};
      if (query.quantityMin != null) filter.gte = query.quantityMin;
      if (query.quantityMax != null) filter.lte = query.quantityMax;
      return Object.keys(filter).length ? filter : undefined;
    })();

    const where: Prisma.StockTransactionWhereInput = {
      type: query.type,
      inventoryItemId: query.inventoryItemId,
      inventoryTypeId: query.inventoryTypeId,
      supplierId: query.supplierId,
      buyerId: query.buyerId,
      quantity: quantityFilter,
    };

    if (query.q) {
      where.OR = [
        { inventoryItem: { sku: { contains: query.q, mode: 'insensitive' } } },
        { inventoryItem: { name: { contains: query.q, mode: 'insensitive' } } },
        { supplier: { name: { contains: query.q, mode: 'insensitive' } } },
        { buyer: { name: { contains: query.q, mode: 'insensitive' } } },
        { notes: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const orderBy = this.parseSort(query.sort);

    const [total, data] = await this.prisma.$transaction([
      this.prisma.stockTransaction.count({ where }),
      this.prisma.stockTransaction.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy,
        include: this.defaultInclude(),
      }),
    ]);

    return { data, meta: paginateMeta(query.page, query.pageSize, total) };
  }

  // Parse a `field:dir` sort param into a Prisma orderBy, defaulting to newest first.
  private parseSort(sort?: string): Prisma.StockTransactionOrderByWithRelationInput {
    const allowed: Record<string, Prisma.StockTransactionOrderByWithRelationInput> = {
      createdAt: {},
      type: {},
      quantity: {},
      quantityAfter: {},
    };
    if (!sort) return { createdAt: 'desc' };
    const [field, dirRaw] = sort.split(':');
    const dir: Prisma.SortOrder = dirRaw === 'asc' ? 'asc' : 'desc';
    if (field === 'item') return { inventoryItem: { sku: dir } };
    if (field === 'inventoryType') return { inventoryType: { name: dir } };
    if (field in allowed) return { [field]: dir } as Prisma.StockTransactionOrderByWithRelationInput;
    return { createdAt: 'desc' };
  }

  private defaultInclude() {
    return {
      inventoryItem: { select: { id: true, sku: true, name: true, quantity: true } },
      inventoryType: { select: { id: true, code: true, name: true } },
      supplier: { select: { id: true, code: true, name: true } },
      buyer: { select: { id: true, code: true, name: true } },
      createdBy: { select: { id: true, fullName: true, email: true } },
    } as const;
  }

  private async requireItem(id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null, isActive: true },
    });
    if (!item) throw new NotFoundError('Inventory item not found');
    return item;
  }

  private async requireSupplier(id: string) {
    const row = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null, isActive: true },
    });
    if (!row) throw new NotFoundError('Supplier not found');
    return row;
  }

  private async requireBuyer(id: string) {
    const row = await this.prisma.buyer.findFirst({
      where: { id, deletedAt: null, isActive: true },
    });
    if (!row) throw new NotFoundError('Buyer not found');
    return row;
  }
}
