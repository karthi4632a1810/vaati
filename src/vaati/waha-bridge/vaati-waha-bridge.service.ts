import * as crypto from 'node:crypto';

import {
  forwardRef,
  Inject,
  Injectable,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { SessionPluginsProvider, SessionPluginsService } from '@waha/plugins/SessionPluginsService';
import { VaatiPublisherService } from '@waha/vaati/broker/publisher/vaati-publisher.service';
import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import { BindingRepository } from '@waha/vaati/repositories/binding.repository';
import { ExchangeRepository } from '@waha/vaati/repositories/exchange.repository';
import { QueueRepository } from '@waha/vaati/repositories/queue.repository';
import {
  VaatiAuthContext,
  VaatiExchangeType,
  VaatiRole,
} from '@waha/vaati/types/vaati.types';
import {
  VaatiWahaBridgePlugin,
} from '@waha/vaati/waha-bridge/vaati-waha-bridge.plugin';
import { VaatiWorkerCoordinator } from '@waha/vaati/workers/vaati-worker-coordinator.service';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { WahaSendCommandDto } from './dto/waha-command.dto';

@Injectable()
export class VaatiWahaBridgeService implements OnApplicationBootstrap, SessionPluginsProvider {
  private readonly tenantId: string;
  private inboundEventsCount = 0;
  private outboundCommandsCount = 0;

  constructor(
    private readonly config: VaatiConfigService,
    private readonly exchangeRepo: ExchangeRepository,
    private readonly queueRepo: QueueRepository,
    private readonly bindingRepo: BindingRepository,
    private readonly publisherService: VaatiPublisherService,
    private readonly workerCoordinator: VaatiWorkerCoordinator,
    @Optional() private readonly pluginsService?: SessionPluginsService,
    @Optional() @Inject(forwardRef(() => SessionManager)) private readonly sessionManager?: SessionManager,
    @InjectPinoLogger('VaatiWahaBridgeService') private readonly logger?: PinoLogger,
  ) {
    this.tenantId = this.config.defaultTenantId;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.isEnabled) {
      return;
    }

    try {
      await this.initBrokerTopology();
      this.registerOutboundWorker();

      if (this.pluginsService) {
        this.pluginsService.register(this);
        this.logger?.info('Registered VAATI WhatsApp Bridge plugin provider with SessionPluginsService');
      }
    } catch (err: any) {
      this.logger?.error({ err: err.message }, 'Failed to initialize VAATI WhatsApp Bridge');
    }
  }

  plugins(session: any): any[] {
    return [
      {
        plugin: VaatiWahaBridgePlugin,
        config: null,
        deps: {
          bridgeService: this,
        },
      },
    ];
  }

  private async initBrokerTopology(): Promise<void> {
    // 1. Declare waha.events exchange
    await this.exchangeRepo.declare({
      id: 'ex_waha_events',
      tenantId: this.tenantId,
      name: 'waha.events',
      type: VaatiExchangeType.TOPIC,
      durable: true,
    });

    // 2. Declare waha.commands exchange
    await this.exchangeRepo.declare({
      id: 'ex_waha_commands',
      tenantId: this.tenantId,
      name: 'waha.commands',
      type: VaatiExchangeType.TOPIC,
      durable: true,
    });

    // 3. Declare waha.outbound queue
    await this.queueRepo.declare({
      id: 'q_waha_outbound',
      tenantId: this.tenantId,
      name: 'waha.outbound',
      durable: true,
      priority: true,
      maxAttempts: 5,
    });

    // 4. Bind waha.outbound to waha.commands
    await this.bindingRepo.bind({
      id: 'bind_waha_outbound',
      tenantId: this.tenantId,
      exchangeName: 'waha.commands',
      queueName: 'waha.outbound',
      bindingKey: 'waha.send.#',
    });

    this.logger?.info('VAATI WhatsApp broker topology declared (waha.events, waha.commands, waha.outbound)');
  }

  private registerOutboundWorker(): void {
    this.workerCoordinator.registerInternalHandler('wahaOutboundHandler', async (msg) => {
      return await this.handleOutboundMessage(msg.payload);
    });

    this.workerCoordinator.subscribe(this.tenantId, 'waha.outbound', {
      internalHandlerName: 'wahaOutboundHandler',
      concurrency: 20,
    }).catch((err) => {
      this.logger?.warn({ err: err.message }, 'Could not automatically subscribe waha.outbound to coordinator');
    });
  }

  async handleOutboundMessage(payload: any): Promise<any> {
    const sessionName = payload.session ?? 'default';
    const chatId = payload.chatId;

    if (!chatId) {
      throw new Error('Missing chatId in outbound WhatsApp command payload');
    }

    if (!this.sessionManager) {
      throw new Error('SessionManager is not available in current runtime');
    }

    const isRunning = this.sessionManager.isRunning(sessionName);
    if (!isRunning) {
      throw new Error(`WhatsApp session '${sessionName}' is not running; requeuing command`);
    }

    const session = this.sessionManager.getSession(sessionName);

    // 1. Poll Message
    if (payload.poll) {
      const pollRes = await session.sendPoll({
        chatId: chatId,
        poll: payload.poll,
      } as any);
      this.outboundCommandsCount++;
      return pollRes;
    }

    // 2. File Message
    if (payload.file) {
      const fileRes = await session.sendFile({
        chatId: chatId,
        file: payload.file,
      } as any);
      this.outboundCommandsCount++;
      return fileRes;
    }

    // 3. Mark as Seen
    if (payload.seen) {
      const seenRes = await session.sendSeen({ chatId: chatId } as any);
      this.outboundCommandsCount++;
      return seenRes;
    }

    // 4. Standard Text Message (with optional link preview)
    const textRes = await session.sendText({
      chatId: chatId,
      text: payload.text ?? '',
      linkPreview: payload.linkPreview ?? true,
    } as any);

    this.outboundCommandsCount++;
    return textRes;
  }

  async publishInboundEvent(session: string, event: string, payload: any): Promise<any> {
    const routingKey = `waha.event.${session}.${event}`;
    const pubAuth: VaatiAuthContext = {
      tenantId: this.tenantId,
      actorId: 'waha_bridge_system',
      actorRole: VaatiRole.ADMIN,
      apiKeyId: null,
      allowedExchanges: ['*'],
      allowedQueues: ['*'],
    };

    const result = await this.publisherService.publish(
      {
        exchange: 'waha.events',
        routingKey: routingKey,
        tenantId: this.tenantId,
        headers: {
          'x-waha-session': session,
          'x-waha-event': event,
        },
        payload: payload,
      },
      pubAuth,
    );

    this.inboundEventsCount++;
    return result;
  }

  async dispatchOutboundCommand(dto: WahaSendCommandDto, auth: VaatiAuthContext): Promise<any> {
    const session = dto.session ?? 'default';
    const messageType = dto.poll ? 'poll' : dto.file ? 'file' : dto.seen ? 'seen' : 'text';
    const routingKey = `waha.send.${session}.${messageType}`;

    return await this.publisherService.publish(
      {
        exchange: 'waha.commands',
        routingKey: routingKey,
        tenantId: auth.tenantId,
        headers: {
          'x-waha-target-session': session,
          'x-waha-message-type': messageType,
        },
        payload: {
          session: session,
          chatId: dto.chatId,
          text: dto.text,
          linkPreview: dto.linkPreview ?? true,
          poll: dto.poll,
          file: dto.file,
          seen: dto.seen,
        },
      },
      auth,
    );
  }

  getMetrics() {
    return {
      inboundEventsForwarded: this.inboundEventsCount,
      outboundCommandsProcessed: this.outboundCommandsCount,
      topology: {
        eventsExchange: 'waha.events',
        commandsExchange: 'waha.commands',
        outboundQueue: 'waha.outbound',
      },
    };
  }
}
