import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WAHAValidationPipe } from '@waha/nestjs/pipes/WAHAValidationPipe';
import { CurrentVaatiAuth, VaatiRoles } from '@waha/vaati/auth/decorators';
import { VaatiApiKeyGuard } from '@waha/vaati/auth/vaati-api-key.guard';
import { VaatiRbacGuard } from '@waha/vaati/auth/vaati-rbac.guard';
import {
  BulkReplayDeadLetterDto,
  ReplayDeadLetterDto,
} from '@waha/vaati/reliability/dlq/dto/dead-letter.dto';
import { VaatiDeadLetterService } from '@waha/vaati/reliability/dlq/vaati-dead-letter.service';
import { VaatiAuthContext, VaatiRole } from '@waha/vaati/types/vaati.types';

@ApiTags('VAATI Dead Letter Office')
@ApiBearerAuth()
@ApiHeader({ name: 'x-vaati-api-key', required: false, description: 'VAATI API Key' })
@Controller('api/v1/dead-letter')
@UseGuards(VaatiApiKeyGuard, VaatiRbacGuard)
export class VaatiDeadLetterController {
  constructor(private readonly dlqService: VaatiDeadLetterService) {}

  @Get()
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.AUDITOR)
  @ApiQuery({ name: 'queue', required: false, description: 'Filter by original queue name' })
  @ApiQuery({ name: 'replayed', required: false, description: 'Filter by replayed status (true/false)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Pagination limit (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Pagination offset (default: 0)' })
  @ApiOperation({ summary: 'List and inspect failed messages in the Dead Letter Office' })
  async listDeadLetters(
    @CurrentVaatiAuth() auth: VaatiAuthContext,
    @Query('queue') queue?: string,
    @Query('replayed') replayed?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const isReplayed = replayed !== undefined ? replayed === 'true' : undefined;
    return await this.dlqService.listDeadLetters(auth.tenantId, {
      queue: queue,
      replayed: isReplayed,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get(':id')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.AUDITOR)
  @ApiOperation({ summary: 'Get full forensic error details and original payload of a dead letter' })
  async getDeadLetter(
    @Param('id') id: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    return await this.dlqService.getDeadLetter(auth.tenantId, id);
  }

  @Post(':id/replay')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: '1-Click re-drive dead letter message back into broker' })
  async replayMessage(
    @Param('id') id: string,
    @Body() dto: ReplayDeadLetterDto,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    return await this.dlqService.replayMessage(auth.tenantId, id, dto, auth);
  }

  @Post('bulk-replay')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Bulk re-drive dead letter messages matching criteria' })
  async bulkReplay(
    @Body() dto: BulkReplayDeadLetterDto,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    return await this.dlqService.bulkReplay(auth.tenantId, dto, auth);
  }

  @Delete(':id')
  @VaatiRoles(VaatiRole.ADMIN)
  @ApiOperation({ summary: 'Permanently discard dead letter message' })
  async discard(
    @Param('id') id: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    return await this.dlqService.discard(auth.tenantId, id, auth);
  }
}
