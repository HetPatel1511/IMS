import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Roles('ADMIN')
  @Post()
  async create(@Body() dto: CreateSupplierDto) {
    return { data: await this.suppliers.create(dto) };
  }

  @Roles('VIEWER')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.suppliers.findAll(query);
  }

  @Roles('VIEWER')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.suppliers.findOne(id) };
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return { data: await this.suppliers.update(id, dto) };
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { data: await this.suppliers.remove(id) };
  }
}
