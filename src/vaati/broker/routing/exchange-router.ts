import { Injectable, NotFoundException } from '@nestjs/common';
import { matchTopic } from '@waha/vaati/broker/routing/topic-matcher';
import { BindingRepository } from '@waha/vaati/repositories/binding.repository';
import { ExchangeRepository } from '@waha/vaati/repositories/exchange.repository';
import { VaatiBinding, VaatiExchangeType } from '@waha/vaati/types/vaati.types';

@Injectable()
export class ExchangeRouterService {
  constructor(
    private readonly exchangeRepo: ExchangeRepository,
    private readonly bindingRepo: BindingRepository,
  ) {}

  async routeMessage(
    tenantId: string,
    exchangeName: string,
    routingKey: string,
    headers: Record<string, any> = {},
  ): Promise<string[]> {
    const exchange = await this.exchangeRepo.findByName(tenantId, exchangeName);
    if (!exchange) {
      throw new NotFoundException(`Exchange ${exchangeName} does not exist for tenant ${tenantId}`);
    }

    const bindings = await this.bindingRepo.findByExchange(tenantId, exchangeName);
    if (!bindings || bindings.length === 0) {
      return [];
    }

    const matchedQueues = new Set<string>();

    for (const binding of bindings) {
      if (this.isBindingMatched(exchange.type, binding, routingKey, headers)) {
        matchedQueues.add(binding.queueName);
      }
    }

    return Array.from(matchedQueues);
  }

  private isBindingMatched(
    exchangeType: VaatiExchangeType,
    binding: VaatiBinding,
    routingKey: string,
    headers: Record<string, any>,
  ): boolean {
    switch (exchangeType) {
      case VaatiExchangeType.DIRECT:
        return binding.bindingKey === routingKey;

      case VaatiExchangeType.TOPIC:
        return matchTopic(binding.bindingKey, routingKey);

      case VaatiExchangeType.FANOUT:
        return true;

      case VaatiExchangeType.HEADERS:
        return this.matchHeaders(binding.headerRules, headers);

      default:
        return false;
    }
  }

  private matchHeaders(
    rules: Record<string, any> | null,
    messageHeaders: Record<string, any>,
  ): boolean {
    if (!rules || Object.keys(rules).length === 0) {
      return true;
    }

    const matchType = rules['x-match'] === 'any' ? 'any' : 'all';
    const ruleKeys = Object.keys(rules).filter((k) => k !== 'x-match');

    if (ruleKeys.length === 0) {
      return true;
    }

    if (matchType === 'all') {
      for (const key of ruleKeys) {
        const expectedVal = rules[key];
        const actualVal = messageHeaders[key];
        if (expectedVal === '*' || expectedVal === '') {
          if (actualVal === undefined) return false;
        } else if (String(actualVal) !== String(expectedVal)) {
          return false;
        }
      }
      return true;
    } else {
      // 'any'
      for (const key of ruleKeys) {
        const expectedVal = rules[key];
        const actualVal = messageHeaders[key];
        if (expectedVal === '*' || expectedVal === '') {
          if (actualVal !== undefined) return true;
        } else if (String(actualVal) === String(expectedVal)) {
          return true;
        }
      }
      return false;
    }
  }
}
