import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DynamicFieldsModule } from '../dynamic-fields/dynamic-fields.module';
import { InventoryItemsController } from './inventory-items.controller';
import { InventoryItemsService } from './inventory-items.service';

@Module({
  imports: [DynamicFieldsModule, AuditModule],
  controllers: [InventoryItemsController],
  providers: [InventoryItemsService],
  exports: [InventoryItemsService],
})
export class InventoryItemsModule {}
