import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class DeclareQueueDto {
  @ApiProperty({ description: 'Unique queue name (e.g. lis.orders.queue, pacs.imaging.high)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  durable?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Enable priority levels 1-10' })
  @IsOptional()
  @IsBoolean()
  priority?: boolean;

  @ApiPropertyOptional({ default: 5, description: 'Max retry attempts before forwarding to dead-letter queue' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(25)
  maxAttempts?: number;

  @ApiPropertyOptional({ default: 86400000, description: 'Queue TTL in milliseconds' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  messageTtlMs?: number;

  @ApiPropertyOptional({ description: 'Dead letter exchange for rejected/failed messages' })
  @IsOptional()
  @IsString()
  deadLetterExchange?: string;

  @ApiPropertyOptional({ description: 'Dead letter routing key' })
  @IsOptional()
  @IsString()
  deadLetterRoutingKey?: string;

  @ApiPropertyOptional({ default: 50, description: 'Concurrent worker jobs processing limit' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(1000)
  concurrencyLimit?: number;
}
