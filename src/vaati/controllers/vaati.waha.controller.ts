import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WAHAValidationPipe } from '@waha/nestjs/pipes/WAHAValidationPipe';
import { CurrentVaatiAuth, VaatiRoles } from '@waha/vaati/auth/decorators';
import { VaatiApiKeyGuard } from '@waha/vaati/auth/vaati-api-key.guard';
import { VaatiRbacGuard } from '@waha/vaati/auth/vaati-rbac.guard';
import { VaatiAuthContext, VaatiRole } from '@waha/vaati/types/vaati.types';
import { WahaSendCommandDto } from '@waha/vaati/waha-bridge/dto/waha-command.dto';
import { VaatiWahaBridgeService } from '@waha/vaati/waha-bridge/vaati-waha-bridge.service';

@ApiTags('VAATI WhatsApp Broker Bridge')
@ApiBearerAuth()
@ApiHeader({ name: 'x-vaati-api-key', required: false, description: 'VAATI API Key' })
@Controller('api/v1/waha')
@UseGuards(VaatiApiKeyGuard, VaatiRbacGuard)
export class VaatiWahaController {
  constructor(private readonly bridgeService: VaatiWahaBridgeService) {}

  @Post('send')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.PUBLISHER)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Asynchronously publish a WhatsApp message command via VAATI reliable broker' })
  async send(
    @Body() dto: WahaSendCommandDto,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    return await this.bridgeService.dispatchOutboundCommand(dto, auth);
  }

  @Get('status')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.PUBLISHER, VaatiRole.CONSUMER)
  @ApiOperation({ summary: 'Get WhatsApp bridge telemetry and topology metrics' })
  async getStatus() {
    return this.bridgeService.getMetrics();
  }
}
