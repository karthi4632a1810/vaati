import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class SubscribeConsumerDto {
  @ApiProperty({ description: 'Queue name to consume from' })
  @IsString()
  @IsNotEmpty()
  queueName: string;

  @ApiPropertyOptional({ description: 'HTTPS Webhook URL to deliver messages to' })
  @IsOptional()
  @IsUrl()
  targetWebhookUrl?: string;

  @ApiPropertyOptional({ description: 'Registered internal service handler name' })
  @IsOptional()
  @IsString()
  internalHandlerName?: string;

  @ApiPropertyOptional({ default: 50, description: 'Worker concurrency / prefetch limit' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(1000)
  concurrency?: number;
}
