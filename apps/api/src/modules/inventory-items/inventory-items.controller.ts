import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, Roles, type AuthUser } from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  CreateInventoryItemDto,
  SetItemSuppliersDto,
  UpdateInventoryItemDto,
} from './dto/item.dto';
import { InventoryItemsService } from './inventory-items.service';

class ItemListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  inventoryTypeId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  // ?belowReorder=1 restricts the list to items at or below their reorder level,
  // computed server-side (v3 A5) so the dashboard needn't pull every item and filter.
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  belowReorder?: boolean;
}

@ApiTags('inventory-items')
@ApiBearerAuth()
@Controller('inventory-items')
export class InventoryItemsController {
  constructor(private readonly items: InventoryItemsService) {}

  @Roles('ADMIN')
  @Post()
  async create(
    @Body() dto: CreateInventoryItemDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return { data: await this.items.create(dto, user, req.requestId) };
  }

  @Roles('VIEWER')
  @Get()
  findAll(@Query() query: ItemListQueryDto, @Req() req: Request) {
    const attr: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (key.startsWith('attr[') && key.endsWith(']') && typeof value === 'string') {
        attr[key.slice(5, -1)] = value;
      }
    }
    return this.items.findAll({ ...query, attr });
  }

  @Roles('VIEWER')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.items.findOne(id) };
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return { data: await this.items.update(id, dto, user, req.requestId) };
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return { data: await this.items.remove(id, user, req.requestId) };
  }

  @Roles('ADMIN')
  @Put(':id/suppliers')
  async setSuppliers(@Param('id') id: string, @Body() dto: SetItemSuppliersDto) {
    return { data: await this.items.setSuppliers(id, dto) };
  }
}
