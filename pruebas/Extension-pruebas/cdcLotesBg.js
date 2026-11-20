// ============================================================================
// LOTES CDC — lado service worker.
// ----------------------------------------------------------------------------
// Guarda localmente los lotes creados desde el recolector de Marangatu y los
// entrega a Control Clientes cuando la app los pide. La extensión NO habla
// directo con Apps Script: Control Clientes registra el lote en el backend y
// después confirma acá la sincronización. Así no se duplica el token del
// backend dentro de la extensión.
//
// Flujo:
//   recolector (content script) --CDC_CREAR_LOTE--> este módulo (storage.local)
//   Control Clientes --APP_CDC_LOTES_PENDIENTES--> recibe los lotes
//   Control Clientes --APP_CDC_LOTE_CONFIRMADO--> se marcan sincronizados
// ============================================================================

const CDC_LOTES_KEY = 'cdcLotesPendientesV1';
const CDC_LOTES_SYNC_KEY = 'cdcLotesSincronizadosV1';
const CDC_MAX_POR_LOTE = 1000;
const CDC_MAX_LOTES_PENDIENTES = 50;

function cdcNormalizarLista(lista) {
  if (!Array.isArray(lista)) return null;
  const vistos = new Set();
  const salida = [];
  for (const valor of lista) {
    const cdc = String(valor || '').replace(/\D/g, '');
    if (!/^\d{44}$/.test(cdc)) return null;
    if (!vistos.has(cdc)) { vistos.add(cdc); salida.push(cdc); }
  }
  return salida.length && salida.length <= CDC_MAX_POR_LOTE ? salida : null;
}

async function cdcLeerPendientes() {
  const d = await chrome.storage.local.get(CDC_LOTES_KEY);
  return Array.isArray(d[CDC_LOTES_KEY]) ? d[CDC_LOTES_KEY] : [];
}

async function cdcGuardarPendientes(lotes) {
  await chrome.storage.local.set({ [CDC_LOTES_KEY]: lotes });
}

async function cdcCrearLoteLocal(msg, sender) {
  const cdcs = cdcNormalizarLista(msg.cdcs);
  const fuente = ['FUENTE_REGISTRO_VIRTUAL', 'FUENTE_CONSULTA_REGISTRADOS'].includes(msg.fuente)
    ? msg.fuente
    : null;
  if (!cdcs || !fuente) return { ok: false, error: 'Datos del lote inválidos.' };

  const pendientes = await cdcLeerPendientes();
  if (pendientes.length >= CDC_MAX_LOTES_PENDIENTES) {
    return { ok: false, error: 'Hay demasiados lotes sin sincronizar. Abrí Control Clientes para registrarlos.' };
  }

  const lote = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    creadoEn: new Date().toISOString(),
    fuente,
    cdcs,
    total: cdcs.length,
    estado: 'pendiente_sincronizar',
    // Solo la ruta, nunca la URL completa ni el token _cyp.
    pagina: (() => { try { return new URL(sender.tab.url).pathname; } catch { return ''; } })(),
  };
  pendientes.push(lote);
  await cdcGuardarPendientes(pendientes);
  return { ok: true, loteId: lote.id, total: lote.total, estado: lote.estado };
}

async function cdcConfirmarSincronizado(msg) {
  const localId = String(msg.localId || '');
  const loteServidorId = String(msg.loteServidorId || '');
  if (!localId || !loteServidorId) return { ok: false, error: 'Confirmación inválida.' };

  const pendientes = await cdcLeerPendientes();
  const indice = pendientes.findIndex((l) => l.id === localId);
  if (indice === -1) return { ok: true, yaConfirmado: true };

  const [lote] = pendientes.splice(indice, 1);
  await cdcGuardarPendientes(pendientes);

  const d = await chrome.storage.local.get(CDC_LOTES_SYNC_KEY);
  const sincronizados = Array.isArray(d[CDC_LOTES_SYNC_KEY]) ? d[CDC_LOTES_SYNC_KEY] : [];
  sincronizados.unshift({
    localId: lote.id,
    loteServidorId,
    sincronizadoEn: new Date().toISOString(),
    total: lote.total,
    fuente: lote.fuente,
  });
  await chrome.storage.local.set({ [CDC_LOTES_SYNC_KEY]: sincronizados.slice(0, 20) });
  return { ok: true };
}

// Mensajes internos: solo el recolector, desde una pestaña de Marangatu.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.action !== 'CDC_CREAR_LOTE') return false;
  if (!sender.tab || !/^https:\/\/marangatu\.set\.gov\.py\//.test(sender.tab.url || '')) {
    sendResponse({ ok: false, error: 'Origen no autorizado.' });
    return false;
  }
  cdcCrearLoteLocal(msg, sender).then(sendResponse).catch(() => sendResponse({ ok: false, error: 'No se pudo guardar el lote.' }));
  return true;
});

// Mensajes de Control Clientes. Mismo control de origen que el resto del puente.
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!msg || !['APP_CDC_LOTES_PENDIENTES', 'APP_CDC_LOTE_CONFIRMADO'].includes(msg.action)) return false;

  const origen = getVerifiedSenderOrigin(sender);
  if (!origen || !ALLOWED_APP_ORIGINS.has(origen)) {
    sendResponse({ ok: false, error: 'origen no autorizado' });
    return false;
  }

  if (msg.action === 'APP_CDC_LOTES_PENDIENTES') {
    cdcLeerPendientes()
      .then((lotes) => sendResponse({ ok: true, lotes }))
      .catch(() => sendResponse({ ok: false, error: 'No se pudieron leer los lotes.' }));
    return true;
  }

  cdcConfirmarSincronizado(msg)
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, error: 'No se pudo confirmar el lote.' }));
  return true;
});
