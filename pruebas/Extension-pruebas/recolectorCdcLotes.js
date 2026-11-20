// ============================================================================
// RECOLECTOR CDC — SERVICIO DE LOTES (puente UI ↔ service worker)
// ----------------------------------------------------------------------------
// La UI no conoce el protocolo interno de la extensión: solo llama a
// EkuCdcLotes.crear({ fuente, cdcs }) y recibe { ok, loteId, total, error? }.
// Acá se valida la entrada con el núcleo y se manda el mensaje al service
// worker (cdcLotesBg.js), que guarda el lote hasta que Control Clientes lo
// registra en el backend.
// ============================================================================
(() => {
  'use strict';
  const Core = globalThis.EkuCdcCore;
  if (!Core || globalThis.EkuCdcLotes) return;

  async function crear({ fuente, cdcs }) {
    const lista = (cdcs || []).filter((c) => Core.esCdcValido(c));
    if (!lista.length) return { ok: false, error: 'No hay CDCs marcados.' };
    if (!fuente) return { ok: false, error: 'No se reconoció la página de origen.' };

    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'CDC_CREAR_LOTE',
        fuente,
        cdcs: [...new Set(lista)],
      });
      return resp || { ok: false, error: 'La extensión no respondió.' };
    } catch {
      return { ok: false, error: 'No se pudo hablar con la extensión. Recargala en chrome://extensions.' };
    }
  }

  globalThis.EkuCdcLotes = { crear };
})();
