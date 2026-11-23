import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class PublishOptionsDto {
  @ApiPropertyOptional({ default: true, description: 'Store message durably in transactional outbox' })
  @IsOptional()
  @IsBoolean()
  persistent?: boolean;

  @ApiPropertyOptional({ default: 0, description: 'Message priority level (1-10)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({ description: 'Message Time-To-Live in milliseconds' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(100)
  ttl?: number;

  @ApiPropertyOptional({ default: 5, description: 'Maximum processing attempts before DLQ' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(20)
  maxAttempts?: number;

  @ApiPropertyOptional({ default: 0, description: 'Delayed delivery offset in milliseconds' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  delay?: number;

  @ApiPropertyOptional({ default: false, description: 'Reject if message cannot be routed to any bound queue' })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;
}

export class PublishMessageDto {
  @ApiProperty({ description: 'Target exchange name (e.g. hospital.events)' })
  @IsString()
  @IsNotEmpty()
  exchange: string;

  @ApiProperty({ description: 'Routing key (e.g. lab.report.ready)' })
  @IsString()
  @IsNotEmpty()
  routingKey: string;

  @ApiPropertyOptional({ description: 'Target tenant ID (defaults to authenticated tenant)' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Unique message identifier (generated if omitted)' })
  @IsOptional()
  @IsString()
  messageId?: string;

  @ApiPropertyOptional({ description: 'Correlation ID across distributed workflow traces' })
  @IsOptional()
  @IsString()
  correlationId?: string;

  @ApiPropertyOptional({ description: 'Causation ID of the triggering upstream message' })
  @IsOptional()
  @IsString()
  causationId?: string;

  @ApiPropertyOptional({ description: 'Business idempotency key for exactly-once processing deduplication' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Message metadata headers', default: {} })
  @IsOptional()
  @IsObject()
  headers?: Record<string, any>;

  @ApiProperty({ description: 'Message body payload (JSON)' })
  @IsNotEmpty()
  payload: any;

  @ApiPropertyOptional({ type: PublishOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PublishOptionsDto)
  options?: PublishOptionsDto;
}
