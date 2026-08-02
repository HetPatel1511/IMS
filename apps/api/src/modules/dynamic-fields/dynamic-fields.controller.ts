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
import { CreateFieldDto, ReorderFieldsDto, UpdateFieldDto } from './dto/field.dto';
import { DynamicFieldsService } from './dynamic-fields.service';

@ApiTags('dynamic-fields')
@ApiBearerAuth()
@Controller('inventory-types/:typeId/fields')
export class DynamicFieldsController {
  constructor(private readonly fields: DynamicFieldsService) {}

  @Roles('VIEWER')
  @Get()
  async list(@Param('typeId') typeId: string) {
    return { data: await this.fields.listAll(typeId) };
  }

  @Roles('VIEWER')
  @Get('schema')
  async schema(@Param('typeId') typeId: string) {
    return { data: await this.fields.getSchema(typeId) };
  }

  @Roles('ADMIN')
  @Post()
  async create(
    @Param('typeId') typeId: string,
    @Body() dto: CreateFieldDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return { data: await this.fields.create(typeId, dto, user, req.requestId) };
  }

  @Roles('ADMIN')
  @Post('reorder')
  async reorder(@Param('typeId') typeId: string, @Body() dto: ReorderFieldsDto) {
    return { data: await this.fields.reorder(typeId, dto) };
  }

  @Roles('ADMIN')
  @Patch(':fieldId')
  async update(
    @Param('typeId') typeId: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateFieldDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return { data: await this.fields.update(typeId, fieldId, dto, user, req.requestId) };
  }

  @Roles('ADMIN')
  @Delete(':fieldId')
  async remove(
    @Param('typeId') typeId: string,
    @Param('fieldId') fieldId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return { data: await this.fields.remove(typeId, fieldId, user, req.requestId) };
  }
}
