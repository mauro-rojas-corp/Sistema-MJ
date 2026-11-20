import { BACKEND_URL, API_TOKEN, STORAGE_KEY_SESSION } from './config';
import { normalizeUserRole, normalizeSearchText } from './utils';
import {
  enqueueUpdate,
  configureSaveQueue,
  onQueueStatusChange,
  hasPendingSaves,
  flushNow,
  getPendingUpdates,
} from './saveQueue';

// Desde v3 sólo se persisten metadatos no sensibles. Las filas completas se
// conservan exclusivamente en memoria porque pueden contener "Clave MH" y
// otros datos de clientes.
const LEGACY_STORAGE_CACHE_KEY = 'sheets_remote_persistent_cache_v2';
const LOCAL_STORAGE_CACHE_KEY = 'sheets_remote_metadata_cache_v3';
const SESSION_ERROR_CODES = new Set([
  'SESSION_REQUIRED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'PIN_SETUP_REQUIRED',
]);

const authFailureListeners = new Set();

class ApiError extends Error {
  constructor(message, data = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = data.code || 'API_ERROR';
    this.details = data;
    this.attemptsRemaining = data.attemptsRemaining;
    this.lockedUntil = data.lockedUntil;
  }
}

function removeLegacySensitiveCache() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_CACHE_KEY);
  } catch {
    // Si localStorage no está disponible, el caché tampoco puede persistir.
  }
}

function loadPersistentMetadata() {
  removeLegacySensitiveCache();
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn('Error al cargar metadatos persistentes:', error);
  }
  return null;
}

const persistentMetadata = loadPersistentMetadata();
const cache = {
  users: persistentMetadata?.users || null,
  years: persistentMetadata?.years || null,
  months: persistentMetadata?.months || {},
  read: {},
};

function saveMetadataCache() {
  try {
    localStorage.setItem(
      LOCAL_STORAGE_CACHE_KEY,
      JSON.stringify({
        users: cache.users,
        years: cache.years,
        months: cache.months,
      })
    );
  } catch (error) {
    console.warn('Error al guardar metadatos persistentes:', error);
  }
}

// Módulos que guardan datos propios (p. ej. Marcaciones) se enteran acá del
// cierre de sesión o del cambio de usuario para descartarlos.
const privateDataClearListeners = new Set();
export function onPrivateDataCleared(listener) {
  privateDataClearListeners.add(listener);
  return () => privateDataClearListeners.delete(listener);
}

function clearPrivateDataCache() {
  cache.read = {};
  privateDataClearListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* un módulo con error no debe frenar el cierre de sesión */
    }
  });
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user?.name) return null;
    return {
      token: String(parsed.token),
      user: {
        name: String(parsed.user.name),
        role: normalizeUserRole(parsed.user.role),
      },
      pinless: Boolean(parsed.pinless),
      mustChangePin: Boolean(parsed.mustChangePin),
      expiresAt: Number(parsed.expiresAt || 0),
      idleTimeoutMs: Number(parsed.idleTimeoutMs || 0),
    };
  } catch {
    return null;
  }
}

let currentSession = readStoredSession();

function normalizeSession(data, fallbackToken = '') {
  const token = String(data.sessionToken || fallbackToken || '');
  if (!token || !data.user?.name) {
    throw new ApiError('Respuesta de sesión incompleta', {
      code: 'INVALID_SESSION_RESPONSE',
    });
  }

  return {
    token,
    user: {
      name: String(data.user.name),
      role: normalizeUserRole(data.user.role),
    },
    pinless: Boolean(data.pinless),
    mustChangePin: Boolean(data.mustChangePin),
    expiresAt: Number(data.expiresAt || 0),
    idleTimeoutMs: Number(data.idleTimeoutMs || 0),
  };
}

function storeSession(session) {
  currentSession = session;
  try {
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
  } catch (error) {
    console.warn('No se pudo guardar la sesión local:', error);
  }
  return session;
}

function clearStoredSession() {
  currentSession = null;
  clearPrivateDataCache();
  try {
    localStorage.removeItem(STORAGE_KEY_SESSION);
  } catch {
    // La sesión en memoria queda eliminada aunque localStorage no responda.
  }
}

function notifyAuthFailure(error) {
  authFailureListeners.forEach((listener) => {
    try {
      listener(error);
    } catch (listenerError) {
      console.warn('Error en listener de autenticación:', listenerError);
    }
  });
}

// Reaplica sobre una lectura fresca las escrituras que siguen en cola para no
// rebobinar visualmente una edición optimista aún no confirmada.
function withPendingWrites(data, year, sheet) {
  const pendings = getPendingUpdates().filter(
    (update) => String(update.year) === String(year) && String(update.sheet) === String(sheet)
  );
  if (!pendings.length) return data;

  const rows = (data.rows || []).map((row) => ({ ...row }));
  pendings.forEach((update) => {
    const target = rows.find((row) => row._row === update.row);
    if (target) target[update.column] = update.value;
  });
  return { ...data, rows };
}

// Cuánto se espera una respuesta antes de darla por perdida. Sin esto, una
// petición que Apps Script acepta pero nunca contesta deja la app colgada:
// el login se quedaba en "Verificando…" para siempre.
const REQUEST_TIMEOUT_MS = 20000;

// Códigos HTTP que conviene reintentar: son fallos transitorios del lado de
// Google (sobrecarga, despliegue despertando, límite de cuota), no errores
// de la petición en sí.
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

// Error de transporte: la petición no llegó a completarse o la respuesta no
// es utilizable. Se distingue de ApiError, que es una respuesta válida del
// backend diciendo que algo salió mal (PIN incorrecto, token inválido...).
class TransportError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = 'TransportError';
    this.code = 'TRANSPORT_ERROR';
    this.status = status;
    this.retryable = retryable;
  }
}

function isNetworkFailure(error) {
  return (
    error.name === 'TypeError' ||
    !error.message ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('NetworkError') ||
    error.message.includes('Load failed')
  );
}

// Una sola petición, con timeout propio. AbortController (en vez de
// AbortSignal.timeout) para que funcione también en la WebView de Android.
async function fetchOnce(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const rawText = await response.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      // Apps Script contestó algo que no es JSON: casi siempre una página de
      // error o la pantalla de login de Google. Es transitorio si el HTTP lo
      // es; si no, se informa para poder distinguir el caso permanente
      // (despliegue inexistente, o "Quién tiene acceso" mal configurado).
      throw new TransportError(
        `El servidor respondió algo que no es JSON (HTTP ${response.status}).`,
        { status: response.status, retryable: true }
      );
    }

    // Respuesta JSON pero con HTTP de error: se respeta el criterio de arriba.
    if (!response.ok && RETRYABLE_HTTP_STATUS.has(response.status)) {
      throw new TransportError(
        `El servidor respondió con un error temporal (HTTP ${response.status}).`,
        { status: response.status, retryable: true }
      );
    }

    // A partir de acá la respuesta es del backend, no del transporte:
    // ok:false es una decisión suya (PIN incorrecto, sin permiso...) y NO
    // se reintenta. Reintentarla quemaría intentos del bloqueo por PIN.
    if (!data.ok) {
      throw new ApiError(data.error || 'Error desconocido del servidor', data);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new TransportError(
        `El servidor no respondió en ${Math.round(timeoutMs / 1000)} segundos.`,
        { retryable: true }
      );
    }
    if (isNetworkFailure(error)) {
      throw new TransportError('No se pudo conectar con el servidor.', {
        retryable: true,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, options = {}, retries = 3, delay = 400, timeoutMs = REQUEST_TIMEOUT_MS) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetchOnce(url, options, timeoutMs);
    } catch (error) {
      lastError = error;

      // Sólo se reintenta lo transitorio. Un ApiError (respuesta válida del
      // backend) sale de inmediato.
      if (!error.retryable || attempt === retries) break;

      // Espera creciente con una pizca de aleatoriedad, para no golpear
      // Apps Script con reintentos sincronizados.
      const wait = delay * 2 ** (attempt - 1) + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  // Se agotaron los intentos: mensaje accionable y sin exponer la URL del
  // despliegue, que antes se imprimía entera en pantalla.
  if (lastError instanceof TransportError) {
    throw new TransportError(
      `${lastError.message} Se reintentó ${retries} veces. ` +
      'Revisá tu conexión; si persiste, puede ser el despliegue de Apps Script.',
      { status: lastError.status, retryable: false }
    );
  }

  throw lastError;
}

function assertBackendConfig() {
  const missing = [];
  if (!BACKEND_URL) missing.push('VITE_BACKEND_URL');
  if (!API_TOKEN) missing.push('VITE_API_TOKEN');

  if (missing.length > 0) {
    throw new Error(
      `Configuración incompleta: falta definir ${missing.join(' y ')} en el entorno de compilación.`
    );
  }
}

// Todas las operaciones usan POST simple para Apps Script. Cuando existe una
// sesión, su token se adjunta automáticamente y nunca se toma el rol desde la UI.
// `retries: 1` para operaciones que no deben repetirse solas (una consulta
// a la IA que se cobra, un mensaje de WhatsApp que se envía).
async function request(body, { handleSessionFailure = true, retries = 3, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  assertBackendConfig();
  const payload = { ...body, token: API_TOKEN };
  if (!payload.sessionToken && currentSession?.token) {
    payload.sessionToken = currentSession.token;
  }

  try {
    return await fetchWithRetry(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    }, retries, 400, timeoutMs);
  } catch (error) {
    if (handleSessionFailure && SESSION_ERROR_CODES.has(error.code)) {
      clearStoredSession();
      notifyAuthFailure(error);
    }
    throw error;
  }
}

configureSaveQueue({ post: request });

function getUserName(item) {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object') return '';
  return String(
    item.name ?? item.user ?? item.USUARIO ?? item.Usuario ?? item.usuario ?? ''
  ).trim();
}

function isSameUser(left, right) {
  return normalizeSearchText(left) === normalizeSearchText(right);
}

const sheetDataListeners = new Set();
function notifySheetData(year, sheet, data) {
  sheetDataListeners.forEach((listener) => {
    try {
      listener({ year, sheet, data });
    } catch (error) {
      console.warn('onSheetData listener falló:', error);
    }
  });
}

export const api = {
  ping: () => request({ action: 'ping' }, { handleSessionFailure: false }),

  login: async (user, pin = '') => {
    const previousUser = currentSession?.user?.name || '';
    const data = await request(
      { action: 'login', user, pin },
      { handleSessionFailure: false }
    );
    const session = normalizeSession(data);
    if (previousUser && !isSameUser(previousUser, session.user.name)) {
      clearPrivateDataCache();
    }
    return storeSession(session);
  },

  setupPin: async (user, pin) => {
    clearStoredSession();
    const data = await request(
      { action: 'setupPin', user, pin },
      { handleSessionFailure: false }
    );
    return storeSession(normalizeSession(data));
  },

  changePin: async (currentPin, newPin) => {
    const data = await request({
      action: 'changePin',
      currentPin,
      newPin,
    });
    return storeSession(normalizeSession(data));
  },

  adminListUsers: async () => {
    const data = await request({ action: 'adminListUsers' });
    return Array.isArray(data.users) ? data.users : [];
  },

  adminResetPin: async (targetUser, tempPin) => {
    const data = await request({
      action: 'adminResetPin',
      targetUser,
      tempPin,
    });
    return data.user || null;
  },

  adminSetUserActive: async (targetUser, active) => {
    const data = await request({
      action: 'adminSetUserActive',
      targetUser,
      active: Boolean(active),
    });
    cache.users = null;
    saveMetadataCache();
    return data.user || null;
  },

  adminRevokeUserSessions: async (targetUser) => {
    const data = await request({
      action: 'adminRevokeUserSessions',
      targetUser,
    });
    return data.user || null;
  },

  validateSession: async ({ notifyOnFailure = true } = {}) => {
    if (!currentSession?.token) {
      throw new ApiError('Sesión requerida', { code: 'SESSION_REQUIRED' });
    }

    try {
      const data = await request(
        {
          action: 'session',
          sessionToken: currentSession.token,
        },
        { handleSessionFailure: notifyOnFailure }
      );
      return storeSession(normalizeSession(data, currentSession.token));
    } catch (error) {
      if (!notifyOnFailure && SESSION_ERROR_CODES.has(error.code)) {
        clearStoredSession();
      }
      throw error;
    }
  },

  logout: async () => {
    const token = currentSession?.token || '';
    try {
      if (token) {
        await request(
          { action: 'logout', sessionToken: token },
          { handleSessionFailure: false }
        );
      }
    } finally {
      clearStoredSession();
    }
  },

  clearSession: clearStoredSession,

  getStoredSession: () => {
    if (!currentSession) return null;
    return {
      ...currentSession,
      user: { ...currentSession.user },
    };
  },

  onAuthFailure: (listener) => {
    authFailureListeners.add(listener);
    return () => authFailureListeners.delete(listener);
  },

  // Avisa cuando la recarga en segundo plano de readClients() trae datos
  // nuevos: listener({ year, sheet, data }). Sin esto, el caché se
  // actualizaba pero React seguía mostrando la copia vieja.
  onSheetData: (listener) => {
    sheetDataListeners.add(listener);
    return () => sheetDataListeners.delete(listener);
  },

  listUsers: async (force = false) => {
    if (!force && cache.users) return cache.users.map(getUserName).filter(Boolean);

    const data = await request(
      { action: 'users' },
      { handleSessionFailure: false }
    );
    cache.users = data.users || [];
    saveMetadataCache();
    return cache.users.map(getUserName).filter(Boolean);
  },

  listYears: async (force = false) => {
    if (!force && cache.years) {
      request({ action: 'years' }).then((data) => {
        if (data.years) {
          cache.years = data.years;
          saveMetadataCache();
        }
      }).catch(() => {});
      return cache.years;
    }
    const data = await request({ action: 'years' });
    cache.years = data.years || [];
    saveMetadataCache();
    return cache.years;
  },

  listMonths: async (year, force = false) => {
    if (!force && cache.months[year]) {
      request({ action: 'months', year }).then((data) => {
        if (data.months) {
          cache.months[year] = data.months;
          saveMetadataCache();
        }
      }).catch(() => {});
      return cache.months[year];
    }
    const data = await request({ action: 'months', year });
    cache.months[year] = data.months || [];
    saveMetadataCache();
    return cache.months[year];
  },

  readClients: async (year, sheet, force = false) => {
    const key = `${year}_${sheet}`;
    if (!force && cache.read[key]) {
      request({ action: 'read', year, sheet }).then((data) => {
        if (data?.headers) {
          cache.read[key] = withPendingWrites(
            { headers: data.headers || [], rows: data.rows || [] },
            year,
            sheet
          );
          notifySheetData(year, sheet, cache.read[key]);
        }
      }).catch(() => {});
      return cache.read[key];
    }

    const data = await request({ action: 'read', year, sheet });
    cache.read[key] = withPendingWrites(
      { headers: data.headers || [], rows: data.rows || [] },
      year,
      sheet
    );
    return cache.read[key];
  },

  updateCell: async ({ year, sheet, row, column, value }) => {
    const key = `${year}_${sheet}`;
    if (cache.read[key]) {
      const targetRow = cache.read[key].rows.find((rowItem) => rowItem._row === row);
      if (targetRow) targetRow[column] = value;
    }

    return enqueueUpdate({ year, sheet, row, column, value });
  },

  onSyncStatusChange: onQueueStatusChange,
  hasPendingSaves,
  flushPendingSaves: flushNow,

  createClient: async ({ year, sheet, values }) => {
    const response = await request({ action: 'create', year, sheet, values });
    const key = `${year}_${sheet}`;

    if (response.row && cache.read[key]) {
      cache.read[key].rows.unshift({ ...values, _row: response.row });
    } else {
      delete cache.read[key];
    }
    return response;
  },

  // Preferencias del usuario que lo siguen en cualquier dispositivo
  // (AppsScript-Preferencias.gs): ambientación por época y animación.
  preferencias: {
    obtener: async () => {
      const data = await request({ action: 'preferenciasObtener' });
      return { ambientacion: data.ambientacion || 'ninguna', animacion: data.animacion !== false };
    },
    guardar: (cambios) => request({ action: 'preferenciasGuardar', ...cambios }),
    // Del equipo (iguales para todos): personas excluidas de la asignación.
    equipo: async () => {
      const data = await request({ action: 'preferenciasEquipoObtener' });
      return { excluidosAsignacion: Array.isArray(data.excluidosAsignacion) ? data.excluidosAsignacion : [] };
    },
    guardarEquipo: (excluidosAsignacion) => request({ action: 'preferenciasEquipoGuardar', excluidosAsignacion }),
  },

  // Libros IVA de compras y ventas importados de SIGA (AppsScript-Libros.gs).
  // guardar() con un libro ya cargado (mismo cliente + mes + tipo) falla con
  // code LIBRO_EXISTE y error.details.existente; se repite con reemplazar.
  // Lectura de documentos con IA (AppsScript-Lectura.gs). Sin reintentos:
  // cada intento es una consulta paga.
  lectura: {
    documento: ({ nombre, tipo, base64, texto, contexto }) =>
      request({ action: 'lecturaDocumento', nombre, tipo, base64, texto, contexto }, { retries: 1, timeoutMs: 180000 }),
  },
  comprobantes: {
    listar: async (ruc = '') => {
      const data = await request({ action: 'comprobantesListar', ruc });
      return Array.isArray(data.registros) ? data.registros : [];
    },
    leer: async (ruc, periodo) => {
      const data = await request({ action: 'comprobantesLeer', ruc, periodo });
      return data.registro;
    },
    guardar: (datos) => request({ action: 'comprobantesGuardar', ...datos }),
    eliminar: (ruc, periodo, id) => request({ action: 'comprobantesEliminar', ruc, periodo, id }),
    // Guarda varios de una vez. Si el Apps Script publicado es anterior y no
    // tiene esta acción, los guarda de a uno (comprobantesGuardar), contando
    // los repetidos igual que la importación en bloque.
    importar: async (ruc, cliente, comprobantes) => {
      try {
        return await request({ action: 'comprobantesImportar', ruc, cliente, comprobantes });
      } catch (e) {
        if (e.code !== 'UNKNOWN_ACTION') throw e;
      }
      let agregados = 0;
      let repetidos = 0;
      let invalidos = 0;
      const meses = new Map();
      for (const c of comprobantes) {
        try {
          const r = await request({ action: 'comprobantesGuardar', ruc, cliente, comprobante: c });
          agregados += 1;
          const p = r.periodo || String(c.fecha || '').slice(0, 7);
          meses.set(p, (meses.get(p) || 0) + 1);
        } catch (e) {
          if (e.code === 'COMPROBANTE_DUPLICADO') repetidos += 1;
          else if (e.code === 'COMPROBANTE_FECHA' || e.code === 'COMPROBANTE_VACIO') invalidos += 1;
          else throw e;
        }
      }
      return { ok: true, agregados, repetidos, invalidos, meses: [...meses].map(([periodo, n]) => ({ periodo, agregados: n })), deAUno: true };
    },
  },
  libros: {
    listar: async (ruc = '') => {
      const data = await request({ action: 'librosListar', ruc });
      return Array.isArray(data.libros) ? data.libros : [];
    },
    leer: async (id) => {
      const data = await request({ action: 'librosLeer', id });
      return data.libro;
    },
    guardar: (libro) => request({ action: 'librosGuardar', ...libro }),
    eliminar: (id) => request({ action: 'librosEliminar', id }),
  },

    // Sugerencias para mejorar el sistema (AppsScript-Sugerencias.gs). Cada
  // usuario ve las suyas; ADMINISTRADOR y SUPERUSUARIO ven todas.
  sugerencias: {
    listar: async () => {
      const data = await request({ action: 'sugerenciasListar' });
      return {
        admin: data.admin === true,
        sugerencias: Array.isArray(data.sugerencias) ? data.sugerencias : [],
        nuevas: Number(data.nuevas) || 0,
      };
    },
    crear: ({ tipo, texto, seccion }) => request({ action: 'sugerenciasCrear', tipo, texto, seccion }),
    cambiarEstado: (ids, estado) => request({ action: 'sugerenciasEstado', ids, estado }),
  },

  // Buzón: avisos de documentación recibida para el Encargado de cada
  // cliente (AppsScript-Avisos.gs). Cada usuario ve y marca sólo los suyos.
  avisos: {
    listar: async () => {
      const data = await request({ action: 'avisosListar' });
      return {
        avisos: Array.isArray(data.avisos) ? data.avisos : [],
        noLeidos: Number(data.noLeidos) || 0,
      };
    },
    crear: (aviso) => request({ action: 'avisosCrear', ...aviso }),
    marcarLeidos: (ids) => request({ action: 'avisosMarcarLeidos', ids }),
    marcarTodosLeidos: () => request({ action: 'avisosMarcarLeidos', todos: true }),
  },

  // Al registrar la recepción de documentación, pinta la fila del cliente
  // (B a K) con el color de su Vencimiento (columna A). Resuelve
  // { pintado, color?, motivo? }.
  recepcion: {
    pintarFila: ({ year, sheet, row }) =>
      request({ action: 'recepcionPintarFila', year, sheet, row }),
  },

  // Módulo Vencimientos IVA. Las liquidaciones se identifican por período
  // fiscal (AAAA-MM) y RUC sin DV; la lista de clientes es la de la planilla.
  iva: {
    load: (periodos) => request({ action: 'ivaLoad', periodos }),
    getDoc: async (periodo, ruc) => {
      const data = await request({ action: 'ivaGetDoc', periodo, ruc });
      return data.doc || null;
    },
    saveDoc: (periodo, ruc, data, resumen) =>
      request({ action: 'ivaSaveDoc', periodo, ruc, data, resumen }),
    saveCliente: (ruc, data) => request({ action: 'ivaSaveCliente', ruc, data }),
    saveConfig: (data) => request({ action: 'ivaSaveConfig', data }),
  },

  // Asistente con IA (AppsScript-Agente.gs). El servidor guarda la clave y
  // llama a la API de Claude; las herramientas corren en la app.
  agente: {
    estado: () => request({ action: 'agenteEstado' }),
    mensaje: ({ system, tools, messages }) =>
      request({ action: 'agenteMensaje', system, tools, messages }, { retries: 1, timeoutMs: 90000 }),
  },

  // Whaticket (AppsScript-Whaticket.gs): ficha IVA al cliente o al grupo
  // contable, y el chat del cliente dentro del sistema. El token vive en el
  // servidor; envíos sin reintentos automáticos para no duplicar mensajes.
  whaticket: {
    enviar: ({ destino = 'cliente', numero, texto, imagen, nombreArchivo, cliente, ruc, periodo, forzar = false }) =>
      request(
        { action: 'whaticketEnviar', destino, numero, texto, imagen, nombreArchivo, cliente, ruc, periodo, forzar },
        { retries: 1, timeoutMs: 90000 }
      ),
    chat: ({ numero, cursor, cursorId }) => request({ action: 'whaticketChat', numero, cursor, cursorId }, { timeoutMs: 30000 }),
    responder: ({ numero, texto, cliente, ruc }) =>
      request({ action: 'whaticketResponder', numero, texto, cliente, ruc }, { retries: 1, timeoutMs: 60000 }),
  },

  // Lotes CDC para descarga de XML (AppsScript-CdcLotes.gs). El lote lo crea
  // el recolector de Marangatu en la extensión; acá se registra en el
  // backend y se listan los lotes conocidos.
  cdc: {
    crearLote: async (lote) => {
      const data = await request({
        action: 'cdcCrearLote',
        loteLocalId: lote.id,
        fuente: lote.fuente,
        cdcs: lote.cdcs,
      });
      return data.lote || null;
    },
    listarLotes: async () => {
      const data = await request({ action: 'cdcListarLotes' });
      return Array.isArray(data.lotes) ? data.lotes : [];
    },
    // Nexo worker -> sistema: los XML descargados quedan en Drive y la
    // pestaña XML / KuDE los trae por lote (ítems y contenido).
    obtenerItems: async (loteId) => {
      const data = await request({ action: 'cdcObtenerItems', loteId });
      return Array.isArray(data.items) ? data.items : [];
    },
    obtenerXml: async (loteId, cdc) => {
      const data = await request({ action: 'cdcObtenerXml', loteId, cdc });
      return data.contenido || '';
    },
    // Registra un XML descargado por la vía directa: queda en Drive, el
    // ítem pasa a «descargado» y el lote se cierra si no quedan pendientes.
    subirXml: async (loteId, cdc, contenido) => {
      const data = await request({ action: 'cdcSubirXml', loteId, cdc, contenido });
      return data;
    },
    // Crea un lote nuevo en_cola con los CDCs reintentables del lote
    // (captcha_fallido / error_descarga). No descarga nada por sí solo.
    reintentarFallidos: async (loteId) => {
      const data = await request({ action: 'cdcReintentarFallidos', loteId });
      return data;
    },
    // Borra el lote y sus ítems del backend (no toca Drive). Para limpiar
    // la cola y registros viejos desde Configuración.
    borrarLote: async (loteId) => {
      const data = await request({ action: 'cdcBorrarLote', loteId });
      return data;
    },
  },

  // Marcaciones: horarios y datos procesados/ajustes mensuales se guardan en el servidor;
  // el archivo .dat original se procesa localmente y no se envía.
  marcaciones: {
    getConfig: async () => {
      const data = await request({ action: 'marcacionesGetConfig' });
      return data.config || null;
    },
    saveConfig: (data) => request({ action: 'marcacionesSaveConfig', data }),
    getMonths: async () => {
      const data = await request({ action: 'marcacionesGetMonths' });
      return data.months || [];
    },
    getMonth: async (month) => {
      const data = await request({ action: 'marcacionesGetMonth', month });
      return data.data || null;
    },
    saveMonth: (month, data) => request({ action: 'marcacionesSaveMonth', month, data }),
  },

  clearCache: () => {
    cache.users = null;
    cache.years = null;
    cache.months = {};
    cache.read = {};
    try {
      localStorage.removeItem(LOCAL_STORAGE_CACHE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_CACHE_KEY);
    } catch (error) {
      console.warn('Error al borrar caché local:', error);
    }
  },
};
