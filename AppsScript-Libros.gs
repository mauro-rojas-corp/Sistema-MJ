/**
 * MÓDULO LIBROS IVA - archivo aparte del backend de Control Clientes.
 *
 * Guarda los libros de COMPRAS y VENTAS que se exportan de SIGA (Excel) e
 * importan desde la app, uno por cliente + mes + tipo, para consultarlos
 * después. La app lee el Excel y manda los comprobantes ya ordenados.
 *
 * Instalación en el proyecto de Apps Script:
 *   1. Archivo nuevo (+ > Secuencia de comandos) llamado "Libros" y pegar
 *      este contenido completo.
 *   2. No hace falta tocar Code.gs: las acciones libros* llegan por
 *      handleAvisosAction (AppsScript-Avisos.gs), que ya está en doPost.
 *   3. Implementar > Administrar implementaciones > editar > Nueva versión.
 *
 * Hoja "Libros IVA" en la planilla de administración (se crea sola): una fila
 * por libro. Las columnas 1 a 10 son el índice; el detalle de comprobantes
 * (JSON) va desde la columna 11 repartido en celdas de hasta 45.000
 * caracteres (Google admite 50.000 por celda).
 * Todos los usuarios ven e importan; sólo ADMINISTRADOR y SUPERUSUARIO borran.
 * Usa funciones de Code.gs: getAdminSpreadsheet, normalizeRole, jsonResponse
 * y errorResponse.
 */

const LIBROS_SHEET_NAME = 'Libros IVA';
const LIBROS_HEADERS = [
  'ID', 'Tipo', 'RUC cliente', 'Cliente', 'Período', 'Archivo', 'Comprobantes',
  'Totales', 'Importado por', 'Importado el'
];
const LIBROS_COL_DATOS = LIBROS_HEADERS.length + 1; // 11
const LIBROS_TROZO = 45000;
const LIBROS_MAX_COMPROBANTES = 5000;
const LIBROS_MAX_JSON = 2 * 1000 * 1000; // ~2 MB de detalle por libro
const LIBROS_TIPOS = ['compras', 'ventas'];

function ensureLibrosSheet() {
  const ss = getAdminSpreadsheet();
  let sheet = ss.getSheetByName(LIBROS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LIBROS_SHEET_NAME);
    sheet.getRange(1, 1, 1, LIBROS_HEADERS.length).setValues([LIBROS_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function librosEsAdmin_(sessionRole) {
  const rol = normalizeRole(sessionRole);
  return rol === 'ADMINISTRADOR' || rol === 'SUPERUSUARIO';
}

function librosTexto_(v, max) {
  if (v instanceof Date) return v.toISOString();
  return String(v === null || v === undefined ? '' : v).trim().slice(0, max || 500);
}

// Índice de todos los libros (sin el detalle).
function librosLeerIndice_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, LIBROS_HEADERS.length).getValues();
  const out = [];
  values.forEach(function (r, i) {
    const id = librosTexto_(r[0], 80);
    if (!id) return;
    let totales = {};
    try { totales = JSON.parse(String(r[7] || '{}')) || {}; } catch (e) { totales = {}; }
    out.push({
      fila: i + 2,
      id: id,
      tipo: librosTexto_(r[1], 20),
      ruc: librosTexto_(r[2], 30).replace(/\D/g, ''),
      cliente: librosTexto_(r[3], 200),
      periodo: librosTexto_(r[4], 10),
      archivo: librosTexto_(r[5], 200),
      cantidad: Number(r[6]) || 0,
      totales: totales,
      importadoPor: librosTexto_(r[8], 120),
      importadoEl: librosTexto_(r[9], 40)
    });
  });
  return out;
}

function librosPublico_(l) {
  return {
    id: l.id, tipo: l.tipo, ruc: l.ruc, cliente: l.cliente, periodo: l.periodo,
    archivo: l.archivo, cantidad: l.cantidad, totales: l.totales,
    importadoPor: l.importadoPor, importadoEl: l.importadoEl
  };
}

// body.ruc opcional: sólo los libros de ese cliente.
function handleLibrosListar(body) {
  const ruc = librosTexto_(body.ruc, 30).replace(/\D/g, '');
  const lista = librosLeerIndice_(ensureLibrosSheet())
    .filter(function (l) { return !ruc || l.ruc === ruc; })
    .map(librosPublico_);
  return jsonResponse({ ok: true, libros: lista });
}

function handleLibrosLeer(body) {
  const id = librosTexto_(body.id, 80);
  const sheet = ensureLibrosSheet();
  const libro = librosLeerIndice_(sheet).filter(function (l) { return l.id === id; })[0];
  if (!libro) return errorResponse('No se encontró ese libro', 'LIBRO_NO_EXISTE');
  const ancho = Math.max(sheet.getLastColumn() - LIBROS_COL_DATOS + 1, 1);
  const trozos = sheet.getRange(libro.fila, LIBROS_COL_DATOS, 1, ancho).getValues()[0];
  let datos = null;
  try { datos = JSON.parse(trozos.map(function (t) { return String(t || ''); }).join('')); } catch (e) { datos = null; }
  if (!datos) return errorResponse('El detalle de ese libro está dañado: volvé a importarlo', 'LIBRO_DANADO');
  const out = librosPublico_(libro);
  out.datos = datos;
  return jsonResponse({ ok: true, libro: out });
}

// body: { tipo, ruc, cliente, periodo, archivo, totales, datos, reemplazar }
// datos = { columnas: [...], filas: [[...], ...] } tal como lo arma la app.
function handleLibrosGuardar(body, sessionUser) {
  const tipo = librosTexto_(body.tipo, 20).toLowerCase();
  if (LIBROS_TIPOS.indexOf(tipo) < 0) return errorResponse('Tipo de libro no válido', 'LIBRO_TIPO');
  const ruc = librosTexto_(body.ruc, 30).replace(/\D/g, '');
  if (!ruc) return errorResponse('Elegí el cliente del libro', 'LIBRO_CLIENTE');
  const periodo = librosTexto_(body.periodo, 10);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return errorResponse('Mes o año no válido', 'LIBRO_PERIODO');
  const datos = body.datos;
  if (!datos || !Array.isArray(datos.columnas) || !Array.isArray(datos.filas)) {
    return errorResponse('El libro no tiene comprobantes', 'LIBRO_VACIO');
  }
  if (datos.filas.length > LIBROS_MAX_COMPROBANTES) {
    return errorResponse('El libro tiene demasiados comprobantes (máximo ' + LIBROS_MAX_COMPROBANTES + ')', 'LIBRO_GRANDE');
  }
  const json = JSON.stringify({ columnas: datos.columnas, filas: datos.filas, resumen: Array.isArray(datos.resumen) ? datos.resumen : [] });
  if (json.length > LIBROS_MAX_JSON) return errorResponse('El libro es demasiado grande', 'LIBRO_GRANDE');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return errorResponse('Los libros están ocupados, intentá de nuevo', 'LIBROS_LOCK_TIMEOUT');
  try {
    const sheet = ensureLibrosSheet();
    const existente = librosLeerIndice_(sheet).filter(function (l) {
      return l.tipo === tipo && l.ruc === ruc && l.periodo === periodo;
    })[0];
    if (existente && body.reemplazar !== true) {
      return jsonResponse({ ok: false, code: 'LIBRO_EXISTE', error: 'Ya hay un libro cargado para ese cliente y mes', existente: librosPublico_(existente) });
    }
    const id = existente ? existente.id : 'lb-' + Utilities.getUuid();
    const fila = existente ? existente.fila : sheet.getLastRow() + 1;
    const indice = [
      id, tipo, ruc, librosTexto_(body.cliente, 200), periodo, librosTexto_(body.archivo, 200),
      String(datos.filas.length), JSON.stringify(body.totales || {}).slice(0, 5000),
      String(sessionUser), new Date().toISOString()
    ];
    const trozos = [];
    for (let i = 0; i < json.length; i += LIBROS_TROZO) trozos.push(json.slice(i, i + LIBROS_TROZO));
    // Al reemplazar se limpian los trozos viejos que sobren.
    const anchoViejo = Math.max(sheet.getLastColumn() - LIBROS_COL_DATOS + 1, 0);
    if (existente && anchoViejo > 0) sheet.getRange(fila, LIBROS_COL_DATOS, 1, anchoViejo).clearContent();
    const todo = indice.concat(trozos);
    const rango = sheet.getRange(fila, 1, 1, todo.length);
    rango.setNumberFormat('@'); // texto: Sheets no convierte números ni fechas
    rango.setValues([todo.map(function (v) { return String(v); })]);
    return jsonResponse({ ok: true, id: id, reemplazado: !!existente });
  } finally {
    lock.releaseLock();
  }
}

function handleLibrosEliminar(body, sessionRole) {
  if (!librosEsAdmin_(sessionRole)) return errorResponse('Sólo un administrador puede eliminar libros', 'FORBIDDEN');
  const id = librosTexto_(body.id, 80);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return errorResponse('Los libros están ocupados, intentá de nuevo', 'LIBROS_LOCK_TIMEOUT');
  try {
    const sheet = ensureLibrosSheet();
    const libro = librosLeerIndice_(sheet).filter(function (l) { return l.id === id; })[0];
    if (!libro) return errorResponse('No se encontró ese libro', 'LIBRO_NO_EXISTE');
    sheet.deleteRow(libro.fila);
    return jsonResponse({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function handleLibrosAction(action, body, sessionUser, sessionRole) {
  const routes = {
    librosListar: [function () { return handleLibrosListar(body); }, 'LIBROS_LISTAR_ERROR'],
    librosLeer: [function () { return handleLibrosLeer(body); }, 'LIBROS_LEER_ERROR'],
    librosGuardar: [function () { return handleLibrosGuardar(body, sessionUser); }, 'LIBROS_GUARDAR_ERROR'],
    librosEliminar: [function () { return handleLibrosEliminar(body, sessionRole); }, 'LIBROS_ELIMINAR_ERROR']
  };
  const route = Object.prototype.hasOwnProperty.call(routes, action) ? routes[action] : null;
  if (!route) return null;
  try {
    return route[0]();
  } catch (err) {
    return errorResponse(err.message, route[1]);
  }
}
