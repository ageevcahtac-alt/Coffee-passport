'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Client-side reader for the cabinet's own API routes (app/api/cafe/**,
// app/api/roaster/**). Keeps the four states the cabinets must show apart:
// loading, loaded, permission denied (401/403), and "XO COFFEE Admin
// unavailable" (503) vs. any other error. `reload()` re-reads the
// authoritative state — called after every mutation and on "Обновить".

export type ApiErrorKind = 'unauthenticated' | 'forbidden' | 'unavailable' | 'not_found' | 'error';

export interface ApiError {
  kind: ApiErrorKind;
  message: string;
  code: string | null;
  status: number;
}

export type ApiState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: ApiError };

export function toApiError(status: number, body: unknown): ApiError {
  const payload = (body ?? {}) as { error?: unknown; code?: unknown };
  const message = typeof payload.error === 'string' ? payload.error : 'Не удалось загрузить данные.';
  const code = typeof payload.code === 'string' ? payload.code : null;
  if (status === 401) return { kind: 'unauthenticated', message: 'Сессия истекла — войдите снова.', code, status };
  if (status === 403) return { kind: 'forbidden', message, code, status };
  if (status === 404) return { kind: 'not_found', message, code, status };
  if (status === 503 || code === 'admin_unavailable') return { kind: 'unavailable', message, code, status };
  return { kind: 'error', message, code, status };
}

/** POST JSON to one of our routes; returns data or an ApiError (network failure -> 'unavailable'). */
export async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return {
      ok: false,
      error: { kind: 'unavailable', message: 'Нет связи с сервером. Проверьте соединение и повторите.', code: null, status: 0 },
    };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: toApiError(response.status, payload) };
  return { ok: true, data: (payload as { data: T }).data };
}

export function useStaffApi<T>(url: string | null): ApiState<T> & { reload: () => Promise<void>; refreshing: boolean } {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading', data: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const id = ++requestId.current;
    setRefreshing(true);
    try {
      const response = await fetch(url, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (id !== requestId.current) return; // a newer reload superseded this one
      if (!response.ok) {
        setState({ status: 'error', data: null, error: toApiError(response.status, payload) });
      } else {
        setState({ status: 'ready', data: (payload as { data: T }).data, error: null });
      }
    } catch {
      if (id !== requestId.current) return;
      setState({
        status: 'error',
        data: null,
        error: { kind: 'unavailable', message: 'Нет связи с сервером. Проверьте соединение.', code: null, status: 0 },
      });
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load, refreshing };
}
