import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('VIEWER')
  @Get('summary')
  async summary() {
    const [types, items, lowStock, suppliers, buyers] = await Promise.all([
      this.prisma.inventoryType.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.inventoryItem.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM inventory_items
        WHERE deleted_at IS NULL
          AND is_active = TRUE
          AND quantity <= min_quantity
      `,
      this.prisma.supplier.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.buyer.count({ where: { deletedAt: null, isActive: true } }),
    ]);

    const byType = await this.prisma.inventoryItem.groupBy({
      by: ['inventoryTypeId'],
      where: { deletedAt: null, isActive: true },
      _count: { _all: true },
    });

    const typeRows = await this.prisma.inventoryType.findMany({
      where: { id: { in: byType.map((b) => b.inventoryTypeId) } },
      select: { id: true, code: true, name: true },
    });

    return {
      data: {
        inventoryTypes: types,
        inventoryItems: items,
        lowStockItems: Number(lowStock[0]?.count ?? 0),
        suppliers,
        buyers,
        itemsByType: byType.map((row) => ({
          inventoryTypeId: row.inventoryTypeId,
          count: row._count._all,
          type: typeRows.find((t) => t.id === row.inventoryTypeId) ?? null,
        })),
      },
    };
  }
}
