import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/**
 * Query for the Stock "Levels" table — the current-state view of on-hand quantity per
 * item. Inherits page / pageSize / sort / q from PaginationQueryDto; adds a type filter
 * and a stock-status filter ('low' = at or below reorder level, 'out' = zero on hand).
 */
export class StockLevelsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  inventoryTypeId?: string;

  @IsOptional()
  @IsIn(['low', 'out'])
  status?: 'low' | 'out';
}
