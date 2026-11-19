import { PUBLIC_CONTACT_URL as RAW_CONTACT_URL } from '$app/env/public';

export const CONTACT_URL = RAW_CONTACT_URL?.trim() || 'https://github.com/waypoint-app/waypoint';
export const USER_AGENT = `Waypoint/0.1 (+${CONTACT_URL})`;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** fetch() with a hard timeout. */
export async function fetchTimeout(url: string, options: RequestInit = {}, timeoutMs = 9000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

const cache = new Map<string, { expires: number; value: unknown }>();

/** Simple in-memory TTL cache (per serverless instance). */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fn();
  cache.set(key, { expires: Date.now() + ttlMs, value });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
  }
  return value;
}

/** Required upstream headers (Transitous usage policy). */
export const TRANSITOUS_HEADERS = {
  'User-Agent': USER_AGENT,
  Referer: CONTACT_URL
};

export const TRANSITOUS_BASE = 'https://api.transitous.org/api';
