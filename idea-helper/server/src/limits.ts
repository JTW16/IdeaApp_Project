// 기기별 호출 횟수 제한 (메모리 기반 고정 창). 서버를 여러 대로 늘리면 DB나 Redis로 옮겨야 한다.
export class RateLimiter {
  private hits = new Map<string, { start: number; count: number }>();

  /** 허용되면 true. key마다 windowMs 동안 max번까지. */
  take(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || now - h.start >= windowMs) {
      this.hits.set(key, { start: now, count: 1 });
      if (this.hits.size > 50_000) this.sweep(now, windowMs);
      return true;
    }
    if (h.count >= max) return false;
    h.count++;
    return true;
  }

  private sweep(now: number, windowMs: number) {
    for (const [k, v] of this.hits) if (now - v.start >= windowMs) this.hits.delete(k);
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
