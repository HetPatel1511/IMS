import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { StockLevelsQueryDto } from './dto/stock.dto';
import { StockService } from './stock.service';

@ApiTags('stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Roles('VIEWER')
  @Get('summary')
  summary() {
    return this.stock.summary();
  }

  @Roles('VIEWER')
  @Get('levels')
  levels(@Query() query: StockLevelsQueryDto) {
    return this.stock.levels(query);
  }
}
