import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';
import { Prisma } from '@prisma/client';
import { CurrentUser, Roles, type AuthUser } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../prisma/prisma.service';

class UpsertSettingDto {
  @IsString()
  key!: string;

  @IsObject()
  value!: Record<string, unknown>;
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('VIEWER')
  @Get()
  async list() {
    const rows = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return { data: rows };
  }

  @Roles('ADMIN')
  @Patch()
  async upsert(@Body() dto: UpsertSettingDto, @CurrentUser() user: AuthUser) {
    const row = await this.prisma.setting.upsert({
      where: { key: dto.key },
      create: {
        key: dto.key,
        value: dto.value as Prisma.InputJsonValue,
        updatedById: user.id,
      },
      update: {
        value: dto.value as Prisma.InputJsonValue,
        updatedById: user.id,
      },
    });
    return { data: row };
  }
}
