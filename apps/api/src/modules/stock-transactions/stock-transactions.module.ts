import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StockTransactionsController } from './stock-transactions.controller';
import { StockTransactionsService } from './stock-transactions.service';

@Module({
  imports: [AuditModule],
  controllers: [StockTransactionsController],
  providers: [StockTransactionsService],
  exports: [StockTransactionsService],
})
export class StockTransactionsModule {}
