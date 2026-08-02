import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictError, NotFoundError, ValidationFailedError } from '../../common/errors/domain-error';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(inventoryTypeId: string, dto: CreateCategoryDto) {
    await this.ensureType(inventoryTypeId);
    if (dto.parentId) await this.ensureParent(inventoryTypeId, dto.parentId);

    const existing = await this.prisma.category.findFirst({
      where: { inventoryTypeId, code: dto.code, deletedAt: null },
    });
    if (existing) throw new ConflictError('Category code already exists');

    return this.prisma.category.create({
      data: {
        inventoryTypeId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async findAll(inventoryTypeId: string) {
    await this.ensureType(inventoryTypeId);
    return this.prisma.category.findMany({
      where: { inventoryTypeId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async update(inventoryTypeId: string, id: string, dto: UpdateCategoryDto) {
    await this.findOne(inventoryTypeId, id);
    if (dto.parentId) {
      if (dto.parentId === id) throw new ValidationFailedError('Category cannot be its own parent');
      await this.ensureParent(inventoryTypeId, dto.parentId);
    }
    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        parentId: dto.parentId === null ? null : dto.parentId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  async remove(inventoryTypeId: string, id: string) {
    await this.findOne(inventoryTypeId, id);
    return this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  private async findOne(inventoryTypeId: string, id: string) {
    const cat = await this.prisma.category.findFirst({
      where: { id, inventoryTypeId, deletedAt: null },
    });
    if (!cat) throw new NotFoundError('Category not found');
    return cat;
  }

  private async ensureType(inventoryTypeId: string) {
    const type = await this.prisma.inventoryType.findFirst({
      where: { id: inventoryTypeId, deletedAt: null },
    });
    if (!type) throw new NotFoundError('Inventory type not found');
  }

  private async ensureParent(inventoryTypeId: string, parentId: string) {
    const parent = await this.prisma.category.findFirst({
      where: { id: parentId, inventoryTypeId, deletedAt: null },
    });
    if (!parent) throw new ValidationFailedError('Parent category not found for this type');
  }
}
