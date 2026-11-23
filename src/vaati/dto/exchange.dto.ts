import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VaatiExchangeType } from '@waha/vaati/types/vaati.types';
import { IsBoolean, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class DeclareExchangeDto {
  @ApiProperty({ description: 'Exchange name (e.g. hospital.events, notifications.fanout)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: VaatiExchangeType, default: VaatiExchangeType.TOPIC })
  @IsEnum(VaatiExchangeType)
  type: VaatiExchangeType;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  durable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoDelete?: boolean;
}

export class BindQueueDto {
  @ApiProperty({ description: 'Target queue name to bind' })
  @IsString()
  @IsNotEmpty()
  queueName: string;

  @ApiPropertyOptional({ default: '', description: 'Binding key / topic pattern (e.g. lab.*, hospital.#)' })
  @IsOptional()
  @IsString()
  bindingKey?: string;

  @ApiPropertyOptional({ description: 'Headers match rules for HEADERS exchanges', default: {} })
  @IsOptional()
  @IsObject()
  headerRules?: Record<string, any>;
}
