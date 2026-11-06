import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { paginateMeta, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupplierDto) {
    const existing = await this.prisma.supplier.findFirst({
      where: { code: dto.code, deletedAt: null },
    });
    if (existing) throw new ConflictError('Supplier code already exists');

    return this.prisma.supplier.create({
      data: {
        code: dto.code,
        name: dto.name,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        notes: dto.notes,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async findAll(query: PaginationQueryDto) {
    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { code: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: this.parseSort(query.sort),
      }),
    ]);
    return { data, meta: paginateMeta(query.page, query.pageSize, total) };
  }

  // Parse a `field:dir` sort param into a Prisma orderBy, defaulting to name A→Z.
  // Only whitelisted columns are accepted; anything else falls back to the default,
  // so existing callers that send no sort keep the previous ordering unchanged.
  private parseSort(sort?: string): Prisma.SupplierOrderByWithRelationInput {
    const allowed = new Set(['code', 'name', 'email', 'phone']);
    if (!sort) return { name: 'asc' };
    const [field, dirRaw] = sort.split(':');
    const dir: Prisma.SortOrder = dirRaw === 'asc' ? 'asc' : 'desc';
    if (allowed.has(field))
      return { [field]: dir } as Prisma.SupplierOrderByWithRelationInput;
    return { name: 'asc' };
  }

  async findOne(id: string) {
    const row = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundError('Supplier not found');
    return row;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);
    return this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        notes: dto.notes,
        isActive: dto.isActive,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
