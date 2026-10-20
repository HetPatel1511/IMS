import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, Roles, type AuthUser } from '../../common/decorators/auth.decorators';
import {
  AdjustStockDto,
  BuyStockDto,
  SellStockDto,
  StockTransactionQueryDto,
} from './dto/stock-transaction.dto';
import { StockTransactionsService } from './stock-transactions.service';

@ApiTags('stock-transactions')
@ApiBearerAuth()
@Controller('stock-transactions')
export class StockTransactionsController {
  constructor(private readonly stock: StockTransactionsService) {}

  @Roles('ADMIN')
  @Post('buy')
  async buy(
    @Body() dto: BuyStockDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return { data: await this.stock.buy(dto, user, req.requestId) };
  }

  @Roles('ADMIN')
  @Post('sell')
  async sell(
    @Body() dto: SellStockDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return { data: await this.stock.sell(dto, user, req.requestId) };
  }

  @Roles('ADMIN')
  @Post('adjust')
  async adjust(
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { requestId?: string },
  ) {
    return { data: await this.stock.adjust(dto, user, req.requestId) };
  }

  @Roles('VIEWER')
  @Get()
  findAll(@Query() query: StockTransactionQueryDto) {
    return this.stock.findAll(query);
  }
}
