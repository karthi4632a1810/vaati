import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class WahaSendCommandDto {
  @ApiPropertyOptional({ default: 'default', description: 'WhatsApp session identifier' })
  @IsOptional()
  @IsString()
  session?: string;

  @ApiProperty({ description: 'Target phone number or chat ID (e.g. 919551382296@c.us or group@g.us)' })
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @ApiPropertyOptional({ description: 'Text content to send' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ default: true, description: 'Generate rich link preview card' })
  @IsOptional()
  @IsBoolean()
  linkPreview?: boolean;

  @ApiPropertyOptional({ description: 'Poll configuration object' })
  @IsOptional()
  @IsObject()
  poll?: {
    name: string;
    options: string[];
    multipleAnswers?: boolean;
  };

  @ApiPropertyOptional({ description: 'File attachment details' })
  @IsOptional()
  @IsObject()
  file?: {
    url?: string;
    filename?: string;
    mimetype?: string;
    caption?: string;
  };

  @ApiPropertyOptional({ default: false, description: 'Mark chat as read' })
  @IsOptional()
  @IsBoolean()
  seen?: boolean;
}
