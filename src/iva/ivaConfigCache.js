import { api, onPrivateDataCleared } from '../api';
import { normalizeConfig } from './ivaCore';

// Configuración del módulo Vencimientos IVA (colores por VENC., feriados)
// para usar fuera del módulo, por ejemplo en la ficha del cliente. Se pide
// una vez y se reutiliza unos minutos; si el backend no responde se usan los
// colores por defecto, que son los mismos del módulo.
const TTL_MS = 5 * 60_000;
let cache = null; // { at, promise }

export function getIvaConfig() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = api.iva
    .load([])
    .then((data) => normalizeConfig(data && data.config))
    .catch(() => {
      cache = null;
      return normalizeConfig(null);
    });
  cache = { at: Date.now(), promise };
  return promise;
}

onPrivateDataCleared(() => {
  cache = null;
});
