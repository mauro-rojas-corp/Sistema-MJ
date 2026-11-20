// Compara la liquidación de IVA ya guardada de un cliente y mes con la que
// saldría del registro de comprobantes, y la actualiza sólo si el usuario lo
// acepta. Se usa después de subir documentos o libros.

import { api } from '../api';
import { aListasIva } from '../comprobantes/comprobantesCore.js';
import { LISTS, calc, cleanDraft, getItems, normDraft, resumenHoja } from './ivaCore.js';
import { getIvaConfig } from './ivaConfigCache';

const firmaListas = (d) => JSON.stringify(LISTS.map((L) => getItems(d, L.k)
  .filter((x) => Number(x.m) > 0)
  .map((x) => [Math.round(Number(x.m)), !!x.iva])
  .sort((a, b) => a[0] - b[0] || Number(a[1]) - Number(b[1]))));

// cliente = { ruc, dv, nombre }. Devuelve null si no hay IVA guardado para
// ese mes (no hay nada que avisar) o { cambia, antes, despues, estado, aplicar }.
export async function compararIva(cliente, periodo) {
  const [doc, registro, config] = await Promise.all([
    api.iva.getDoc(periodo, cliente.ruc),
    api.comprobantes.leer(cliente.ruc, periodo),
    getIvaConfig(),
  ]);
  if (!doc) return null;
  const { listas, usados } = aListasIva((registro && registro.comprobantes) || []);
  const actual = normDraft({ ...doc });
  const nuevo = normDraft({ ...doc });
  LISTS.forEach((L) => { nuevo[L.k] = listas[L.k] || []; });
  normDraft(nuevo);
  const ctx = { config: config || {}, cliente, periodo };
  const antes = calc(actual, ctx);
  const despues = calc(nuevo, ctx);
  const cambia = firmaListas(actual) !== firmaListas(nuevo);
  return {
    cambia,
    estado: actual.estado || 'pend',
    manual: !!actual.manual,
    comprobantes: usados.length,
    antes,
    despues,
    aplicar: async () => {
      const data = { ...cleanDraft(nuevo), clienteId: cliente.ruc, periodo, actualizado: Date.now() };
      await api.iva.saveDoc(periodo, cliente.ruc, data, resumenHoja(ctx, nuevo));
      // Para que Vencimientos IVA recargue si está abierto.
      try { window.dispatchEvent(new CustomEvent('ctc:iva-actualizado', { detail: { ruc: cliente.ruc, periodo } })); } catch { /* opcional */ }
    },
  };
}
