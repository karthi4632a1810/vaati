import { AsyncLocalStorage } from 'node:async_hooks';
import { VaatiAuthContext } from '@waha/vaati/types/vaati.types';

const tenantStorage = new AsyncLocalStorage<VaatiAuthContext>();

export function setVaatiContext<T>(context: VaatiAuthContext, callback: () => T): T {
  return tenantStorage.run(context, callback);
}

export function getVaatiContext(): VaatiAuthContext | undefined {
  return tenantStorage.getStore();
}

export function requireVaatiContext(): VaatiAuthContext {
  const ctx = getVaatiContext();
  if (!ctx) {
    throw new Error('No active VAATI tenant context found for the current operation');
  }
  return ctx;
}
