import { SessionPlugin } from '@waha/core/abc/session.plugin';
import { WAHAEvents } from '@waha/structures/enums.dto';

export interface VaatiBridgePluginDeps {
  bridgeService: {
    publishInboundEvent(session: string, event: string, payload: any): Promise<any>;
  };
}

export class VaatiWahaBridgePlugin extends SessionPlugin<null, VaatiBridgePluginDeps> {
  private readonly eventsToBridge: WAHAEvents[] = [
    WAHAEvents.MESSAGE,
    WAHAEvents.MESSAGE_ACK,
    WAHAEvents.MESSAGE_REACTION,
    WAHAEvents.MESSAGE_REVOKED,
    WAHAEvents.SESSION_STATUS,
  ];

  attach(): void {
    const sessionName = this.session.name;
    this.logger.info({ session: sessionName }, 'Attaching VAATI WhatsApp broker bridge to session');

    for (const event of this.eventsToBridge) {
      try {
        const obs$ = this.session.getEventObservable(event);
        if (obs$) {
          obs$.subscribe((payload) => {
            setImmediate(() => {
              this.deps.bridgeService
                .publishInboundEvent(sessionName, event, payload)
                .catch((err) => {
                  this.logger.warn(
                    { session: sessionName, event: event, err: err.message },
                    'Failed to forward WhatsApp event to VAATI exchange',
                  );
                });
            });
          });
        }
      } catch (err: any) {
        this.logger.warn({ event: event, err: err.message }, 'Failed to subscribe to event on session');
      }
    }
  }
}
