/**
 * MÓDULO SUGERENCIAS - archivo aparte del backend de Control Clientes.
 *
 * Cualquier usuario deja sugerencias para mejorar el sistema (recomendación,
 * fallo, consejo u otro). ADMINISTRADOR y SUPERUSUARIO ven todas, con el
 * nombre de quien la escribió, y las marcan como vistas o resueltas. Los
 * demás ven sólo las suyas y en qué estado están.
 *
 * Instalación en el proyecto de Apps Script:
 *   1. Archivo nuevo (+ > Secuencia de comandos) llamado "Sugerencias" y
 *      pegar este contenido completo.
 *   2. No hace falta tocar Code.gs: las acciones sugerencias* llegan por
 *      handleAvisosAction (AppsScript-Avisos.gs), que ya está en doPost.
 *   3. Implementar > Administrar implementaciones > editar > Nueva versión.
 *
 * Hoja "Sugerencias" en la planilla de administración (se crea sola), una
 * fila por sugerencia. Usa funciones de Code.gs: getAdminSpreadsheet,
 * canonicalUserName, normalizeRole, jsonResponse y errorResponse.
 */

const SUGERENCIAS_SHEET_NAME = 'Sugerencias';
const SUGERENCIAS_HEADERS = [
  'ID', 'Creada', 'Usuario', 'Rol', 'Tipo', 'Sección', 'Texto', 'Estado', 'Revisada por', 'Revisada el'
];
const SUGERENCIAS_COL_ESTADO = 8;
const SUGERENCIAS_TIPOS = ['recomendacion', 'fallo', 'consejo', 'otro'];
const SUGERENCIAS_ESTADOS = ['nueva', 'vista', 'resuelta'];
const SUGERENCIAS_MAX_TEXTO = 1500;
const SUGERENCIAS_MAX_FILAS_LEIDAS = 3000;
const SUGERENCIAS_MAX_DEVUELTAS = 300;
const SUGERENCIAS_MAX_POR_DIA = 30; // por usuario, para frenar envíos repetidos

function ensureSugerenciasSheet() {
  const ss = getAdminSpreadsheet();
  let sheet = ss.getSheetByName(SUGERENCIAS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SUGERENCIAS_SHEET_NAME);
    // Todo como texto: Sheets no convierte fechas ni números escritos.
    sheet.getRange(1, 1, sheet.getMaxRows(), SUGERENCIAS_HEADERS.length).setNumberFormat('@');
    sheet.getRange(1, 1, 1, SUGERENCIAS_HEADERS.length).setValues([SUGERENCIAS_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(7, 420);
  }
  return sheet;
}

function sugerenciasEsAdmin_(sessionRole) {
  const rol = normalizeRole(sessionRole);
  return rol === 'ADMINISTRADOR' || rol === 'SUPERUSUARIO';
}

function sugerenciasTexto_(value, max) {
  if (value instanceof Date) return value.toISOString();
  return String(value === null || value === undefined ? '' : value).trim().slice(0, max);
}

function sugerenciasLeer_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const desde = Math.max(2, lastRow - SUGERENCIAS_MAX_FILAS_LEIDAS + 1);
  const values = sheet.getRange(desde, 1, lastRow - desde + 1, SUGERENCIAS_HEADERS.length).getValues();
  return values.map(function (r, i) {
    const estado = sugerenciasTexto_(r[7], 20).toLowerCase();
    return {
      fila: desde + i,
      id: sugerenciasTexto_(r[0], 60),
      creada: sugerenciasTexto_(r[1], 40),
      usuario: sugerenciasTexto_(r[2], 120),
      rol: sugerenciasTexto_(r[3], 40),
      tipo: sugerenciasTexto_(r[4], 20).toLowerCase(),
      seccion: sugerenciasTexto_(r[5], 60),
      texto: sugerenciasTexto_(r[6], SUGERENCIAS_MAX_TEXTO),
      estado: SUGERENCIAS_ESTADOS.indexOf(estado) >= 0 ? estado : 'nueva',
      revisadaPor: sugerenciasTexto_(r[8], 120),
      revisadaEl: sugerenciasTexto_(r[9], 40)
    };
  }).filter(function (s) { return s.id; });
}

function sugerenciasPublica_(s) {
  return {
    id: s.id,
    creada: s.creada,
    usuario: s.usuario,
    rol: s.rol,
    tipo: s.tipo,
    seccion: s.seccion,
    texto: s.texto,
    estado: s.estado,
    revisadaPor: s.revisadaPor,
    revisadaEl: s.revisadaEl
  };
}

function handleSugerenciasCrear(body, sessionUser, sessionRole) {
  const tipo = sugerenciasTexto_(body.tipo, 20).toLowerCase();
  if (SUGERENCIAS_TIPOS.indexOf(tipo) < 0) {
    return errorResponse('Elegí el tipo de sugerencia', 'SUGERENCIA_TIPO');
  }
  const texto = String(body.texto === null || body.texto === undefined ? '' : body.texto).trim();
  if (texto.length < 3) return errorResponse('Escribí tu sugerencia', 'SUGERENCIA_VACIA');
  if (texto.length > SUGERENCIAS_MAX_TEXTO) {
    return errorResponse('La sugerencia es muy larga (máximo ' + SUGERENCIAS_MAX_TEXTO + ' caracteres)', 'SUGERENCIA_LARGA');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return errorResponse('Las sugerencias están ocupadas, intentá de nuevo', 'SUGERENCIAS_LOCK_TIMEOUT');
  }
  try {
    const sheet = ensureSugerenciasSheet();
    const haceUnDia = Date.now() - 24 * 60 * 60 * 1000;
    const usuario = canonicalUserName(sessionUser);
    const hoy = sugerenciasLeer_(sheet).filter(function (s) {
      return canonicalUserName(s.usuario) === usuario && Date.parse(s.creada) >= haceUnDia;
    }).length;
    if (hoy >= SUGERENCIAS_MAX_POR_DIA) {
      return errorResponse('Llegaste al máximo de sugerencias por hoy. Probá mañana.', 'SUGERENCIAS_LIMITE');
    }
    const id = 'sg-' + Utilities.getUuid();
    const fila = [
      id,
      new Date().toISOString(),
      sessionUser,
      normalizeRole(sessionRole) || '',
      tipo,
      sugerenciasTexto_(body.seccion, 60),
      texto,
      'nueva',
      '',
      ''
    ].map(function (v) { return String(v); });
    const destino = sheet.getRange(sheet.getLastRow() + 1, 1, 1, SUGERENCIAS_HEADERS.length);
    destino.setNumberFormat('@');
    destino.setValues([fila]);
    return jsonResponse({ ok: true, id: id });
  } finally {
    lock.releaseLock();
  }
}

// Administradores: todas. Resto: sólo las propias.
function handleSugerenciasListar(sessionUser, sessionRole) {
  const admin = sugerenciasEsAdmin_(sessionRole);
  const usuario = canonicalUserName(sessionUser);
  const lista = sugerenciasLeer_(ensureSugerenciasSheet()).filter(function (s) {
    return admin || canonicalUserName(s.usuario) === usuario;
  });
  lista.reverse(); // más recientes primero
  return jsonResponse({
    ok: true,
    admin: admin,
    sugerencias: lista.slice(0, SUGERENCIAS_MAX_DEVUELTAS).map(sugerenciasPublica_),
    nuevas: admin ? lista.filter(function (s) { return s.estado === 'nueva'; }).length : 0
  });
}

// body.ids + body.estado ('vista' | 'resuelta' | 'nueva'). Sólo administradores.
function handleSugerenciasEstado(body, sessionUser, sessionRole) {
  if (!sugerenciasEsAdmin_(sessionRole)) {
    return errorResponse('Sólo un administrador puede cambiar el estado', 'FORBIDDEN');
  }
  const estado = sugerenciasTexto_(body.estado, 20).toLowerCase();
  if (SUGERENCIAS_ESTADOS.indexOf(estado) < 0) return errorResponse('Estado no válido', 'SUGERENCIA_ESTADO');
  const ids = {};
  (Array.isArray(body.ids) ? body.ids : []).forEach(function (id) { ids[String(id)] = true; });
  if (!Object.keys(ids).length) return jsonResponse({ ok: true, cambiadas: 0 });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return errorResponse('Las sugerencias están ocupadas, intentá de nuevo', 'SUGERENCIAS_LOCK_TIMEOUT');
  }
  let cambiadas = 0;
  try {
    const sheet = ensureSugerenciasSheet();
    const ahora = new Date().toISOString();
    sugerenciasLeer_(sheet).forEach(function (s) {
      if (!ids[s.id] || s.estado === estado) return;
      // "vista" no pisa una "resuelta" (al abrir la lista se marcan vistas).
      if (estado === 'vista' && s.estado === 'resuelta') return;
      const celdas = sheet.getRange(s.fila, SUGERENCIAS_COL_ESTADO, 1, 3);
      celdas.setNumberFormat('@');
      celdas.setValues([[estado, estado === 'nueva' ? '' : String(sessionUser), estado === 'nueva' ? '' : ahora]]);
      cambiadas++;
    });
  } finally {
    lock.releaseLock();
  }
  return jsonResponse({ ok: true, cambiadas: cambiadas });
}

function handleSugerenciasAction(action, body, sessionUser, sessionRole) {
  const routes = {
    sugerenciasCrear: [function () { return handleSugerenciasCrear(body, sessionUser, sessionRole); }, 'SUGERENCIAS_CREAR_ERROR'],
    sugerenciasListar: [function () { return handleSugerenciasListar(sessionUser, sessionRole); }, 'SUGERENCIAS_LISTAR_ERROR'],
    sugerenciasEstado: [function () { return handleSugerenciasEstado(body, sessionUser, sessionRole); }, 'SUGERENCIAS_ESTADO_ERROR']
  };
  const route = Object.prototype.hasOwnProperty.call(routes, action) ? routes[action] : null;
  if (!route) return null;
  try {
    return route[0]();
  } catch (err) {
    return errorResponse(err.message, route[1]);
  }
}
