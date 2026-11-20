// Sesión y pestaña de trabajo de Marangatu: lado service worker.
//
// Se carga con importScripts(..., 'sesionBg.js', 'descargaBg.js') desde
// background.js y comparte su ámbito global (LOGIN_URL, MARANGATU_HOST,
// ALLOWED_APP_ORIGINS, getVerifiedSenderOrigin; y de descargaBg.js: leerJob,
// cancelarDescarga, guardarJob, dormir, puertosApp, DESCARGA_ESTADO_KEY). Todo se
// usa recién cuando llega un evento, así que el orden de carga no importa.
//
// Resuelve cuatro cosas:
//  1. UNA pestaña de trabajo: en vez de abrir un login nuevo por cada acción, se
//     reutiliza la pestaña de Marangatu que ya existe.
//  2. SESIÓN LIMPIA: antes de entrar con un cliente se cierra la sesión que
//     hubiera (Marangatu comparte la sesión entre pestañas: dejar la de otro
//     cliente abierta mezcla clientes).
//  3. CONTEXTO COMPARTIDO: la app informa en qué cliente trabaja (APP_CONTEXTO) y
//     las pestañas de Marangatu informan el estado de la sesión (PANEL_SESION).
//     Ambos lados reciben el mismo estado por el puerto 'eku-app' (la app) y
//     'eku-panel' (el panel flotante dentro de Marangatu).
//  4. UNA SOLA TAREA a la vez, y sólo la pestaña dueña puede actuar sobre ella
//     (ETAPA_PERMISO).
// Las credenciales nunca se guardan.

const CONTEXTO_KEY = 'ekuContexto';
const SESION_KEY = 'ekuSesion';
const PESTANA_KEY = 'ekuPestanaTrabajo';
const AVISO_KEY = 'ekuAviso';
// Cliente con el que la extensión inició la sesión ({ ruc, ts }).
const CLIENTE_KEY = 'ekuClienteSesion';
const INICIO_URL = 'https://marangatu.set.gov.py/eset/';
const AVISO_TTL_MS = 90 * 1000;
const MARANGATU_MATCH = 'https://marangatu.set.gov.py/*';

const puertosPanel = new Set();

const esUrlMarangatu = (u) => {
  try { return new URL(u).hostname === MARANGATU_HOST; } catch { return false; }
};
const enRutaLogin = (u) => {
  try { return new URL(u).pathname.toLowerCase().includes('/login'); } catch { return false; }
};

// --- Estado compartido (contexto de la app, sesión, aviso) ----------------------

async function extrasDeEstado() {
  const d = await chrome.storage.session.get([CONTEXTO_KEY, SESION_KEY, AVISO_KEY]);
  const aviso = d[AVISO_KEY];
  return {
    contexto: d[CONTEXTO_KEY] || null,
    sesion: d[SESION_KEY] || null,
    aviso: aviso && Date.now() - aviso.ts < AVISO_TTL_MS ? aviso.texto : '',
  };
}

// Guarda y reparte el estado (tarea + contexto + sesión + aviso) a la app, al
// panel y a quien lo lea desde chrome.storage.session.
async function emitirEstado(estado) {
  const final = { ...estado, ...(await extrasDeEstado()) };
  await chrome.storage.session.set({ [DESCARGA_ESTADO_KEY]: final });
  for (const p of [...puertosApp, ...puertosPanel]) {
    try { p.postMessage({ tipo: 'estado', estado: final }); } catch { puertosApp.delete(p); puertosPanel.delete(p); }
  }
  return final;
}

async function republicarExtras() {
  const d = await chrome.storage.session.get(DESCARGA_ESTADO_KEY);
  await emitirEstado(d[DESCARGA_ESTADO_KEY] || { activo: false });
}

async function publicarAviso(texto) {
  await chrome.storage.session.set({ [AVISO_KEY]: { texto: String(texto || '').slice(0, 300), ts: Date.now() } });
  await republicarExtras();
}

// Cliente en el que trabaja la app. null/vacío = ninguno.
async function guardarContexto(msg) {
  const ruc = String((msg && msg.ruc) || '').replace(/\D/g, '').slice(0, 12);
  if (!ruc) {
    await chrome.storage.session.remove(CONTEXTO_KEY);
  } else {
    await chrome.storage.session.set({ [CONTEXTO_KEY]: { ruc, nombre: String(msg.nombre || '').slice(0, 120), ts: Date.now() } });
  }
  await republicarExtras();
}

// Estado de la sesión de Marangatu que informa una pestaña.
async function guardarSesion(s, tabId) {
  const rucs = Array.isArray(s.rucs) ? s.rucs.map((r) => String(r).replace(/\D/g, '').slice(0, 12)).filter(Boolean).slice(0, 5) : [];
  const pagina = s.pagina && typeof s.pagina === 'object'
    ? { id: String(s.pagina.id || '').slice(0, 40), nombre: String(s.pagina.nombre || '').slice(0, 80) }
    : null;
  const usuario = String(s.usuario || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  await chrome.storage.session.set({ [SESION_KEY]: { logueado: !!s.logueado, enLogin: !!s.enLogin, usuario, rucs, pagina, tab: tabId, ts: Date.now() } });
  // La pestaña de trabajo volvió al acceso: ya no hay cliente con sesión. (Se
  // ignora el aviso del acceso que llega justo cuando la extensión está
  // entrando: el cliente recién guardado tiene unos segundos de gracia.)
  if (s.enLogin) {
    const d = await chrome.storage.session.get([PESTANA_KEY, CLIENTE_KEY]);
    const c = d[CLIENTE_KEY];
    if (d[PESTANA_KEY] === tabId && c && Date.now() - c.ts > 15000) await chrome.storage.session.remove(CLIENTE_KEY);
  }
  await republicarExtras();
}

// ¿Coincide el RUC pedido con alguno de los de la sesión? Se tolera el dígito
// verificador (con o sin DV, de cualquiera de los dos lados).
function rucCoincide(pedido, enSesion) {
  const a = String(pedido || '').replace(/\D/g, '');
  const b = String(enSesion || '').replace(/\D/g, '');
  if (!a || !b) return false;
  return a === b || a.slice(0, -1) === b || a === b.slice(0, -1);
}

// --- Hablar con el panel de una pestaña ---------------------------------------------

async function mensajePanel(tabId, msg, reintentos = 4) {
  for (let i = 0; i < reintentos; i += 1) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, msg);
      if (r) return r;
    } catch { /* el content script todavía no está */ }
    await dormir(350);
  }
  return null;
}

// Espera a que la pestaña esté en la pantalla de acceso.
async function esperarPaginaLogin(tabId, ms = 15000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    let tab = null;
    try { tab = await chrome.tabs.get(tabId); } catch { return false; }
    // La dirección del acceso alcanza (no hace falta esperar a que la página
    // termine de cargar todo).
    if (esUrlMarangatu(tab.url) && enRutaLogin(tab.url)) return true;
    if (tab.status === 'complete' && esUrlMarangatu(tab.url)) {
      const s = await mensajePanel(tabId, { action: 'PANEL_LEER_SESION' }, 1);
      if (s && s.ok && s.enLogin) return true;
    }
    await dormir(400);
  }
  return false;
}

// --- Pestaña de trabajo -----------------------------------------------------------

async function pestanaDeTrabajo() {
  const d = await chrome.storage.session.get(PESTANA_KEY);
  let tab = null;
  if (d[PESTANA_KEY]) { try { tab = await chrome.tabs.get(d[PESTANA_KEY]); } catch { tab = null; } }
  if (tab && !esUrlMarangatu(tab.url)) tab = null; // la pestaña ya navegó a otro sitio
  if (!tab) {
    const todas = await chrome.tabs.query({ url: MARANGATU_MATCH });
    tab = todas.find((t) => t.active) || todas[0] || null;
  }
  return tab;
}

async function enfocarPestana(tab) {
  try { await chrome.tabs.update(tab.id, { active: true }); } catch { /* sin pestaña */ }
  try { if (tab.windowId && chrome.windows) await chrome.windows.update(tab.windowId, { focused: true }); } catch { /* sin ventana */ }
}

// Recarga la pestaña y espera a que termine (sirve cuando la página se abrió
// antes de cargar/recargar la extensión y todavía no tiene el panel).
async function recargarPestana(tabId, ms = 15000) {
  try { await chrome.tabs.reload(tabId); } catch { return false; }
  await dormir(600);
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try { const t = await chrome.tabs.get(tabId); if (t.status === 'complete') return true; } catch { return false; }
    await dormir(300);
  }
  return false;
}

// ¿La pestaña quedó en una página de Marangatu que no es el acceso (sesión
// abierta)? Se usa cuando no se pudo cerrar la sesión.
async function pestanaConSesion(tabId) {
  try {
    const t = await chrome.tabs.get(tabId);
    return t.status === 'complete' && esUrlMarangatu(t.url) && !enRutaLogin(t.url);
  } catch { return false; }
}

// Cierra la sesión de Marangatu como lo hace una persona (confirmado en el
// portal real): en el menú principal https://marangatu.set.gov.py/eset/, el
// ítem «Salir» del menú del usuario (<a class="dropdown-item"
// href="/eset/logout">). Marangatu comparte la sesión entre todas sus
// pestañas, así que se hace en la pestaña de trabajo:
//  1. se la lleva al menú principal (si el portal devuelve al acceso, no había
//     sesión);
//  2. clic en «Salir»;
//  3. si no apareció el acceso, se va directo a /eset/logout.
// Devuelve true si la pestaña quedó en la pantalla de acceso.
const SALIR_URL = 'https://marangatu.set.gov.py/eset/logout';

const esInicio = (u) => {
  try { const x = new URL(u); return x.hostname === MARANGATU_HOST && /^\/eset\/?$/.test(x.pathname); } catch { return false; }
};

// Hace clic en «Salir» apenas aparece en el menú principal, SIN esperar a que
// la página termine de cargar todo (el portal real tarda en «terminar» aunque
// el menú ya se vea). Devuelve 'clic', 'sin-sesion' (el portal mandó al
// acceso) o 'no' (no apareció a tiempo).
async function clicSalirCuandoAparezca(tabId, ms = 15000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    let t = null;
    try { t = await chrome.tabs.get(tabId); } catch { return 'no'; }
    if (esUrlMarangatu(t.url) && enRutaLogin(t.url)) return 'sin-sesion';
    if (esInicio(t.url)) {
      try {
        const r = await chrome.scripting.executeScript({ target: { tabId }, func: clicEnSalir, injectImmediately: true });
        if (r && r[0] && r[0].result) return 'clic';
      } catch { /* la página está cambiando: se reintenta */ }
    }
    await dormir(250);
  }
  return 'no';
}

async function cerrarSesionMarangatu(tabId) {
  let t = null;
  try { t = await chrome.tabs.get(tabId); } catch { return false; }
  if (esUrlMarangatu(t.url) && enRutaLogin(t.url)) return true; // ya está en el acceso
  // Si ya está en el menú principal, no se recarga: se pulsa «Salir» ahí.
  if (!esInicio(t.url)) {
    try { await chrome.tabs.update(tabId, { url: INICIO_URL }); } catch { return false; }
  }
  const r = await clicSalirCuandoAparezca(tabId);
  if (r === 'sin-sesion') return true;
  if (r === 'clic') {
    if (await esperarPaginaLogin(tabId, 8000)) return true;
    // ¿Quedó una confirmación («¿Desea salir?») en pantalla? Se acepta.
    try { await chrome.scripting.executeScript({ target: { tabId }, func: confirmarSalida, injectImmediately: true }); } catch { /* ya cambió */ }
    if (await esperarPaginaLogin(tabId, 10000)) return true;
  }
  // Respaldo: la dirección de «Salir».
  try { await chrome.tabs.update(tabId, { url: SALIR_URL }); } catch { return false; }
  return esperarPaginaLogin(tabId, 12000);
}

// Inyectada en el menú principal: si «Salir» ya está, lo pulsa un instante
// DESPUÉS de responder (para que la respuesta no se pierda con el cambio de
// página). Si todavía no se dibujó, devuelve false y se reintenta.
function clicEnSalir() {
  const link = document.querySelector('a.dropdown-item[href$="/eset/logout"], a[href$="/eset/logout"]')
    || [...document.querySelectorAll('a.dropdown-item, a')].find((a) => /^\s*salir\s*$/i.test(a.textContent || ''));
  if (!link) return false;
  setTimeout(() => link.click(), 50);
  return true;
}

function confirmarSalida() {
  const visible = (e) => !!(e.offsetParent || (e.getClientRects && e.getClientRects().length));
  const b = [...document.querySelectorAll('.modal button, .modal a.btn, [role="dialog"] button')]
    .filter(visible)
    .find((x) => /^(s[ií]|aceptar|confirmar|ok|salir)$/i.test((x.textContent || '').replace(/\s+/g, ' ').trim()));
  if (b) setTimeout(() => b.click(), 50);
  return !!b;
}

// Cierra las demás pestañas de Marangatu: con la sesión cerrada quedaron con
// pantallas del cliente anterior (formularios, Visión Integral…) que ya no
// sirven y confunden con el cliente nuevo.
async function cerrarOtrasPestanas(tabId) {
  const otras = (await chrome.tabs.query({ url: MARANGATU_MATCH })).filter((t) => t.id !== tabId);
  for (const t of otras) {
    try { await chrome.tabs.remove(t.id); } catch { /* ya cerrada */ }
  }
}

// Deja una pestaña de Marangatu lista para trabajar con el cliente pedido:
// reutiliza la que ya existe (o crea una sola) y:
//  - si la sesión abierta es la de ESE cliente (la extensión entró con su RUC),
//    la deja como está (sesionActiva + mismoCliente);
//  - si es de otro cliente (o no se sabe de quién es), la cierra, cierra las
//    pestañas que quedaron del cliente anterior y espera el acceso.
// Devuelve { ok, tabId, sesionActiva?, mismoCliente?, aviso? } o { ok: false, error, codigo }.
// Con permitirSesionActiva (descarga desde la app) NUNCA se queda trabado: si la
// sesión previa no se puede cerrar sigue con ella y lo informa (sesionActiva).
// La descarga busca al cliente por su RUC en la Visión Integral, así que igual
// baja los formularios del cliente pedido.
async function prepararPestanaLogin({ permitirSesionActiva = false, ruc = '' } = {}) {
  let tab = await pestanaDeTrabajo();
  if (!tab) {
    tab = await chrome.tabs.create({ url: LOGIN_URL, active: true });
    await chrome.storage.session.set({ [PESTANA_KEY]: tab.id });
    if (await esperarPaginaLogin(tab.id)) return { ok: true, tabId: tab.id };
    // El portal devolvió al inicio: había una sesión abierta (de otra ventana).
    if (await cerrarSesionMarangatu(tab.id)) {
      await chrome.storage.session.remove(CLIENTE_KEY);
      await cerrarOtrasPestanas(tab.id);
      return { ok: true, tabId: tab.id };
    }
    return { ok: false, codigo: 'SESION_PREVIA', error: 'Marangatu tiene una sesión abierta que no se pudo cerrar. Cerrala desde el panel de Marangatu e intentá de nuevo.' };
  }

  await chrome.storage.session.set({ [PESTANA_KEY]: tab.id });
  await enfocarPestana(tab);

  const seguirConSesion = (motivo) => ({ ok: true, tabId: tab.id, sesionActiva: true, aviso: motivo });

  let s = await mensajePanel(tab.id, { action: 'PANEL_LEER_SESION' }, 2);
  if (!s) {
    // Página abierta antes que la extensión: se recarga para que cargue el panel.
    await recargarPestana(tab.id);
    s = await mensajePanel(tab.id, { action: 'PANEL_LEER_SESION' }, 4);
  }
  const enAcceso = (s && s.ok && s.enLogin) || enRutaLogin(tab.url || '');

  if (!enAcceso) {
    // ¿La sesión abierta es la del mismo cliente? Sólo si la extensión entró
    // con su RUC (una sesión iniciada a mano se toma como de otro cliente).
    const d = await chrome.storage.session.get(CLIENTE_KEY);
    const cliente = d[CLIENTE_KEY];
    const esMismoCliente = (x) => !!(x && x.ok && x.logueado && ruc && cliente && rucCoincide(ruc, cliente.ruc));
    const mismo = { ok: true, tabId: tab.id, sesionActiva: true, mismoCliente: true };
    if (esMismoCliente(s)) return mismo;
    if (!(s && s.ok && s.logueado)) {
      // La pestaña no muestra sesión (o es una ventana sin el menú del
      // usuario): se va al acceso. Si el portal devuelve al inicio, hay sesión.
      try { await chrome.tabs.update(tab.id, { url: LOGIN_URL }); } catch { /* sigue abajo */ }
      if (await esperarPaginaLogin(tab.id, 12000)) {
        await chrome.storage.session.remove(CLIENTE_KEY);
        return { ok: true, tabId: tab.id };
      }
      s = await mensajePanel(tab.id, { action: 'PANEL_LEER_SESION' }, 4);
      if (esMismoCliente(s)) return mismo;
    }
    // Sesión de otro cliente (o de quien no se sabe): se cierra.
    const cerro = await cerrarSesionMarangatu(tab.id);
    if (!cerro) {
      if (permitirSesionActiva && (await pestanaConSesion(tab.id))) {
        return seguirConSesion('No se pudo cerrar la sesión previa de Marangatu: se sigue con la sesión abierta.');
      }
      return { ok: false, codigo: 'SESION_PREVIA', error: 'Hay una sesión abierta en Marangatu y no se pudo cerrar. Cerrala desde el panel de Marangatu e intentá de nuevo.' };
    }
    await chrome.storage.session.remove(CLIENTE_KEY);
    await cerrarOtrasPestanas(tab.id);
  }
  return { ok: true, tabId: tab.id };
}

// Una sola preparación de sesión a la vez (dos clics seguidos no deben abrir ni
// cerrar sesiones en paralelo).
let candadoSesion = false;
async function conCandadoDeSesion(fn) {
  if (candadoSesion) return { ok: false, error: 'TAREA_EN_CURSO' };
  candadoSesion = true;
  try { return await fn(); } finally { candadoSesion = false; }
}

// Cierra la sesión de la pestaña de trabajo (pedido de la app).
// tabId: la pestaña desde la que se pidió (panel); si no, la de trabajo.
async function cerrarSesionDeTrabajo(tabId = null) {
  if (await leerJob()) await cancelarDescarga(); // no se cierra la sesión debajo de una descarga
  let tab = null;
  if (tabId) { try { tab = await chrome.tabs.get(tabId); } catch { tab = null; } }
  if (!tab) tab = await pestanaDeTrabajo();
  if (tab) await chrome.storage.session.set({ [PESTANA_KEY]: tab.id });
  if (!tab) return { ok: false, error: 'No hay una pestaña de Marangatu abierta.' };
  if (!(await cerrarSesionMarangatu(tab.id))) return { ok: false, error: 'No se pudo cerrar la sesión de Marangatu.' };
  await chrome.storage.session.remove(CLIENTE_KEY);
  await cerrarOtrasPestanas(tab.id);
  return { ok: true };
}

// --- Mensajes internos (panel y content script de descarga) ------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || sender.id !== chrome.runtime.id || !sender.tab || !esUrlMarangatu(sender.tab.url)) return false;

  if (msg.action === 'PANEL_SESION') {
    guardarSesion(msg.sesion || {}, sender.tab.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.action === 'PANEL_SALIR') {
    // «Cerrar sesión» del panel: el mismo cierre completo que pide la app
    // (menú principal → Salir → cerrar las demás ventanas de Marangatu).
    conCandadoDeSesion(() => cerrarSesionDeTrabajo(sender.tab.id)).then(sendResponse);
    return true;
  }
  if (msg.action === 'PANEL_CANCELAR') {
    cancelarDescarga().then(sendResponse);
    return true;
  }
  if (msg.action === 'ETAPA_PERMISO') {
    // Sólo la pestaña dueña de la descarga puede actuar sobre su etapa; las
    // otras pestañas de Marangatu (abiertas a mano) la ignoran.
    encolar(async () => {
      const job = await leerJob();
      if (!job) { sendResponse({ ok: false }); return; }
      const id = sender.tab.id;
      // El recorrido pasa por varias ventanas encadenadas (inicio → Visión
      // Integral → lista de declaraciones → formulario): cada una abierta desde
      // una pestaña de la tarea pasa a ser parte de la tarea (job.tabsPropias).
      const propias = new Set([job.tabLista, job.tabForm, ...(job.tabsPropias || [])].filter(Boolean));
      if (propias.has(id)) { sendResponse({ ok: true }); return; }
      const opener = sender.tab.openerTabId;
      // Si el navegador no informa quién la abrió (enlaces noopener), vale una
      // pestaña creada después de empezar la tarea; las que ya estaban abiertas
      // a mano (id menor) nunca.
      const nueva = !opener && job.tabBase > 0 && id > job.tabBase;
      if ((opener && propias.has(opener)) || nueva) {
        job.tabsPropias = [...(job.tabsPropias || []), id].slice(-20);
        await guardarJob(job);
        sendResponse({ ok: true });
        return;
      }
      // Pestaña de formulario recién abierta por la propia descarga.
      if (msg.etapa === 'GUARDAR_FORMULARIO' && !job.tabForm && job.formPendienteHasta > Date.now()) {
        job.tabForm = id;
        job.formPendienteHasta = 0;
        await guardarJob(job);
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false });
    });
    return true;
  }
  return false;
});

// Puerto del panel flotante: recibe el estado en vivo.
chrome.runtime.onConnect.addListener((port) => {
  const tab = port.sender && port.sender.tab;
  if (port.name !== 'eku-panel' || port.sender.id !== chrome.runtime.id || !tab || !esUrlMarangatu(tab.url)) {
    port.disconnect();
    return;
  }
  puertosPanel.add(port);
  // Se cierra solo cuando la página cambia o pasa a la caché de atrás/adelante:
  // leer lastError evita el aviso "Unchecked runtime.lastError" en Chrome.
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    puertosPanel.delete(port);
  });
  estadoActual().then((estado) => {
    try { port.postMessage({ tipo: 'estado', estado }); } catch { puertosPanel.delete(port); }
  });
});

// --- Mensajes de la app ------------------------------------------------------------------

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const acciones = ['APP_CONTEXTO', 'APP_CERRAR_SESION'];
  if (!msg || !acciones.includes(msg.action)) return false;

  const origen = getVerifiedSenderOrigin(sender);
  if (!origen || !ALLOWED_APP_ORIGINS.has(origen)) {
    sendResponse({ ok: false, error: 'origen no autorizado' });
    return false;
  }
  if (msg.action === 'APP_CONTEXTO') {
    guardarContexto(msg).then(() => sendResponse({ ok: true }));
    return true;
  }
  conCandadoDeSesion(cerrarSesionDeTrabajo).then(sendResponse);
  return true;
});
