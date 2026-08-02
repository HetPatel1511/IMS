import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, Roles, type AuthUser } from '../../common/decorators/auth.decorators';
import { CreateInventoryTypeDto, UpdateInventoryTypeDto } from './dto/inventory-type.dto';
import { InventoryTypesService } from './inventory-types.service';

@ApiTags('inventory-types')
@ApiBearerAuth()
@Controller('inventory-types')
export class InventoryTypesController {
  constructor(private readonly service: InventoryTypesService) {}

  @Roles('ADMIN')
  @Post()
  async create(
    @Body() dto: CreateInventoryTypeDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return { data: await this.service.create(dto, user, req.requestId) };
  }

  @Roles('VIEWER')
  @Get()
  async findAll() {
    return { data: await this.service.findAll() };
  }

  @Roles('VIEWER')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.service.findOne(id) };
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryTypeDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return { data: await this.service.update(id, dto, user, req.requestId) };
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return { data: await this.service.remove(id, user, req.requestId) };
  }
}
