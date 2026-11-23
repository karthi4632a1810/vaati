import { CircuitState, VaatiCircuitBreakerService } from '@waha/vaati/workers/circuit-breaker.service';

describe('VaatiCircuitBreakerService', () => {
  let circuitBreaker: VaatiCircuitBreakerService;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    circuitBreaker = new VaatiCircuitBreakerService(mockLogger);
  });

  test('starts in CLOSED state and allows execution', () => {
    const target = 'https://api.external.hospital/webhook';
    expect(circuitBreaker.getState(target)).toBe(CircuitState.CLOSED);
    expect(circuitBreaker.canExecute(target)).toBe(true);
  });

  test('trips to OPEN state after reaching failure threshold', () => {
    const target = 'https://api.external.hospital/webhook';
    const opts = { failureThreshold: 3, resetTimeoutMs: 1000 };

    circuitBreaker.recordFailure(target, opts);
    circuitBreaker.recordFailure(target, opts);
    expect(circuitBreaker.canExecute(target, opts)).toBe(true);

    // 3rd failure trips circuit
    circuitBreaker.recordFailure(target, opts);
    expect(circuitBreaker.getState(target)).toBe(CircuitState.OPEN);
    expect(circuitBreaker.canExecute(target, opts)).toBe(false);
  });

  test('transitions to HALF_OPEN and resets to CLOSED upon success', async () => {
    const target = 'https://api.external.hospital/webhook';
    const opts = { failureThreshold: 2, resetTimeoutMs: 50 };

    circuitBreaker.recordFailure(target, opts);
    circuitBreaker.recordFailure(target, opts);
    expect(circuitBreaker.canExecute(target, opts)).toBe(false);

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(circuitBreaker.canExecute(target, opts)).toBe(true);
    expect(circuitBreaker.getState(target)).toBe(CircuitState.HALF_OPEN);

    // Record recovery success
    circuitBreaker.recordSuccess(target);
    expect(circuitBreaker.getState(target)).toBe(CircuitState.CLOSED);
  });
});
