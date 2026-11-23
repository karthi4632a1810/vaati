import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
}

@Injectable()
export class VaatiCircuitBreakerService {
  private circuits = new Map<
    string,
    {
      state: CircuitState;
      failureCount: number;
      lastFailureTime: number;
      nextAttemptTime: number;
    }
  >();

  constructor(
    @InjectPinoLogger('VaatiCircuitBreakerService') private readonly logger: PinoLogger,
  ) {}

  canExecute(targetKey: string, options?: CircuitOptions): boolean {
    const circuit = this.circuits.get(targetKey);
    if (!circuit) {
      return true;
    }

    const resetTimeout = options?.resetTimeoutMs ?? 30000;
    const now = Date.now();

    if (circuit.state === CircuitState.OPEN) {
      if (now >= circuit.nextAttemptTime) {
        circuit.state = CircuitState.HALF_OPEN;
        this.logger.info({ target: targetKey }, 'Circuit transitioned to HALF_OPEN (probing)');
        return true;
      }
      return false;
    }

    return true;
  }

  recordSuccess(targetKey: string): void {
    const circuit = this.circuits.get(targetKey);
    if (circuit) {
      if (circuit.state === CircuitState.HALF_OPEN || circuit.state === CircuitState.OPEN) {
        this.logger.info({ target: targetKey }, 'Circuit closed successfully following recovery');
      }
      this.circuits.delete(targetKey);
    }
  }

  recordFailure(targetKey: string, options?: CircuitOptions): void {
    const failureThreshold = options?.failureThreshold ?? 5;
    const resetTimeout = options?.resetTimeoutMs ?? 30000;
    const now = Date.now();

    let circuit = this.circuits.get(targetKey);
    if (!circuit) {
      circuit = {
        state: CircuitState.CLOSED,
        failureCount: 1,
        lastFailureTime: now,
        nextAttemptTime: 0,
      };
      this.circuits.set(targetKey, circuit);
    } else {
      circuit.failureCount += 1;
      circuit.lastFailureTime = now;
    }

    if (circuit.failureCount >= failureThreshold) {
      circuit.state = CircuitState.OPEN;
      circuit.nextAttemptTime = now + resetTimeout;
      this.logger.warn(
        { target: targetKey, failureCount: circuit.failureCount, resetInMs: resetTimeout },
        'Circuit tripped to OPEN; downstream requests will be throttled/isolated',
      );
    }
  }

  getState(targetKey: string): CircuitState {
    const circuit = this.circuits.get(targetKey);
    if (!circuit) {
      return CircuitState.CLOSED;
    }
    if (circuit.state === CircuitState.OPEN && Date.now() >= circuit.nextAttemptTime) {
      return CircuitState.HALF_OPEN;
    }
    return circuit.state;
  }
}
