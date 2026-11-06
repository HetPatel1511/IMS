import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginateMeta } from '../../common/dto/pagination.dto';
import { StockLevelsQueryDto } from './dto/stock.dto';

type LevelStatus = 'OK' | 'LOW' | 'OUT';

/**
 * Read models for the Stock screen: a KPI summary and the per-item "Levels" table.
 *
 * Valuation basis: on-hand value uses each item's **latest recorded purchase unit
 * price** (the most recent PURCHASE movement whose unitPrice is set). Items that have
 * never been bought with a price contribute zero. This is a deliberate, simple basis —
 * not moving-average — and is documented here so the figure is reproducible.
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [valueRow, unitsRow, lowRow, outRow, movesToday, netRow] = await Promise.all([
      this.prisma.$queryRaw<{ value: string }[]>`
        SELECT COALESCE(SUM(i.quantity * lp.unit_price), 0)::text AS value
        FROM inventory_items i
        JOIN (
          SELECT DISTINCT ON (inventory_item_id) inventory_item_id, unit_price
          FROM stock_transactions
          WHERE type = 'PURCHASE' AND unit_price IS NOT NULL
          ORDER BY inventory_item_id, created_at DESC
        ) lp ON lp.inventory_item_id = i.id
        WHERE i.deleted_at IS NULL AND i.is_active = TRUE
      `,
      this.prisma.$queryRaw<{ units: string }[]>`
        SELECT COALESCE(SUM(quantity), 0)::text AS units
        FROM inventory_items
        WHERE deleted_at IS NULL AND is_active = TRUE
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM inventory_items
        WHERE deleted_at IS NULL AND is_active = TRUE AND quantity <= min_quantity
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM inventory_items
        WHERE deleted_at IS NULL AND is_active = TRUE AND quantity = 0
      `,
      this.prisma.stockTransaction.groupBy({
        by: ['type'],
        where: { createdAt: { gte: startOfToday } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ net: string }[]>`
        SELECT COALESCE(SUM(quantity_after - quantity_before), 0)::text AS net
        FROM stock_transactions
        WHERE created_at >= ${weekAgo}
      `,
    ]);

    const countOf = (t: 'PURCHASE' | 'SALE' | 'ADJUSTMENT') =>
      movesToday.find((m) => m.type === t)?._count._all ?? 0;

    const purchase = countOf('PURCHASE');
    const sale = countOf('SALE');
    const adjustment = countOf('ADJUSTMENT');

    return {
      data: {
        onHandValue: Number(valueRow[0]?.value ?? 0),
        totalUnits: Number(unitsRow[0]?.units ?? 0),
        lowStockCount: Number(lowRow[0]?.count ?? 0),
        outOfStockCount: Number(outRow[0]?.count ?? 0),
        movementsToday: purchase + sale + adjustment,
        movementsTodayByType: { purchase, sale, adjustment },
        netQtyThisWeek: Number(netRow[0]?.net ?? 0),
      },
    };
  }

  async levels(query: StockLevelsQueryDto) {
    const where: Prisma.InventoryItemWhereInput = {
      deletedAt: null,
      isActive: true,
      inventoryTypeId: query.inventoryTypeId,
    };

    if (query.status === 'out') {
      where.quantity = 0;
    } else if (query.status === 'low') {
      // Prisma can't compare two columns in `where`; resolve ids with a raw query
      // (mirrors the dashboard/items low-stock filter) and constrain by them.
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM inventory_items
        WHERE deleted_at IS NULL
          AND is_active = TRUE
          AND quantity <= min_quantity
          ${query.inventoryTypeId ? Prisma.sql`AND inventory_type_id = ${query.inventoryTypeId}::uuid` : Prisma.empty}
      `;
      where.id = { in: rows.map((r) => r.id) };
    }

    if (query.q) {
      where.OR = [
        { sku: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.inventoryItem.count({ where }),
      this.prisma.inventoryItem.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: query.status ? { quantity: 'asc' } : this.parseSort(query.sort),
        select: {
          id: true,
          sku: true,
          name: true,
          quantity: true,
          minQuantity: true,
          inventoryType: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);

    const ids = items.map((i) => i.id);
    const [prices, lastMoves] = await Promise.all([
      ids.length
        ? this.prisma.$queryRaw<{ inventory_item_id: string; unit_price: string }[]>`
            SELECT DISTINCT ON (inventory_item_id) inventory_item_id, unit_price::text
            FROM stock_transactions
            WHERE type = 'PURCHASE'
              AND unit_price IS NOT NULL
              AND inventory_item_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
            ORDER BY inventory_item_id, created_at DESC
          `
        : Promise.resolve([] as { inventory_item_id: string; unit_price: string }[]),
      ids.length
        ? this.prisma.stockTransaction.groupBy({
            by: ['inventoryItemId'],
            where: { inventoryItemId: { in: ids } },
            _max: { createdAt: true },
          })
        : Promise.resolve([] as { inventoryItemId: string; _max: { createdAt: Date | null } }[]),
    ]);

    const priceByItem = new Map(prices.map((p) => [p.inventory_item_id, Number(p.unit_price)]));
    const lastByItem = new Map(lastMoves.map((m) => [m.inventoryItemId, m._max.createdAt]));

    const data = items.map((it) => {
      const unitPrice = priceByItem.get(it.id) ?? null;
      return {
        id: it.id,
        sku: it.sku,
        name: it.name,
        quantity: it.quantity,
        minQuantity: it.minQuantity,
        inventoryType: it.inventoryType,
        status: this.statusOf(it.quantity, it.minQuantity),
        unitPrice,
        onHandValue: unitPrice != null ? Number(it.quantity) * unitPrice : null,
        lastMovementAt: lastByItem.get(it.id) ?? null,
      };
    });

    return { data, meta: paginateMeta(query.page, query.pageSize, total) };
  }

  private statusOf(quantity: Prisma.Decimal, minQuantity: Prisma.Decimal): LevelStatus {
    if (quantity.lessThanOrEqualTo(0)) return 'OUT';
    if (quantity.lessThanOrEqualTo(minQuantity)) return 'LOW';
    return 'OK';
  }

  // Parse a `field:dir` sort into a Prisma orderBy, defaulting to most on-hand first is
  // wrong for this screen — default to the lowest on hand so attention-worthy rows lead.
  private parseSort(sort?: string): Prisma.InventoryItemOrderByWithRelationInput {
    const allowed = new Set(['sku', 'name', 'quantity']);
    if (!sort) return { quantity: 'asc' };
    const [field, dirRaw] = sort.split(':');
    const dir: Prisma.SortOrder = dirRaw === 'asc' ? 'asc' : 'desc';
    if (allowed.has(field))
      return { [field]: dir } as Prisma.InventoryItemOrderByWithRelationInput;
    return { quantity: 'asc' };
  }
}
