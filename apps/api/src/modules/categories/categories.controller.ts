import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('inventory-types/:typeId/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Roles('ADMIN')
  @Post()
  async create(@Param('typeId') typeId: string, @Body() dto: CreateCategoryDto) {
    return { data: await this.categories.create(typeId, dto) };
  }

  @Roles('VIEWER')
  @Get()
  async findAll(@Param('typeId') typeId: string) {
    return { data: await this.categories.findAll(typeId) };
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(
    @Param('typeId') typeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return { data: await this.categories.update(typeId, id, dto) };
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remove(@Param('typeId') typeId: string, @Param('id') id: string) {
    return { data: await this.categories.remove(typeId, id) };
  }
}
