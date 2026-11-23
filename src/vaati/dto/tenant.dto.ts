import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VaatiTenantStatus } from '@waha/vaati/types/vaati.types';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ description: 'Unique identifier for the tenant (e.g. hospital-001, hrms-prod)' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Human readable name of the tenant' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: VaatiTenantStatus, default: VaatiTenantStatus.ACTIVE })
  @IsOptional()
  @IsEnum(VaatiTenantStatus)
  status?: VaatiTenantStatus;

  @ApiPropertyOptional({ description: 'Allowed published messages per minute', default: 6000 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(1000000)
  rateLimitPerMinute?: number;

  @ApiPropertyOptional({ description: 'Maximum allowed queues for this tenant', default: 100 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  maxQueues?: number;

  @ApiPropertyOptional({ description: 'Maximum allowed message payload in bytes', default: 10485760 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1024)
  maxPayloadBytes?: number;
}

export class UpdateTenantStatusDto {
  @ApiProperty({ enum: VaatiTenantStatus })
  @IsEnum(VaatiTenantStatus)
  status: VaatiTenantStatus;
}

export class UpdateTenantQuotasDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  rateLimitPerMinute?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  maxQueues?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1024)
  maxPayloadBytes?: number;
}
