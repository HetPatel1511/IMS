import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateBuyerDto, UpdateBuyerDto } from './dto/buyer.dto';
import { BuyersService } from './buyers.service';

@ApiTags('buyers')
@ApiBearerAuth()
@Controller('buyers')
export class BuyersController {
  constructor(private readonly buyers: BuyersService) {}

  @Roles('ADMIN')
  @Post()
  async create(@Body() dto: CreateBuyerDto) {
    return { data: await this.buyers.create(dto) };
  }

  @Roles('VIEWER')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.buyers.findAll(query);
  }

  @Roles('VIEWER')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.buyers.findOne(id) };
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBuyerDto) {
    return { data: await this.buyers.update(id, dto) };
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { data: await this.buyers.remove(id) };
  }
}
