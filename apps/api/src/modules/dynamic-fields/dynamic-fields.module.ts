import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DynamicFieldsController } from './dynamic-fields.controller';
import { DynamicFieldsService } from './dynamic-fields.service';

@Module({
  imports: [AuditModule],
  controllers: [DynamicFieldsController],
  providers: [DynamicFieldsService],
  exports: [DynamicFieldsService],
})
export class DynamicFieldsModule {}
