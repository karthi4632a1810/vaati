import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ReplayDeadLetterDto {
  @ApiPropertyOptional({ description: 'Target exchange to re-drive message to (defaults to original exchange)' })
  @IsOptional()
  @IsString()
  targetExchange?: string;

  @ApiPropertyOptional({ description: 'Target routing key (defaults to original routing key)' })
  @IsOptional()
  @IsString()
  targetRoutingKey?: string;
}

export class BulkReplayDeadLetterDto {
  @ApiPropertyOptional({ description: 'Filter dead letters by original queue' })
  @IsOptional()
  @IsString()
  queue?: string;

  @ApiPropertyOptional({ description: 'Filter dead letters by substring match in failure reason' })
  @IsOptional()
  @IsString()
  failurePattern?: string;

  @ApiPropertyOptional({ default: 50, description: 'Maximum dead letters to replay in batch' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(500)
  limit?: number;
}
