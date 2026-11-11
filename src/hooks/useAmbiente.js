import { useCallback, useEffect, useRef, useState } from 'react';
import { api, onPrivateDataCleared } from '../api';
import { AMBIENTE_NINGUNA, IDS_VALIDOS } from '../ambiente/ambientes';

// Ambientación por época elegida por el usuario. Se guarda en su usuario
// (hoja Preferencias), así lo sigue en cualquier dispositivo. Una copia en
// este navegador sólo sirve para pintarla al instante mientras llega la
// del servidor.

const DEFAULT = { ambientacion: AMBIENTE_NINGUNA, animacion: true };
const cacheKey = (user) => `ctc:ambiente:v1:${user || ''}`;

function leerCache(user) {
  try {
    const raw = localStorage.getItem(cacheKey(user));
    const data = raw ? JSON.parse(raw) : null;
    if (data && IDS_VALIDOS.includes(data.ambientacion)) {
      return { ambientacion: data.ambientacion, animacion: data.animacion !== false };
    }
  } catch {
    /* sin almacenamiento */
  }
  return null;
}

function escribirCache(user, prefs) {
  try {
    localStorage.setItem(cacheKey(user), JSON.stringify(prefs));
  } catch {
    /* sin almacenamiento: se vuelve a pedir al servidor */
  }
}

export default function useAmbiente(enabled, user, sessionKey) {
  const [state, setState] = useState(() => ({
    key: sessionKey,
    ...(leerCache(user) || DEFAULT),
    loaded: false,
  }));
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    if (!enabled) return undefined;
    const generation = generationRef.current;
    let cancelado = false;
    const t = setTimeout(() => {
      // Lo de este navegador primero (sin parpadeo), después el servidor.
      const cache = leerCache(user);
      setState((prev) => (prev.key === sessionKey ? prev : { key: sessionKey, ...(cache || DEFAULT), loaded: false }));
      api.preferencias
        .obtener()
        .then((prefs) => {
          if (cancelado || generation !== generationRef.current) return;
          escribirCache(user, prefs);
          setState({ key: sessionKey, ...prefs, loaded: true });
        })
        .catch(() => {
          // Sin backend actualizado o sin conexión: queda lo de la copia local.
          if (cancelado || generation !== generationRef.current) return;
          setState((prev) => ({ ...prev, key: sessionKey, loaded: true }));
        });
    }, 0);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [enabled, user, sessionKey]);

  useEffect(
    () =>
      onPrivateDataCleared(() => {
        generationRef.current += 1;
        setState({ key: null, ...DEFAULT, loaded: false });
      }),
    []
  );

  // Se aplica al instante; si el servidor no lo guarda, vuelve atrás.
  const guardar = useCallback(
    async (cambios) => {
      let anterior = null;
      setState((prev) => {
        anterior = prev;
        return { ...prev, ...cambios };
      });
      try {
        const res = await api.preferencias.guardar(cambios);
        const prefs = { ambientacion: res.ambientacion, animacion: res.animacion !== false };
        escribirCache(user, prefs);
        setState((prev) => ({ ...prev, ...prefs }));
      } catch (err) {
        if (anterior) setState(anterior);
        throw err;
      }
    },
    [user]
  );

  const visible = enabled && state.key === sessionKey ? state : { ...DEFAULT, loaded: false };
  return { ambientacion: visible.ambientacion, animacion: visible.animacion, loaded: visible.loaded, guardar };
}
