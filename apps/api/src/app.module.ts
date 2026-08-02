import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InventoryTypesModule } from './modules/inventory-types/inventory-types.module';
import { DynamicFieldsModule } from './modules/dynamic-fields/dynamic-fields.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { InventoryItemsModule } from './modules/inventory-items/inventory-items.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { BuyersModule } from './modules/buyers/buyers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AuditModule } from './modules/audit/audit.module';
import { FilesModule } from './modules/files/files.module';
import { StockTransactionsModule } from './modules/stock-transactions/stock-transactions.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    InventoryTypesModule,
    DynamicFieldsModule,
    CategoriesModule,
    InventoryItemsModule,
    SuppliersModule,
    BuyersModule,
    DashboardModule,
    SettingsModule,
    AuditModule,
    FilesModule,
    StockTransactionsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
