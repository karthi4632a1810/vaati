/**
 * AMQP 0-9-1 Topic Matching Engine
 *
 * Rules:
 * - Routing key consists of words delimited by dots ('.')
 * - Binding pattern consists of words delimited by dots ('.')
 * - '*' matches exactly one word
 * - '#' matches zero or more words
 */
export function matchTopic(pattern: string, routingKey: string): boolean {
  if (pattern === '#' || pattern === '') {
    return true;
  }
  if (pattern === routingKey) {
    return true;
  }

  const patternTokens = pattern.split('.');
  const keyTokens = routingKey.split('.');

  const memo = new Map<string, boolean>();

  function match(pIdx: number, kIdx: number): boolean {
    const memoKey = `${pIdx}:${kIdx}`;
    if (memo.has(memoKey)) {
      return memo.get(memoKey)!;
    }

    if (pIdx === patternTokens.length && kIdx === keyTokens.length) {
      memo.set(memoKey, true);
      return true;
    }

    if (pIdx === patternTokens.length) {
      memo.set(memoKey, false);
      return false;
    }

    const pToken = patternTokens[pIdx];

    if (pToken === '#') {
      // '#' can match 0 tokens from key (advance pattern)
      if (match(pIdx + 1, kIdx)) {
        memo.set(memoKey, true);
        return true;
      }
      // '#' can match 1 or more tokens from key (advance key if available)
      if (kIdx < keyTokens.length && match(pIdx, kIdx + 1)) {
        memo.set(memoKey, true);
        return true;
      }
      memo.set(memoKey, false);
      return false;
    }

    if (kIdx < keyTokens.length && (pToken === '*' || pToken === keyTokens[kIdx])) {
      const result = match(pIdx + 1, kIdx + 1);
      memo.set(memoKey, result);
      return result;
    }

    memo.set(memoKey, false);
    return false;
  }

  return match(0, 0);
}
