/**
 * Módulo CDC Lotes (descarga de XML desde eKuatia).
 *
 * Instalación en el proyecto de Apps Script:
 *  1. Agregar este archivo como AppsScript-CdcLotes.gs.
 *  2. En doPost (Code), después de validar la sesión y antes del error de
 *     "Acción desconocida", enrutar con handleCdcAction(...) como los demás
 *     módulos (IVA / Marcaciones / Avisos).
 *     (En este repositorio, AppsScript-Avisos.gs ya deriva las acciones cdc*
 *     a handleCdcAction: con pegar el Avisos.gs actualizado alcanza.)
 *  3. Ejecutar UNA VEZ autorizarDriveCdc() desde el editor (permiso de Drive).
 *  4. Publicar una nueva versión del Web App.
 *
 * Guarda lotes e ítems en la planilla de administración (la misma de
 * Usuarios/Planillas), en hojas "CDC Lotes" y "CDC Items" que se crean
 * solas la primera vez. El CDC se escribe como TEXTO para preservar los
 * 44 dígitos y los ceros a la izquierda.
 *
 * Usa funciones que ya existen en Code.gs: getAdminSpreadsheet, jsonResponse
 * y errorResponse.
 */

const CDC_LOTES_SHEET_NAME = 'CDC Lotes';
const CDC_ITEMS_SHEET_NAME = 'CDC Items';
const CDC_MAX_POR_LOTE = 1000;

const CDC_LOTES_HEADERS = [
  'Lote ID', 'Lote Local ID', 'Creado En', 'Creado Por', 'Fuente',
  'Estado', 'Total', 'Observaciones', 'Actualizado En'
];
const CDC_ITEMS_HEADERS = [
  'Lote ID', 'CDC', 'Estado', 'Intentos', 'Error', 'XML Referencia', 'Actualizado En'
];
// La lista de lotes se cachea 60 s: abrir el panel dejaba de releer las
// dos hojas enteras en cada apertura. Todo cambio de estado invalida.
const CDC_LISTAR_CACHE_KEY = 'cdcListarLotesV1';

function cdcInvalidarListar() {
  try { CacheService.getScriptCache().remove(CDC_LISTAR_CACHE_KEY); } catch (e) { /* sin caché */ }
}

// Crear la hoja no es atómico: dos pedidos simultáneos pueden no verla y
// tratar de crearla a la vez. Por eso la creación va bajo LockService y se
// vuelve a buscar adentro del lock. Si el llamador ya tiene el lock
// (cdcCrearBajoLock = true), no se vuelve a tomar.
let cdcCrearBajoLock = false;

function ensureCdcSheet(name, headers) {
  const ss = getAdminSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (sheet) return cdcAsegurarHeaders(sheet, headers);

  if (cdcCrearBajoLock) return cdcInsertarHojaSeguro(ss, name, headers);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    sheet = ss.getSheetByName(name);
    if (!sheet) return cdcInsertarHojaSeguro(ss, name, headers);
    return cdcAsegurarHeaders(sheet, headers);
  } finally {
    lock.releaseLock();
  }
}

// Si entre la búsqueda y la creación otro pedido creó la hoja, insertSheet
// lanza "ya existe una hoja con ese nombre": se recupera buscándola de nuevo
// en vez de convertir eso en un error para el usuario.
function cdcInsertarHojaSeguro(ss, name, headers) {
  let sheet = null;
  try {
    sheet = ss.insertSheet(name);
  } catch (e) {
    sheet = ss.getSheetByName(name);
    if (!sheet) throw e;
    return cdcAsegurarHeaders(sheet, headers);
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function cdcAsegurarHeaders(sheet, headers) {
  const actuales = sheet.getRange(1, 1, 1, headers.length).getValues()[0].map(String);
  const ok = headers.every(function (h, i) { return actuales[i] === h; });
  if (!ok) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function cdcValidarLista(body) {
  if (!Array.isArray(body.cdcs) || !body.cdcs.length || body.cdcs.length > CDC_MAX_POR_LOTE) return null;
  const vistos = {};
  const salida = [];
  for (let i = 0; i < body.cdcs.length; i++) {
    const cdc = String(body.cdcs[i] || '').replace(/\D/g, '');
    if (!/^\d{44}$/.test(cdc)) return null;
    if (!vistos[cdc]) { vistos[cdc] = true; salida.push(cdc); }
  }
  return salida;
}

function cdcBuscarPorLocalId(lotesSheet, localId) {
  if (!localId || lotesSheet.getLastRow() < 2) return null;
  const filas = lotesSheet.getRange(2, 1, lotesSheet.getLastRow() - 1, CDC_LOTES_HEADERS.length).getValues();
  for (let i = 0; i < filas.length; i++) {
    if (String(filas[i][1]) === localId) {
      return {
        loteId: String(filas[i][0]),
        localId: String(filas[i][1]),
        creadoEn: filas[i][2] instanceof Date ? filas[i][2].toISOString() : String(filas[i][2]),
        fuente: String(filas[i][4]),
        estado: String(filas[i][5]),
        total: Number(filas[i][6]) || 0
      };
    }
  }
  return null;
}

function handleCdcCrearLote(body, sessionUser) {
  const cdcs = cdcValidarLista(body);
  if (!cdcs) throw new Error('La lista de CDCs es inválida (se esperaban hasta ' + CDC_MAX_POR_LOTE + ' códigos de 44 dígitos).');

  const fuente = ['FUENTE_REGISTRO_VIRTUAL', 'FUENTE_CONSULTA_REGISTRADOS'].indexOf(body.fuente) !== -1
    ? body.fuente
    : 'FUENTE_CONSULTA_REGISTRADOS';
  const localId = String(body.loteLocalId || '').slice(0, 80);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('No se pudo obtener el lock para crear el lote.');

  cdcCrearBajoLock = true;
  try {
    const lotesSheet = ensureCdcSheet(CDC_LOTES_SHEET_NAME, CDC_LOTES_HEADERS);
    const itemsSheet = ensureCdcSheet(CDC_ITEMS_SHEET_NAME, CDC_ITEMS_HEADERS);

    // Idempotencia: si la app reintenta la sincronización del mismo lote
    // local, se devuelve el ya creado en vez de duplicarlo.
    const existente = cdcBuscarPorLocalId(lotesSheet, localId);
    if (existente) return jsonResponse({ ok: true, duplicado: true, lote: existente });

    const ahora = new Date();
    const loteId = 'CDC-' + Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') +
      '-' + Utilities.getUuid().slice(0, 4).toUpperCase();

    lotesSheet.appendRow([
      loteId, localId, ahora, String(sessionUser || ''), fuente, 'en_cola', cdcs.length, ''
    ]);

    const filasItems = cdcs.map(function (cdc) {
      return [loteId, cdc, 'pendiente', 0, '', '', ahora];
    });
    const inicio = itemsSheet.getLastRow() + 1;
    itemsSheet.getRange(inicio, 1, filasItems.length, CDC_ITEMS_HEADERS.length).setValues(filasItems);
    // CDC como texto: sin esto, la planilla puede convertirlo a número.
    itemsSheet.getRange(inicio, 2, filasItems.length, 1).setNumberFormat('@');
    cdcInvalidarListar();

    return jsonResponse({
      ok: true,
      lote: {
        loteId: loteId,
        localId: localId,
        creadoEn: ahora.toISOString(),
        fuente: fuente,
        estado: 'en_cola',
        total: cdcs.length
      }
    });
  } finally {
    cdcCrearBajoLock = false;
    lock.releaseLock();
  }
}

function handleCdcListarLotes() {
  const cache = CacheService.getScriptCache();
  const enCache = cache.get(CDC_LISTAR_CACHE_KEY);
  if (enCache) return jsonResponse(JSON.parse(enCache));

  // Lectura sin ensure: en el camino de lectura no se crean hojas ni se
  // verifican encabezados (eso queda para las escrituras).
  const ss = getAdminSpreadsheet();
  const lotesSheet = ss.getSheetByName(CDC_LOTES_SHEET_NAME);
  if (!lotesSheet || lotesSheet.getLastRow() < 2) return jsonResponse({ ok: true, lotes: [] });
  const limite = 50;
  // Progreso por lote (descargados X de Y) en una sola lectura de ítems.
  const progreso = {};
  const itemsSheet = ss.getSheetByName(CDC_ITEMS_SHEET_NAME);
  if (itemsSheet && itemsSheet.getLastRow() >= 2) {
    const filasItems = itemsSheet.getRange(2, 1, itemsSheet.getLastRow() - 1, 3).getValues();
    filasItems.forEach(function (f) {
      const loteId = String(f[0]);
      if (!loteId) return;
      const p = progreso[loteId] || (progreso[loteId] = { totalItems: 0, descargados: 0, pendientes: 0, conError: 0, reintentables: 0 });
      p.totalItems += 1;
      if (String(f[2]) === 'descargado') p.descargados += 1;
      else if (String(f[2]) === 'pendiente') p.pendientes += 1;
      else {
        p.conError += 1;
        if (CDC_ESTADOS_REINTENTABLES.indexOf(String(f[2])) !== -1) p.reintentables += 1;
      }
    });
  }
  const filas = lotesSheet.getRange(2, 1, lotesSheet.getLastRow() - 1, CDC_LOTES_HEADERS.length).getValues();
  const lotes = filas.slice(-limite).reverse().map(function (f) {
    const p = progreso[String(f[0])] || { totalItems: 0, descargados: 0, pendientes: 0, conError: 0, reintentables: 0 };
    return {
      loteId: String(f[0]),
      localId: String(f[1]),
      creadoEn: f[2] instanceof Date ? f[2].toISOString() : String(f[2]),
      creadoPor: String(f[3]),
      fuente: String(f[4]),
      estado: String(f[5]),
      total: Number(f[6]) || 0,
      observaciones: String(f[7] || ''),
      totalItems: p.totalItems,
      descargados: p.descargados,
      pendientes: p.pendientes,
      conError: p.conError,
      reintentables: p.reintentables
    };
  });
  const payload = { ok: true, lotes: lotes };
  try { cache.put(CDC_LISTAR_CACHE_KEY, JSON.stringify(payload), 60); } catch (e) { /* payload grande: sin caché */ }
  return jsonResponse(payload);
}

// ── COLA DEL WORKER (Paso 4.4) ───────────────────────────────────────────
// El worker local toma de a UN lote en_cola (el más viejo) junto con sus
// CDCs pendientes, lo deja en_proceso y después reporta el resultado CDC
// por CDC. La toma va bajo lock: dos trabajadores simultáneos nunca
// agarran el mismo lote. Si el worker corta a mitad de camino, cierra
// llamando a cdcLiberarLote y el lote vuelve a en_cola con los pendientes
// que le quedan (los ya reportados conservan su estado). Si el worker
// desaparece sin avisar, el lote trabado se reabre solo a las
// CDC_HORAS_REAPERTURA horas. Columnas: lotes 6=Estado, 9=Actualizado En;
// ítems 3=Estado, 4=Intentos, 5=Error, 6=XML Referencia, 7=Actualizado En.
const CDC_ESTADOS_ITEM_REPORTABLES = ['descargado', 'no_encontrado', 'captcha_fallido', 'error_descarga'];
// Fallas que tiene sentido volver a intentar en un lote nuevo cuando la
// IP/perfil ya enfrió. 'no_encontrado' no se reintenta desde el panel:
// no es una falla transitoria de descarga.
const CDC_ESTADOS_REINTENTABLES = ['captcha_fallido', 'error_descarga'];
const CDC_HORAS_REAPERTURA = 6;

function cdcLeerLotes(lotesSheet) {
  if (lotesSheet.getLastRow() < 2) return [];
  return lotesSheet.getRange(2, 1, lotesSheet.getLastRow() - 1, CDC_LOTES_HEADERS.length)
    .getValues()
    .map(function (f, i) {
      return {
        fila: i + 2,
        loteId: String(f[0]),
        localId: String(f[1]),
        creadoEn: f[2] instanceof Date ? f[2].toISOString() : String(f[2]),
        creadoPor: String(f[3]),
        fuente: String(f[4]),
        estado: String(f[5]),
        total: Number(f[6]) || 0,
        observaciones: String(f[7] || ''),
        actualizadoEn: f[8] instanceof Date ? f[8].getTime() : Date.parse(f[8])
      };
    });
}

function cdcLeerItems(itemsSheet) {
  if (itemsSheet.getLastRow() < 2) return [];
  return itemsSheet.getRange(2, 1, itemsSheet.getLastRow() - 1, CDC_ITEMS_HEADERS.length)
    .getValues()
    .map(function (f, i) {
      return {
        fila: i + 2,
        loteId: String(f[0]),
        cdc: String(f[1]).replace(/\D/g, ''),
        estado: String(f[2]),
        intentos: Number(f[3]) || 0,
        error: String(f[4] || ''),
        referencia: String(f[5] || '')
      };
    });
}

function cdcStatsDeItems(items, loteId) {
  const s = { pendientes: [], descargados: 0, conError: 0, total: 0 };
  items.forEach(function (it) {
    if (it.loteId !== loteId) return;
    s.total += 1;
    if (it.estado === 'pendiente') s.pendientes.push(it);
    else if (it.estado === 'descargado') s.descargados += 1;
    else s.conError += 1;
  });
  return s;
}

function cdcMarcarLote(lotesSheet, fila, estado, ahora) {
  lotesSheet.getRange(fila, 6).setValue(estado);
  lotesSheet.getRange(fila, 9).setValue(ahora);
  cdcInvalidarListar();
}

function handleCdcTomarLote() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('No se pudo obtener el lock para tomar el lote.');
  cdcCrearBajoLock = true;
  try {
    const lotesSheet = ensureCdcSheet(CDC_LOTES_SHEET_NAME, CDC_LOTES_HEADERS);
    const itemsSheet = ensureCdcSheet(CDC_ITEMS_SHEET_NAME, CDC_ITEMS_HEADERS);
    const ahora = new Date();
    const limiteTrabado = ahora.getTime() - CDC_HORAS_REAPERTURA * 60 * 60 * 1000;

    // Reabrir lotes en_proceso cuyo worker desapareció sin liberar.
    cdcLeerLotes(lotesSheet).forEach(function (lote) {
      if (lote.estado !== 'en_proceso') return;
      if (!isFinite(lote.actualizadoEn) || lote.actualizadoEn < limiteTrabado) {
        cdcMarcarLote(lotesSheet, lote.fila, 'en_cola', ahora);
        lote.estado = 'en_cola';
      }
    });

    const items = cdcLeerItems(itemsSheet);
    // Las filas están en orden de creación: el primer en_cola es el más viejo.
    const lotes = cdcLeerLotes(lotesSheet);
    for (let i = 0; i < lotes.length; i++) {
      const lote = lotes[i];
      if (lote.estado !== 'en_cola') continue;
      const stats = cdcStatsDeItems(items, lote.loteId);
      if (!stats.pendientes.length) {
        // Sin pendientes (cierre que quedó a medias): se cierra y se sigue.
        cdcMarcarLote(lotesSheet, lote.fila,
          stats.conError > 0 ? 'completado_con_errores' : 'completado', ahora);
        continue;
      }
      cdcMarcarLote(lotesSheet, lote.fila, 'en_proceso', ahora);
      // Cada toma cuenta como un intento más para los CDCs que entrega.
      stats.pendientes.forEach(function (it) {
        itemsSheet.getRange(it.fila, 4).setValue(it.intentos + 1);
        itemsSheet.getRange(it.fila, 7).setValue(ahora);
      });
      return jsonResponse({
        ok: true,
        lote: {
          loteId: lote.loteId,
          localId: lote.localId,
          creadoEn: lote.creadoEn,
          fuente: lote.fuente,
          estado: 'en_proceso',
          total: lote.total,
          cdcs: stats.pendientes.map(function (it) { return it.cdc; })
        }
      });
    }
    return jsonResponse({ ok: true, lote: null });
  } finally {
    cdcCrearBajoLock = false;
    lock.releaseLock();
  }
}

function handleCdcReportarItem(body) {
  const loteId = String(body.loteId || '').slice(0, 80);
  const cdc = String(body.cdc || '').replace(/\D/g, '');
  const estado = String(body.estado || '');
  if (!loteId) throw new Error('Falta el ID del lote.');
  if (!/^\d{44}$/.test(cdc)) throw new Error('El CDC reportado debe tener 44 dígitos.');
  if (CDC_ESTADOS_ITEM_REPORTABLES.indexOf(estado) === -1) {
    throw new Error('Estado de ítem no válido: ' + estado);
  }
  const error = String(body.error || '').slice(0, 500);
  const referencia = String(body.referencia || '').slice(0, 300);

  const lotesSheet = ensureCdcSheet(CDC_LOTES_SHEET_NAME, CDC_LOTES_HEADERS);
  const itemsSheet = ensureCdcSheet(CDC_ITEMS_SHEET_NAME, CDC_ITEMS_HEADERS);
  const items = cdcLeerItems(itemsSheet);
  const item = items.find(function (it) { return it.loteId === loteId && it.cdc === cdc; });
  if (!item) throw new Error('Ese CDC no pertenece al lote indicado.');

  const lote = cdcLeerLotes(lotesSheet).find(function (l) { return l.loteId === loteId; });
  if (!lote) throw new Error('No existe el lote indicado.');

  if (item.estado !== 'pendiente') {
    // Ítems ya cerrados no se reescriben: reportar dos veces es inocuo.
    const stats = cdcStatsDeItems(items, loteId);
    return jsonResponse({
      ok: true, duplicado: true, loteEstado: lote.estado,
      progreso: { total: stats.total, descargados: stats.descargados, pendientes: stats.pendientes.length, conError: stats.conError }
    });
  }

  const ahora = new Date();
  itemsSheet.getRange(item.fila, 3).setValue(estado);
  itemsSheet.getRange(item.fila, 5).setValue(error);
  itemsSheet.getRange(item.fila, 6).setValue(referencia);
  itemsSheet.getRange(item.fila, 7).setValue(ahora);
  item.estado = estado;

  cdcInvalidarListar();
  const stats = cdcStatsDeItems(items, loteId);
  let loteEstado = lote.estado;
  if (!stats.pendientes.length) {
    loteEstado = stats.conError > 0 ? 'completado_con_errores' : 'completado';
    cdcMarcarLote(lotesSheet, lote.fila, loteEstado, ahora);
  } else {
    lotesSheet.getRange(lote.fila, 9).setValue(ahora);
  }
  return jsonResponse({
    ok: true, duplicado: false, loteEstado: loteEstado,
    progreso: { total: stats.total, descargados: stats.descargados, pendientes: stats.pendientes.length, conError: stats.conError }
  });
}

function handleCdcLiberarLote(body) {
  const loteId = String(body.loteId || '').slice(0, 80);
  if (!loteId) throw new Error('Falta el ID del lote.');
  const lotesSheet = ensureCdcSheet(CDC_LOTES_SHEET_NAME, CDC_LOTES_HEADERS);
  const lote = cdcLeerLotes(lotesSheet).find(function (l) { return l.loteId === loteId; });
  if (!lote) throw new Error('No existe el lote indicado.');
  if (lote.estado === 'en_proceso') {
    cdcMarcarLote(lotesSheet, lote.fila, 'en_cola', new Date());
    return jsonResponse({ ok: true, lote: { loteId: loteId, estado: 'en_cola' } });
  }
  return jsonResponse({ ok: true, lote: { loteId: loteId, estado: lote.estado } });
}

// Crea un lote NUEVO en_cola solo con los CDCs reintentables de otro lote
// (captcha_fallido / error_descarga). No modifica el lote original ni
// descarga nada: el worker lo tomará en una próxima corrida. Para no
// duplicar por doble clic, si ya hay un reintento de ese lote en_cola o
// en_proceso se devuelve ese mismo.
// Borra un lote y todos sus ítems (para limpiar la cola/registros desde el
// panel). No borra los XML que estén en Drive. Un lote en_proceso no se
// puede borrar: hay un worker trabajando sobre él.
function handleCdcBorrarLote(body) {
  const loteId = String(body.loteId || '').slice(0, 80);
  if (!loteId) throw new Error('Falta el ID del lote.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('No se pudo obtener el lock para borrar el lote.');

  cdcCrearBajoLock = true;
  try {
    const lotesSheet = ensureCdcSheet(CDC_LOTES_SHEET_NAME, CDC_LOTES_HEADERS);
    const itemsSheet = ensureCdcSheet(CDC_ITEMS_SHEET_NAME, CDC_ITEMS_HEADERS);
    const lote = cdcLeerLotes(lotesSheet).find(function (l) { return l.loteId === loteId; });
    if (!lote) throw new Error('No existe el lote indicado.');
    if (lote.estado === 'en_proceso') {
      throw new Error('Ese lote se está descargando: esperá a que termine para borrarlo.');
    }
    const filasItems = cdcLeerItems(itemsSheet)
      .filter(function (it) { return it.loteId === loteId; })
      .map(function (it) { return it.fila; })
      .sort(function (a, b) { return b - a; });
    filasItems.forEach(function (fila) { itemsSheet.deleteRow(fila); });
    lotesSheet.deleteRow(lote.fila);
    cdcInvalidarListar();
    return jsonResponse({ ok: true, loteId: loteId, itemsBorrados: filasItems.length, estadoPrevio: lote.estado });
  } finally {
    cdcCrearBajoLock = false;
    lock.releaseLock();
  }
}

function handleCdcReintentarFallidos(body, sessionUser) {
  const loteOrigenId = String(body.loteId || '').slice(0, 80);
  if (!loteOrigenId) throw new Error('Falta el ID del lote.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('No se pudo obtener el lock para crear el reintento.');

  cdcCrearBajoLock = true;
  try {
    const lotesSheet = ensureCdcSheet(CDC_LOTES_SHEET_NAME, CDC_LOTES_HEADERS);
    const itemsSheet = ensureCdcSheet(CDC_ITEMS_SHEET_NAME, CDC_ITEMS_HEADERS);
    const lotes = cdcLeerLotes(lotesSheet);
    const loteOrigen = lotes.find(function (l) { return l.loteId === loteOrigenId; });
    if (!loteOrigen) throw new Error('No existe el lote indicado.');

    const vistos = {};
    const cdcs = [];
    cdcLeerItems(itemsSheet).forEach(function (it) {
      if (it.loteId !== loteOrigenId) return;
      if (CDC_ESTADOS_REINTENTABLES.indexOf(it.estado) === -1) return;
      if (!/^\d{44}$/.test(it.cdc) || vistos[it.cdc]) return;
      vistos[it.cdc] = true;
      cdcs.push(it.cdc);
    });
    if (!cdcs.length) {
      return jsonResponse({ ok: true, lote: null, reintentados: 0 });
    }

    const observacion = 'Reintento de ' + loteOrigenId;
    const activo = lotes.find(function (l) {
      return l.observaciones === observacion && (l.estado === 'en_cola' || l.estado === 'en_proceso');
    });
    if (activo) {
      return jsonResponse({
        ok: true,
        duplicado: true,
        reintentados: cdcs.length,
        lote: {
          loteId: activo.loteId,
          localId: activo.localId,
          creadoEn: activo.creadoEn,
          fuente: activo.fuente,
          estado: activo.estado,
          total: activo.total
        }
      });
    }

    const ahora = new Date();
    const loteId = 'CDC-' + Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') +
      '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
    const localId = 'reintento-' + loteOrigenId + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
    const fuente = ['FUENTE_REGISTRO_VIRTUAL', 'FUENTE_CONSULTA_REGISTRADOS'].indexOf(loteOrigen.fuente) !== -1
      ? loteOrigen.fuente
      : 'FUENTE_CONSULTA_REGISTRADOS';

    lotesSheet.appendRow([
      loteId, localId, ahora, String(sessionUser || ''), fuente, 'en_cola', cdcs.length, observacion, ahora
    ]);

    const filasItems = cdcs.map(function (cdc) {
      return [loteId, cdc, 'pendiente', 0, '', '', ahora];
    });
    const inicio = itemsSheet.getLastRow() + 1;
    itemsSheet.getRange(inicio, 1, filasItems.length, CDC_ITEMS_HEADERS.length).setValues(filasItems);
    itemsSheet.getRange(inicio, 2, filasItems.length, 1).setNumberFormat('@');
    cdcInvalidarListar();

    return jsonResponse({
      ok: true,
      duplicado: false,
      reintentados: cdcs.length,
      lote: {
        loteId: loteId,
        localId: localId,
        creadoEn: ahora.toISOString(),
        fuente: fuente,
        estado: 'en_cola',
        total: cdcs.length
      }
    });
  } finally {
    cdcCrearBajoLock = false;
    lock.releaseLock();
  }
}

// ── XML EN DRIVE (nexo worker -> sistema) ────────────────────────────────
// El worker ya habla con este Web App (eso es, en la práctica, el webhook
// del módulo): al terminar de bajar un XML lo sube con cdcSubirXml y queda
// guardado como archivo <CDC>.xml en una carpeta privada de Drive. La
// pestaña XML / KuDE lo trae con cdcObtenerItems / cdcObtenerXml, siempre
// con sesión iniciada. Los archivos NO se comparten: sin sesión del
// sistema no se pueden leer. En la hoja de ítems, la columna XML
// Referencia pasa a guardar 'drive:<id del archivo>'.
const CDC_DRIVE_CARPETA = 'CDC XML descargados';
const CDC_XML_MAX_CHARS = 1000000;

function cdcCarpetaXml() {
  const it = DriveApp.getFoldersByName(CDC_DRIVE_CARPETA);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(CDC_DRIVE_CARPETA);
}

// Ejecutá esta función UNA VEZ desde el editor de Apps Script (seleccionala
// arriba y tocá Ejecutar) para aceptar el permiso de Drive que este
// módulo empieza a usar. Sin eso, la primera subida falla con error de
// autorización.
function autorizarDriveCdc() {
  const carpeta = cdcCarpetaXml();
  Logger.log('Carpeta de XML lista: ' + carpeta.getName() + ' (' + carpeta.getId() + ')');
}

function cdcBuscarLoteEItem(body) {
  const loteId = String(body.loteId || '').slice(0, 80);
  const cdc = String(body.cdc || '').replace(/\D/g, '');
  if (!loteId) throw new Error('Falta el ID del lote.');
  if (!/^\d{44}$/.test(cdc)) throw new Error('El CDC debe tener 44 dígitos.');
  const lotesSheet = ensureCdcSheet(CDC_LOTES_SHEET_NAME, CDC_LOTES_HEADERS);
  const itemsSheet = ensureCdcSheet(CDC_ITEMS_SHEET_NAME, CDC_ITEMS_HEADERS);
  const items = cdcLeerItems(itemsSheet);
  const item = items.find(function (it) { return it.loteId === loteId && it.cdc === cdc; });
  if (!item) throw new Error('Ese CDC no pertenece al lote indicado.');
  const lote = cdcLeerLotes(lotesSheet).find(function (l) { return l.loteId === loteId; });
  if (!lote) throw new Error('No existe el lote indicado.');
  return { loteId: loteId, cdc: cdc, item: item, lote: lote, items: items, lotesSheet: lotesSheet, itemsSheet: itemsSheet };
}

function handleCdcSubirXml(body) {
  const ctx = cdcBuscarLoteEItem(body);
  const item = ctx.item;
  const contenido = String(body.contenido || '');
  if (!contenido || contenido.indexOf('<') === -1) throw new Error('El contenido XML está vacío o no parece XML.');
  if (contenido.length > CDC_XML_MAX_CHARS) throw new Error('El XML supera el tamaño máximo permitido.');
  if (item.estado !== 'pendiente' && item.estado !== 'descargado') {
    throw new Error('El ítem no admite XML en su estado actual: ' + item.estado);
  }
  const carpeta = cdcCarpetaXml();
  const nombre = ctx.cdc + '.xml';
  let archivo = null;
  const existentes = carpeta.getFilesByName(nombre);
  if (existentes.hasNext()) archivo = existentes.next();
  if (!archivo) archivo = carpeta.createFile(nombre, contenido, 'application/xml');
  const referencia = 'drive:' + archivo.getId();
  const ahora = new Date();
  ctx.itemsSheet.getRange(item.fila, 6).setValue(referencia);
  ctx.itemsSheet.getRange(item.fila, 7).setValue(ahora);
  let loteEstado = ctx.lote.estado;
  if (item.estado === 'pendiente') {
    // Tener el XML prueba la descarga aunque el reporte se haya perdido.
    ctx.itemsSheet.getRange(item.fila, 3).setValue('descargado');
    ctx.itemsSheet.getRange(item.fila, 5).setValue('');
    item.estado = 'descargado';
    const stats = cdcStatsDeItems(ctx.items, ctx.loteId);
    if (!stats.pendientes.length) {
      loteEstado = stats.conError > 0 ? 'completado_con_errores' : 'completado';
      cdcMarcarLote(ctx.lotesSheet, ctx.lote.fila, loteEstado, ahora);
    } else {
      ctx.lotesSheet.getRange(ctx.lote.fila, 9).setValue(ahora);
    }
  }
  // La lista de lotes muestra cuántos tienen XML: se refresca.
  cdcInvalidarListar();
  return jsonResponse({ ok: true, loteId: ctx.loteId, cdc: ctx.cdc, referencia: referencia, loteEstado: loteEstado });
}

function handleCdcObtenerItems(body) {
  const loteId = String(body.loteId || '').slice(0, 80);
  if (!loteId) throw new Error('Falta el ID del lote.');
  const itemsSheet = ensureCdcSheet(CDC_ITEMS_SHEET_NAME, CDC_ITEMS_HEADERS);
  const items = cdcLeerItems(itemsSheet)
    .filter(function (it) { return it.loteId === loteId; })
    .map(function (it) {
      return {
        cdc: it.cdc,
        estado: it.estado,
        intentos: it.intentos,
        error: it.error || '',
        tieneXml: String(it.referencia || '').indexOf('drive:') === 0
      };
    });
  return jsonResponse({ ok: true, loteId: loteId, items: items });
}

function handleCdcObtenerXml(body) {
  const ctx = cdcBuscarLoteEItem(body);
  const referencia = String(ctx.item.referencia || '');
  if (referencia.indexOf('drive:') !== 0) throw new Error('Ese CDC todavía no tiene XML subido al sistema.');
  const archivo = DriveApp.getFileById(referencia.slice(6));
  const contenido = archivo.getBlob().getDataAsString('UTF-8');
  return jsonResponse({ ok: true, cdc: ctx.cdc, nombre: ctx.cdc + '.xml', contenido: contenido });
}

// ── RUTEO ────────────────────────────────────────────────────────────────
// Se llama desde doPost después de validar la sesión. Devuelve la respuesta
// si la acción es de este módulo, o null para que doPost siga con lo suyo.
function handleCdcAction(action, body, sessionUser, sessionRole) {
  const routes = {
    cdcCrearLote: [function () { return handleCdcCrearLote(body, sessionUser); }, 'CDC_CREAR_ERROR'],
    cdcListarLotes: [function () { return handleCdcListarLotes(); }, 'CDC_LISTAR_ERROR'],
    cdcTomarLote: [function () { return handleCdcTomarLote(); }, 'CDC_TOMAR_ERROR'],
    cdcReportarItem: [function () { return handleCdcReportarItem(body); }, 'CDC_REPORTAR_ERROR'],
    cdcLiberarLote: [function () { return handleCdcLiberarLote(body); }, 'CDC_LIBERAR_ERROR'],
    cdcReintentarFallidos: [function () { return handleCdcReintentarFallidos(body, sessionUser); }, 'CDC_REINTENTAR_ERROR'],
    cdcBorrarLote: [function () { return handleCdcBorrarLote(body); }, 'CDC_BORRAR_ERROR'],
    cdcSubirXml: [function () { return handleCdcSubirXml(body); }, 'CDC_SUBIR_XML_ERROR'],
    cdcObtenerItems: [function () { return handleCdcObtenerItems(body); }, 'CDC_OBTENER_ITEMS_ERROR'],
    cdcObtenerXml: [function () { return handleCdcObtenerXml(body); }, 'CDC_OBTENER_XML_ERROR']
  };
  const route = Object.prototype.hasOwnProperty.call(routes, action) ? routes[action] : null;
  if (!route) return null;
  try {
    return route[0]();
  } catch (err) {
    return errorResponse(err.message, route[1]);
  }
}
