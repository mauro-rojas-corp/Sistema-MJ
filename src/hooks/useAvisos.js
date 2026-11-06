import { useCallback, useEffect, useRef, useState } from 'react';
import { api, onPrivateDataCleared } from '../api';

// Cada cuánto se consulta el buzón mientras la app está visible.
const POLL_MS = 60_000;
const EMPTY = { key: null, avisos: [], noLeidos: 0, loaded: false, error: '' };

// Avisos del Buzón del usuario logueado. Se cargan al entrar, cada minuto
// mientras la pestaña está visible y al volver a ella. Marcar como leído se
// pinta al instante y se confirma en segundo plano.
//
// `sessionKey` identifica la sesión (usuario + token): lo cargado para otra
// sesión nunca se muestra, aunque todavía esté en el estado.
export default function useAvisos(enabled, sessionKey) {
  const [state, setState] = useState(EMPTY);
  const loadingRef = useRef(false);
  const generationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || loadingRef.current) return;
    loadingRef.current = true;
    const generation = generationRef.current;
    try {
      const data = await api.avisos.listar();
      if (generation !== generationRef.current) return;
      setState({ key: sessionKey, avisos: data.avisos, noLeidos: data.noLeidos, loaded: true, error: '' });
    } catch (err) {
      if (generation !== generationRef.current) return;
      setState((prev) => ({
        ...(prev.key === sessionKey ? prev : EMPTY),
        key: sessionKey,
        loaded: true,
        error: err?.message || 'No se pudo cargar el buzón',
      }));
    } finally {
      if (generation === generationRef.current) loadingRef.current = false;
    }
  }, [enabled, sessionKey]);

  // Al cambiar de usuario o sesión se descartan las respuestas en vuelo
  // (otra generación) y se vuelve a pedir.
  useEffect(() => {
    generationRef.current += 1;
    loadingRef.current = false;
    if (!enabled) return undefined;

    // Primera carga apenas termina el render (la respuesta llega asíncrona).
    const first = setTimeout(refresh, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [enabled, refresh]);

  useEffect(
    () =>
      onPrivateDataCleared(() => {
        generationRef.current += 1;
        loadingRef.current = false;
        setState(EMPTY);
      }),
    []
  );

  const marcarLeidos = useCallback(
    (ids) => {
      if (!ids.length) return Promise.resolve();
      const pendientes = new Set(ids);
      setState((prev) => {
        const avisos = prev.avisos.map((a) => (pendientes.has(a.id) && !a.leido ? { ...a, leido: true } : a));
        return { ...prev, avisos, noLeidos: avisos.filter((a) => !a.leido).length };
      });
      return api.avisos.marcarLeidos(ids).catch(() => refresh());
    },
    [refresh]
  );

  const marcarTodosLeidos = useCallback(() => {
    setState((prev) => ({
      ...prev,
      avisos: prev.avisos.map((a) => (a.leido ? a : { ...a, leido: true })),
      noLeidos: 0,
    }));
    return api.avisos.marcarTodosLeidos().catch(() => refresh());
  }, [refresh]);

  const vigente = enabled && state.key === sessionKey ? state : EMPTY;
  return {
    avisos: vigente.avisos,
    noLeidos: vigente.noLeidos,
    loaded: vigente.loaded,
    error: vigente.error,
    refresh,
    marcarLeidos,
    marcarTodosLeidos,
  };
}
