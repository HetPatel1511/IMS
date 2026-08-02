import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles('SUPER_ADMIN')
  @Post()
  async create(@Body() dto: CreateUserDto) {
    return { data: await this.users.create(dto) };
  }

  @Roles('ADMIN')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.users.findAll(query);
  }

  @Roles('SUPER_ADMIN')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return { data: await this.users.update(id, dto) };
  }
}
