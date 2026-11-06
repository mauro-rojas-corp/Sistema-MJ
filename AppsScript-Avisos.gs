/**
 * MÓDULO AVISOS (BUZÓN) - archivo aparte del backend de Control Clientes.
 *
 * Cuando alguien registra la recepción de documentación en la ficha de un
 * cliente, se le deja un aviso al Encargado de esa fila. Cada usuario ve sólo
 * sus avisos y los marca como leídos (no hay confirmación de recepción).
 *
 * Instalación en el proyecto de Apps Script:
 *   1. Archivo nuevo (+ > Secuencia de comandos) llamado "Avisos" y pegar
 *      este contenido completo.
 *   2. En doPost del Code.gs, justo antes de la línea
 *        return errorResponse('Acción desconocida: ' + action, 'UNKNOWN_ACTION');
 *      agregar:
 *        const avisosResponse = handleAvisosAction(action, body, sessionUser, sessionRole);
 *        if (avisosResponse) return avisosResponse;
 *   3. Implementar > Administrar implementaciones > editar > Nueva versión.
 *
 * Además, al registrar la recepción, pinta la fila del cliente (B a K) con el
 * color del Vencimiento de la columna A (acción recepcionPintarFila).
 *
 * Hoja "Avisos" en la planilla de administración (se crea sola), una fila por
 * aviso. Usa funciones de Code.gs: getAdminSpreadsheet, getAllowedUsers,
 * canonicalUserName, jsonResponse y errorResponse.
 */

const AVISOS_SHEET_NAME = 'Avisos';
const AVISOS_HEADERS = [
  'ID', 'Creado', 'Para', 'De', 'Año', 'Mes', 'Fila', 'Cliente', 'RUC',
  'Documentos', 'Nota', 'Vencimiento', 'Leído'
];
const AVISOS_COL_PARA = 3;
const AVISOS_COL_LEIDO = 13;
// Sólo se revisan los avisos más recientes: el buzón muestra los últimos días.
const AVISOS_MAX_FILAS_LEIDAS = 3000;
const AVISOS_MAX_DEVUELTOS = 200;
const AVISOS_DIAS_VISIBLES = 60;

function ensureAvisosSheet() {
  const ss = getAdminSpreadsheet();
  let sheet = ss.getSheetByName(AVISOS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(AVISOS_SHEET_NAME);
    // Todo como texto: si no, Sheets convierte "OCTUBRE 2026" o el RUC en
    // fecha/número y el aviso deja de apuntar a la hoja del mes.
    sheet.getRange(1, 1, sheet.getMaxRows(), AVISOS_HEADERS.length).setNumberFormat('@');
    sheet.getRange(1, 1, 1, AVISOS_HEADERS.length).setValues([AVISOS_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

const AVISOS_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Avisos guardados antes de forzar el texto: Sheets convirtió el nombre de
// la hoja ("OCTUBRE 2026") en fecha. Se recupera buscando la hoja del año
// que tenga ese mes en el nombre.
function avisosMesDesdeFecha_(fecha, anio, cacheHojas) {
  const mes = AVISOS_MESES[fecha.getMonth()];
  const clave = String(anio || fecha.getFullYear());
  if (!Object.prototype.hasOwnProperty.call(cacheHojas, clave)) {
    try { cacheHojas[clave] = getAvailableSheets(clave); } catch (err) { cacheHojas[clave] = []; }
  }
  const variantes = mes === 'septiembre' ? ['septiembre', 'setiembre'] : [mes];
  const anioFecha = String(fecha.getFullYear());
  const candidatas = cacheHojas[clave].filter(function (nombre) {
    const n = normalizeText(nombre);
    return variantes.some(function (v) { return n.indexOf(v) !== -1; });
  });
  // Primero la que también tiene el año ("OCTUBRE 2026"), después cualquiera.
  const hoja = candidatas.filter(function (nombre) {
    return String(nombre).indexOf(anioFecha) !== -1;
  })[0] || candidatas[0];
  return hoja || (mes.charAt(0).toUpperCase() + mes.slice(1) + ' ' + fecha.getFullYear());
}

function avisosCeldaTexto_(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value === null || value === undefined ? '' : value);
}

function avisosTexto_(value, max) {
  return String(value === null || value === undefined ? '' : value).trim().slice(0, max);
}

function avisosMismoUsuario_(a, b) {
  return canonicalUserName(a) === canonicalUserName(b);
}

// Lee las últimas filas de la hoja como objetos (fila real incluida).
function avisosLeerRecientes_(sheet, opciones) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const resolverMes = Boolean(opciones && opciones.resolverMes);
  const cacheHojas = {};
  const desde = Math.max(2, lastRow - AVISOS_MAX_FILAS_LEIDAS + 1);
  const values = sheet.getRange(desde, 1, lastRow - desde + 1, AVISOS_HEADERS.length).getValues();
  return values.map(function (r, i) {
    let documentos = [];
    try { documentos = JSON.parse(r[9] || '[]'); } catch (err) { documentos = []; }
    const anio = r[4] instanceof Date ? String(r[4].getFullYear()) : avisosCeldaTexto_(r[4]).trim();
    let mes = avisosCeldaTexto_(r[5]);
    if (r[5] instanceof Date) {
      mes = resolverMes ? avisosMesDesdeFecha_(r[5], anio, cacheHojas) : '';
    }
    return {
      fila: desde + i,
      id: String(r[0] || ''),
      creado: avisosCeldaTexto_(r[1]),
      para: String(r[2] || ''),
      de: String(r[3] || ''),
      anio: anio,
      mes: mes,
      filaCliente: Number(r[6]) || 0,
      cliente: String(r[7] || ''),
      ruc: avisosCeldaTexto_(r[8]),
      documentos: Array.isArray(documentos) ? documentos : [],
      nota: String(r[10] || ''),
      vencimiento: r[11] instanceof Date ? Utilities.formatDate(r[11], Session.getScriptTimeZone(), 'dd/MM/yyyy') : String(r[11] || ''),
      leido: avisosCeldaTexto_(r[12])
    };
  });
}

function avisosPublico_(a) {
  return {
    id: a.id,
    creado: a.creado,
    de: a.de,
    anio: a.anio,
    mes: a.mes,
    fila: a.filaCliente,
    cliente: a.cliente,
    ruc: a.ruc,
    documentos: a.documentos,
    nota: a.nota,
    vencimiento: a.vencimiento,
    leido: Boolean(a.leido)
  };
}

function handleAvisosCrear(body, sessionUser) {
  const destinatario = getAllowedUsers().filter(function (u) {
    return avisosMismoUsuario_(u.nombre, body.para);
  })[0];
  if (!destinatario) {
    return errorResponse(
      'El Encargado "' + avisosTexto_(body.para, 80) + '" no es un usuario activo: no se pudo dejar el aviso.',
      'AVISO_DESTINATARIO'
    );
  }

  const anio = avisosTexto_(body.anio, 10);
  const mes = avisosTexto_(body.mes, 60);
  const fila = Number(body.fila);
  const cliente = avisosTexto_(body.cliente, 200);
  if (!anio || !mes || !(fila >= 2) || !cliente) {
    return errorResponse('Faltan datos del cliente para el aviso', 'AVISO_DATOS');
  }

  const documentos = (Array.isArray(body.documentos) ? body.documentos : [])
    .map(function (d) { return avisosTexto_(d, 80); })
    .filter(function (d) { return d; })
    .slice(0, 12);

  const id = Utilities.getUuid();
  const filaAviso = [
    id,
    new Date().toISOString(),
    destinatario.nombre,
    sessionUser,
    anio,
    mes,
    fila,
    cliente,
    avisosTexto_(body.ruc, 40),
    JSON.stringify(documentos),
    avisosTexto_(body.nota, 1000),
    avisosTexto_(body.vencimiento, 60),
    ''
  ].map(function (v) { return String(v); });

  // Se escribe como texto (no appendRow): así Sheets no convierte el mes ni
  // el RUC. El lock evita que dos avisos simultáneos pisen la misma fila.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return errorResponse('El buzón está ocupado, intentá de nuevo', 'AVISOS_LOCK_TIMEOUT');
  }
  try {
    const sheet = ensureAvisosSheet();
    const destino = sheet.getRange(sheet.getLastRow() + 1, 1, 1, AVISOS_HEADERS.length);
    destino.setNumberFormat('@');
    destino.setValues([filaAviso]);
  } finally {
    lock.releaseLock();
  }

  return jsonResponse({ ok: true, id: id, para: destinatario.nombre });
}

function handleAvisosListar(sessionUser) {
  const limite = Date.now() - AVISOS_DIAS_VISIBLES * 24 * 60 * 60 * 1000;
  const mios = avisosLeerRecientes_(ensureAvisosSheet(), { resolverMes: true }).filter(function (a) {
    if (!a.id || !avisosMismoUsuario_(a.para, sessionUser)) return false;
    const t = Date.parse(a.creado);
    return !isNaN(t) && t >= limite;
  });
  mios.reverse(); // más recientes primero
  const noLeidos = mios.filter(function (a) { return !a.leido; }).length;
  return jsonResponse({
    ok: true,
    avisos: mios.slice(0, AVISOS_MAX_DEVUELTOS).map(avisosPublico_),
    noLeidos: noLeidos
  });
}

// body.ids: lista de IDs a marcar; body.todos: true marca todos los propios.
function handleAvisosMarcarLeidos(body, sessionUser) {
  const ids = {};
  (Array.isArray(body.ids) ? body.ids : []).forEach(function (id) {
    ids[String(id)] = true;
  });
  const todos = body.todos === true;
  if (!todos && !Object.keys(ids).length) return jsonResponse({ ok: true, marcados: 0 });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return errorResponse('El buzón está ocupado, intentá de nuevo', 'AVISOS_LOCK_TIMEOUT');
  }
  let marcados = 0;
  try {
    const sheet = ensureAvisosSheet();
    const ahora = new Date().toISOString();
    avisosLeerRecientes_(sheet).forEach(function (a) {
      if (a.leido || !avisosMismoUsuario_(a.para, sessionUser)) return;
      if (!todos && !ids[a.id]) return;
      sheet.getRange(a.fila, AVISOS_COL_LEIDO).setValue(ahora);
      marcados++;
    });
  } finally {
    lock.releaseLock();
  }
  return jsonResponse({ ok: true, marcados: marcados });
}

// ── PINTAR LA FILA AL REGISTRAR LA RECEPCIÓN ─────────────────────────────
// Al registrar la documentación recibida, la fila del cliente se pinta de B
// a K con el color que tiene su Vencimiento en la columna A. El color sale,
// en este orden, de: el relleno de la celda A, una regla de formato
// condicional que aplique a esa celda, u otra fila con el mismo vencimiento
// que tenga relleno.
const RECEPCION_COLOR_COL_REFERENCIA = 1; // A
const RECEPCION_COLOR_COL_DESDE = 2;      // B
const RECEPCION_COLOR_COL_HASTA = 11;     // K

function recepcionColorValido_(color) {
  const c = String(color || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(c) && c !== '#ffffff';
}

function recepcionCumpleCondicion_(condicion, valor) {
  const tipos = SpreadsheetApp.BooleanCriteria;
  const tipo = condicion.getCriteriaType();
  const criterios = condicion.getCriteriaValues() || [];
  const texto = normalizeText(valor);
  const c0 = normalizeText(criterios[0]);
  const numero = Number(String(valor).replace(/[^0-9.,-]/g, '').replace(',', '.'));
  switch (tipo) {
    case tipos.TEXT_EQUAL_TO: return texto === c0;
    case tipos.TEXT_CONTAINS: return texto.indexOf(c0) !== -1;
    case tipos.TEXT_NOT_CONTAINS: return texto.indexOf(c0) === -1;
    case tipos.TEXT_STARTS_WITH: return texto.indexOf(c0) === 0;
    case tipos.TEXT_ENDS_WITH: return c0 !== '' && texto.slice(-c0.length) === c0;
    case tipos.NUMBER_EQUAL_TO: return !isNaN(numero) && numero === Number(criterios[0]);
    case tipos.NUMBER_BETWEEN: return !isNaN(numero) && numero >= Number(criterios[0]) && numero <= Number(criterios[1]);
    case tipos.NUMBER_GREATER_THAN: return !isNaN(numero) && numero > Number(criterios[0]);
    case tipos.NUMBER_GREATER_THAN_OR_EQUAL_TO: return !isNaN(numero) && numero >= Number(criterios[0]);
    case tipos.NUMBER_LESS_THAN: return !isNaN(numero) && numero < Number(criterios[0]);
    case tipos.NUMBER_LESS_THAN_OR_EQUAL_TO: return !isNaN(numero) && numero <= Number(criterios[0]);
    default: return false; // fórmulas personalizadas y otros tipos no se evalúan
  }
}

function recepcionColorDeVencimiento_(sheet, row) {
  const celda = sheet.getRange(row, RECEPCION_COLOR_COL_REFERENCIA);
  const relleno = celda.getBackground();
  if (recepcionColorValido_(relleno)) return { color: relleno, origen: 'celda' };

  const valor = celda.getDisplayValue();
  const reglas = sheet.getConditionalFormatRules ? sheet.getConditionalFormatRules() : [];
  for (let i = 0; i < reglas.length; i++) {
    const condicion = reglas[i].getBooleanCondition();
    if (!condicion) continue;
    const color = condicion.getBackground();
    if (!recepcionColorValido_(color)) continue;
    const aplica = reglas[i].getRanges().some(function (r) {
      return row >= r.getRow() && row <= r.getLastRow() &&
        RECEPCION_COLOR_COL_REFERENCIA >= r.getColumn() && RECEPCION_COLOR_COL_REFERENCIA <= r.getLastColumn();
    });
    if (aplica && recepcionCumpleCondicion_(condicion, valor)) return { color: color, origen: 'formato condicional' };
  }

  // Otra fila con el mismo vencimiento que sí tenga relleno en A.
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2 && normalizeText(valor)) {
    const valores = sheet.getRange(2, RECEPCION_COLOR_COL_REFERENCIA, lastRow - 1, 1).getDisplayValues();
    const fondos = sheet.getRange(2, RECEPCION_COLOR_COL_REFERENCIA, lastRow - 1, 1).getBackgrounds();
    for (let j = 0; j < valores.length; j++) {
      if (normalizeText(valores[j][0]) === normalizeText(valor) && recepcionColorValido_(fondos[j][0])) {
        return { color: fondos[j][0], origen: 'otra fila con el mismo vencimiento' };
      }
    }
  }
  return null;
}

function handleRecepcionPintarFila(body, sessionUser) {
  const sheet = getMonthSheet(body.year, body.sheet);
  if (!sheet) {
    return errorResponse('Año/mes "' + body.year + ' / ' + body.sheet + '" no válido', 'SHEET_NOT_FOUND');
  }
  const row = Number(body.row);
  if (!(row >= 2) || row > sheet.getLastRow()) return errorResponse('Fila inválida', 'ROW_INVALID');

  const encontrado = recepcionColorDeVencimiento_(sheet, row);
  if (!encontrado) {
    return jsonResponse({
      ok: true,
      pintado: false,
      motivo: 'El Vencimiento de la columna A no tiene un color definido.'
    });
  }

  const ancho = RECEPCION_COLOR_COL_HASTA - RECEPCION_COLOR_COL_DESDE + 1;
  const destino = sheet.getRange(row, RECEPCION_COLOR_COL_DESDE, 1, ancho);
  const anterior = destino.getBackground();
  destino.setBackground(encontrado.color);
  logChange(sessionUser, body.year, body.sheet, row, 'Color B:K', anterior, encontrado.color);
  return jsonResponse({ ok: true, pintado: true, color: encontrado.color, origen: encontrado.origen });
}

function handleAvisosAction(action, body, sessionUser, sessionRole) {
  const routes = {
    avisosCrear: [function () { return handleAvisosCrear(body, sessionUser); }, 'AVISOS_CREAR_ERROR'],
    avisosListar: [function () { return handleAvisosListar(sessionUser); }, 'AVISOS_LISTAR_ERROR'],
    avisosMarcarLeidos: [function () { return handleAvisosMarcarLeidos(body, sessionUser); }, 'AVISOS_LEIDOS_ERROR'],
    recepcionPintarFila: [function () { return handleRecepcionPintarFila(body, sessionUser); }, 'RECEPCION_PINTAR_ERROR']
  };
  const route = Object.prototype.hasOwnProperty.call(routes, action) ? routes[action] : null;
  if (!route) return null;
  try {
    return route[0]();
  } catch (err) {
    return errorResponse(err.message, route[1]);
  }
}
