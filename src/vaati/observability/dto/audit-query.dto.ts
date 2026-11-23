import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AuditQueryDto {
  @ApiPropertyOptional({ description: 'Filter by action (e.g. QUEUE_PURGED, DEAD_LETTER_REPLAYED)' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by resource type (e.g. QUEUE, EXCHANGE, TENANT)' })
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional({ default: 50, description: 'Number of audit logs to retrieve' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ default: 0, description: 'Pagination offset' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  offset?: number;
}
