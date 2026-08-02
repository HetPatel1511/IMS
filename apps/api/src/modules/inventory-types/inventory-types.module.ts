import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryTypesController } from './inventory-types.controller';
import { InventoryTypesService } from './inventory-types.service';

@Module({
  imports: [forwardRef(() => AuditModule)],
  controllers: [InventoryTypesController],
  providers: [InventoryTypesService],
  exports: [InventoryTypesService],
})
export class InventoryTypesModule {}
