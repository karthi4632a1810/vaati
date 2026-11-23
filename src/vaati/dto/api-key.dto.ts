import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VaatiRole } from '@waha/vaati/types/vaati.types';
import { Type } from 'class-transformer';
import { IsArray, IsDate, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'Tenant ID that this API key belongs to' })
  @IsString()
  tenantId: string;

  @ApiProperty({ enum: VaatiRole, default: VaatiRole.PUBLISHER })
  @IsEnum(VaatiRole)
  role: VaatiRole;

  @ApiPropertyOptional({ description: 'List of allowed exchange patterns', default: ['*'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedExchanges?: string[];

  @ApiPropertyOptional({ description: 'List of allowed queue patterns', default: ['*'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedQueues?: string[];

  @ApiPropertyOptional({ description: 'ISO expiration date string' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  expiresAt?: Date;
}
