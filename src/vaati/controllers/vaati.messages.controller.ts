import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WAHAValidationPipe } from '@waha/nestjs/pipes/WAHAValidationPipe';
import { CurrentVaatiAuth, VaatiRoles } from '@waha/vaati/auth/decorators';
import { VaatiApiKeyGuard } from '@waha/vaati/auth/vaati-api-key.guard';
import { VaatiRbacGuard } from '@waha/vaati/auth/vaati-rbac.guard';
import { PublishMessageDto } from '@waha/vaati/broker/publisher/publisher.dto';
import { VaatiPublisherService } from '@waha/vaati/broker/publisher/vaati-publisher.service';
import { MessageRepository } from '@waha/vaati/repositories/message.repository';
import { VaatiAuthContext, VaatiRole } from '@waha/vaati/types/vaati.types';

@ApiTags('VAATI Message Broker & Publishing')
@ApiBearerAuth()
@ApiHeader({ name: 'x-vaati-api-key', required: false, description: 'VAATI API Key' })
@Controller('api/v1/messages')
@UseGuards(VaatiApiKeyGuard, VaatiRbacGuard)
export class VaatiMessagesController {
  constructor(
    private readonly publisherService: VaatiPublisherService,
    private readonly messageRepo: MessageRepository,
  ) {}

  @Post('publish')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.PUBLISHER)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Publish an event or message to an exchange with AMQP routing' })
  async publish(
    @Body() dto: PublishMessageDto,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    return await this.publisherService.publish(dto, auth);
  }

  @Get(':id')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.PUBLISHER, VaatiRole.CONSUMER)
  @ApiOperation({ summary: 'Inspect message lifecycle state, payload, and retry attempts' })
  async getMessage(
    @Param('id') id: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const msg = await this.messageRepo.findById(auth.tenantId, id);
    if (!msg) {
      throw new NotFoundException(`Message ${id} not found`);
    }
    return msg;
  }
}
