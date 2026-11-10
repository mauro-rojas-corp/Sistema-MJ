import { useCallback, useEffect, useRef, useState } from 'react';
import { api, onPrivateDataCleared } from '../api';

// Los administradores ven en el ícono cuántas sugerencias nuevas hay: se
// consulta cada 2 minutos mientras la pestaña está visible.
const POLL_MS = 120_000;
const EMPTY = { key: null, sugerencias: [], nuevas: 0, admin: false, loaded: false, error: '' };

// Sugerencias para mejorar el sistema. `sessionKey` identifica la sesión
// (usuario + token): lo cargado para otra sesión nunca se muestra.
export default function useSugerencias(enabled, sessionKey, isAdmin) {
  const [state, setState] = useState(EMPTY);
  const generationRef = useRef(0);
  const loadingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || loadingRef.current) return;
    loadingRef.current = true;
    const generation = generationRef.current;
    try {
      const data = await api.sugerencias.listar();
      if (generation !== generationRef.current) return;
      setState({ key: sessionKey, ...data, loaded: true, error: '' });
    } catch (err) {
      if (generation !== generationRef.current) return;
      setState((prev) => ({
        ...(prev.key === sessionKey ? prev : EMPTY),
        key: sessionKey,
        loaded: true,
        error: err?.message || 'No se pudieron cargar las sugerencias',
      }));
    } finally {
      if (generation === generationRef.current) loadingRef.current = false;
    }
  }, [enabled, sessionKey]);

  useEffect(() => {
    generationRef.current += 1;
    loadingRef.current = false;
    if (!enabled) return undefined;
    const first = setTimeout(refresh, 0);
    if (!isAdmin) return () => clearTimeout(first);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [enabled, isAdmin, refresh]);

  useEffect(
    () =>
      onPrivateDataCleared(() => {
        generationRef.current += 1;
        loadingRef.current = false;
        setState(EMPTY);
      }),
    []
  );

  const crear = useCallback(
    async (sugerencia) => {
      const res = await api.sugerencias.crear(sugerencia);
      refresh();
      return res;
    },
    [refresh]
  );

  // El cambio se pinta al instante y se confirma en segundo plano; si falla,
  // se vuelve a cargar la lista del servidor.
  const cambiarEstado = useCallback(
    (ids, estado) => {
      if (!ids.length) return Promise.resolve();
      const set = new Set(ids);
      setState((prev) => {
        const sugerencias = prev.sugerencias.map((s) => {
          if (!set.has(s.id) || s.estado === estado) return s;
          if (estado === 'vista' && s.estado === 'resuelta') return s;
          const revisadaPor = estado === 'nueva' ? '' : String(sessionKey || '').split('|')[0];
          return { ...s, estado, revisadaPor, revisadaEl: estado === 'nueva' ? '' : new Date().toISOString() };
        });
        return { ...prev, sugerencias, nuevas: sugerencias.filter((s) => s.estado === 'nueva').length };
      });
      return api.sugerencias.cambiarEstado(ids, estado).catch((err) => {
        refresh();
        throw err;
      });
    },
    [refresh, sessionKey]
  );

  const visible = state.key === sessionKey ? state : EMPTY;
  return { ...visible, refresh, crear, cambiarEstado };
}
