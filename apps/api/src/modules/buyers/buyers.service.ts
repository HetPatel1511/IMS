import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { paginateMeta, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateBuyerDto, UpdateBuyerDto } from './dto/buyer.dto';

@Injectable()
export class BuyersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBuyerDto) {
    const existing = await this.prisma.buyer.findFirst({
      where: { code: dto.code, deletedAt: null },
    });
    if (existing) throw new ConflictError('Buyer code already exists');

    return this.prisma.buyer.create({
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
    const where: Prisma.BuyerWhereInput = {
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
      this.prisma.buyer.count({ where }),
      this.prisma.buyer.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: 'asc' },
      }),
    ]);
    return { data, meta: paginateMeta(query.page, query.pageSize, total) };
  }

  async findOne(id: string) {
    const row = await this.prisma.buyer.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundError('Buyer not found');
    return row;
  }

  async update(id: string, dto: UpdateBuyerDto) {
    await this.findOne(id);
    return this.prisma.buyer.update({
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
    return this.prisma.buyer.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
