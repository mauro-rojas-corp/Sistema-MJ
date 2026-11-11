// Service worker del puente "Ekuatia Login".
//
// Atiende exclusivamente pedidos externos de Control Clientes:
//  - APP_AUTO_LOGIN: la app manda { user, pass }; se abre el login de
//    Marangatu y se inyecta una sola vez.
//  - APP_IVA_PREPARE: la app manda las casillas del Formulario 120 de un
//    cliente. Se guardan en chrome.storage.session (memoria del navegador,
//    se borra al cerrarlo) con vencimiento. Recorrido: sesión del cliente
//    (cierra la de otro cliente; si ya es la suya, la reutiliza) → login →
//    «Presentar Declaración» (en la misma ventana o en una nueva, como lo
//    abra Marangatu) → 211 · Mensual · año · mes → la persona toca «Abrir
//    declaración» → ivaContent.js espera el formulario y lo completa. Nunca
//    presenta la declaración.
// Las credenciales nunca se guardan, ni se colocan en la URL, el historial
// o el portapapeles.
// seleccionarObligacionIva y mostrarReferenciaIva viven en formulario120.js.
// La descarga de formularios IVA (APP_IVA_DESCARGAR, popup) vive en
// descargaBg.js, que comparte el ámbito global de este archivo. La pestaña de
// trabajo, el cierre de sesión y el estado compartido con la app viven en
// sesionBg.js.
importScripts('formulario120.js', 'sesionBg.js', 'descargaBg.js', 'whatsappBg.js');

const LOGIN_URL = 'https://marangatu.set.gov.py/eset/login';
const MARANGATU_HOST = 'marangatu.set.gov.py';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const IVA_STORAGE_KEY = 'ivaPendiente';
const IVA_TTL_MS = 30 * 60 * 1000;
const MAX_CASILLAS = 120;

// Orígenes exactos de Control Clientes que pueden hablarle a la extensión:
// el servidor de desarrollo y la app publicada en Vercel. El manifest de
// Chrome no permite restringir un patrón por puerto; por eso allí se declara
// localhost y acá se exige el origen completo. Los deploys de vista previa de
// Vercel (otro subdominio en cada deploy) no se agregan a propósito.
const ALLOWED_APP_ORIGINS = new Set([
  'http://localhost:3000',
  'https://control-total-clientes.vercel.app',
  // App de pruebas (mismo ID de extensión que la real).
  'https://sistema-mj.vercel.app',
]);

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!msg || (msg.action !== 'APP_AUTO_LOGIN' && msg.action !== 'APP_IVA_PREPARE')) return false;

  const senderOrigin = getVerifiedSenderOrigin(sender);
  if (!senderOrigin || !ALLOWED_APP_ORIGINS.has(senderOrigin)) {
    sendResponse({ ok: false, error: 'origen no autorizado' });
    return false;
  }

  const user = String(msg.user || '').trim();
  const pass = String(msg.pass || '');

  if (msg.action === 'APP_AUTO_LOGIN' && !user) {
    sendResponse({ ok: false, error: 'sin usuario' });
    return true;
  }
  let pendiente = null;
  if (msg.action === 'APP_IVA_PREPARE') {
    pendiente = validarIva(msg);
    if (!pendiente) {
      sendResponse({ ok: false, error: 'datos del formulario inválidos' });
      return true;
    }
  }

  // Una sola tarea a la vez: con una descarga en curso no se toca la sesión.
  (async () => {
    if (await leerJob()) { sendResponse({ ok: false, error: 'TAREA_EN_CURSO' }); return; }
    if (pendiente) {
      try { await chrome.storage.session.set({ [IVA_STORAGE_KEY]: pendiente }); } catch { sendResponse({ ok: false, error: 'no se pudieron guardar los datos' }); return; }
    }
    // Después del login (automático o a mano) el Formulario 120 entra a
    // "Presentar Declaración". Se reutiliza la pestaña de Marangatu que haya.
    // El RUC con que se entra identifica al cliente: si la sesión abierta es
    // la suya se reutiliza; si es de otro, se cierra antes.
    const ruc = String(user || (pendiente && pendiente.ruc) || '').replace(/\D/g, '');
    const r = await abrirLogin(user, pass, pendiente ? irAPresentarCuandoEntre : undefined, { ruc });
    sendResponse(r && r.ok ? { ok: true } : { ok: false, error: (r && r.error) || 'No se pudo abrir Marangatu.' });
  })();
  return true;
});

// Formulario 120 pendiente: lo piden las páginas de Marangatu (ivaContent.js,
// en todas sus ventanas y marcos) para elegir la obligación y completar el
// formulario cuando aparezca. Las pestañas de una descarga en curso no lo
// reciben.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || sender.id !== chrome.runtime.id || !sender.tab) return false;
  const deMarangatu = (sender.origin === 'https://' + MARANGATU_HOST) || esUrlMarangatu(sender.url || '') || esUrlMarangatu(sender.tab.url || '');
  if (!deMarangatu) return false;

  if (msg.action === 'IVA_PENDIENTE_LEER') {
    chrome.storage.session.get([IVA_STORAGE_KEY, DESCARGA_KEY], (data) => {
      const d = data && data[DESCARGA_KEY];
      const tabId = sender.tab.id;
      if (d && (d.tabLista === tabId || d.tabForm === tabId || (d.tabsPropias || []).includes(tabId))) { sendResponse({ ok: false }); return; }
      const p = data && data[IVA_STORAGE_KEY];
      if (!p || p.expiresAt < Date.now()) { sendResponse({ ok: false }); return; }
      sendResponse({ ok: true, casillas: p.casillas, control: p.control || [], ref: referenciaPeriodo(p) });
    });
    return true;
  }

  if (msg.action === 'IVA_RESULTADO') {
    const r = msg.resultado || {};
    // El recuadro de referencia va en la ventana principal de esa pestaña.
    chrome.storage.session.get(IVA_STORAGE_KEY, (data) => {
      const p = data && data[IVA_STORAGE_KEY];
      if (!p) return;
      chrome.tabs.sendMessage(sender.tab.id, { action: 'IVA_MOSTRAR', resultado: r }, { frameId: 0 }).catch(() => {});
      const n = Array.isArray(r.completadas) ? r.completadas.length : 0;
      const dif = Array.isArray(r.diferencias) ? r.diferencias.length : 0;
      publicarAviso('Formulario 120 de ' + (p.nombre || 'el cliente') + ': ' + n + (n === 1 ? ' casilla cargada' : ' casillas cargadas') +
        (dif ? ', ' + dif + ' con diferencias' : '') + '. Revisalo y presentalo vos.');
    });
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

// "2026-05" -> datos para la referencia: el IVA de mayo se presenta en junio.
function referenciaPeriodo(p) {
  const [anio, mes] = p.periodo.split('-').map(Number);
  const presenta = mes === 12 ? { m: 1, a: anio + 1 } : { m: mes + 1, a: anio };
  return {
    nombre: p.nombre || 'Cliente',
    ruc: p.ruc,
    anio,
    mes,
    mesTexto: MESES[mes - 1],
    periodoTexto: MESES[mes - 1] + ' ' + anio,
    presentaTexto: MESES[presenta.m - 1] + ' ' + presenta.a,
  };
}

// Espera a que la pestaña salga del login y, en una página con el menú,
// entra a «Presentar Declaración» (enlace recibirDDJJContribuyente.do, cuyo
// token _cyp es de la sesión: se toma del propio enlace). Respeta cómo lo abre
// Marangatu: si el enlace abre otra ventana se abre otra pestaña (hija de la
// de trabajo); si no, en la misma. Se rinde a los 3 minutos o cuando ya entró.
// No completa ni presenta nada (eso lo hace ivaContent.js en el formulario).
const PRESENTAR_TIMEOUT_MS = 3 * 60 * 1000;

function irAPresentarCuandoEntre(tabId) {
  const limite = Date.now() + PRESENTAR_TIMEOUT_MS;
  let hecho = false;
  const intentar = (tab) => {
    if (hecho) return;
    if (Date.now() > limite) { chrome.tabs.onUpdated.removeListener(onUpdated); return; }
    const url = String((tab && tab.url) || '');
    if (!esUrlMarangatu(url) || url.includes('/login')) return;
    if (url.includes('recibirDDJJContribuyente.do')) { hecho = true; chrome.tabs.onUpdated.removeListener(onUpdated); return; }
    chrome.scripting.executeScript({ target: { tabId }, func: buscarPresentarDeclaracion }, (res) => {
      const enlace = !chrome.runtime.lastError && res && res[0] && res[0].result;
      if (!enlace || hecho) return;
      hecho = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (enlace.nueva) chrome.tabs.create({ url: enlace.href, openerTabId: tabId, active: true }).catch(() => {});
      else chrome.tabs.update(tabId, { url: enlace.href }).catch(() => {});
    });
  };
  const onUpdated = (id, info, tab) => {
    if (id !== tabId || info.status !== 'complete') return;
    intentar(tab);
  };
  chrome.tabs.onUpdated.addListener(onUpdated);
  // Sesión que se mantuvo (mismo cliente): la página ya está cargada.
  chrome.tabs.get(tabId).then((tab) => { if (tab && tab.status === 'complete') intentar(tab); }).catch(() => {});
}

// Inyectada en Marangatu: devuelve el enlace de «Presentar Declaración» y si
// Marangatu lo abre en otra ventana (target, o window.open en su onclick).
function buscarPresentarDeclaracion() {
  const link = document.querySelector('a[href*="recibirDDJJContribuyente.do"]')
    || [...document.querySelectorAll('a')].find((a) =>
      /presentar declaraci/i.test(a.title || a.getAttribute('data-tooltip') || a.textContent || ''));
  if (!link || !link.href || /^javascript:/i.test(link.getAttribute('href') || '')) return null;
  const destino = (link.getAttribute('target') || '').toLowerCase();
  const nueva = (destino && destino !== '_self' && destino !== '_top' && destino !== '_parent') ||
    /window\.open/i.test(link.getAttribute('onclick') || '');
  return { href: link.href, nueva: !!nueva };
}

// Sólo números: casilla (1 a 4 dígitos) e importe entero en guaraníes.
function validarIva(msg) {
  const periodo = String(msg.periodo || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return null;
  const casillas = validarLista(msg.casillas, true);
  const control = validarLista(msg.control || [], false);
  if (!casillas || !control) return null;
  return {
    ruc: String(msg.ruc || '').replace(/\D/g, '').slice(0, 12),
    nombre: String(msg.nombre || '').slice(0, 120),
    periodo,
    casillas,
    control,
    expiresAt: Date.now() + IVA_TTL_MS,
  };
}

function validarLista(lista, obligatoria) {
  if (!Array.isArray(lista) || lista.length > MAX_CASILLAS || (obligatoria && !lista.length)) return null;
  const out = [];
  for (const c of lista) {
    const cas = String(c && c.cas);
    const valor = Number(c && c.valor);
    if (!/^\d{1,4}$/.test(cas) || !Number.isFinite(valor) || !Number.isInteger(valor)) return null;
    out.push({ cas, valor });
  }
  return out;
}

// Deja UNA pestaña de Marangatu lista para el cliente (sesionBg.js: reutiliza
// la que exista; si hay sesión de otro cliente la cierra; si ya es la del
// mismo cliente la reutiliza) y entra con las credenciales si vienen.
// despues(tabId): opcional, se llama con la pestaña lista (ej. para seguir
// hasta «Presentar Declaración»). opciones: { ruc, permitirSesionActiva }.
// Devuelve { ok, tabId } o { ok: false, error }.
function abrirLogin(user, pass, despues, opciones = {}) {
  return conCandadoDeSesion(async () => {
    const rucPedido = String(opciones.ruc || user || '').replace(/\D/g, '');
    const r = await prepararPestanaLogin({ ...opciones, ruc: rucPedido });
    if (!r.ok) { await publicarAviso(r.error); return r; }
    const tabId = r.tabId;
    if (r.aviso) await publicarAviso(r.aviso);
    if (r.mismoCliente) {
      // Misma sesión del cliente: se vuelve al inicio para arrancar de ahí.
      try { await chrome.tabs.update(tabId, { url: INICIO_URL }); } catch { /* sigue igual */ }
      await esperarCarga(tabId);
      await publicarAviso('Se reutiliza la sesión abierta de este cliente en Marangatu.');
    }
    if (despues) await despues(tabId, r);
    if (user && !r.sesionActiva) {
      // El formulario puede dibujarse tarde: se reintenta unas veces.
      for (let i = 0; i < 6; i += 1) {
        let res = null;
        try { res = await chrome.scripting.executeScript({ target: { tabId }, func: inyectarLogin, args: [user, pass] }); } catch { res = null; }
        if (res && res[0] && res[0].result) {
          // Se recuerda con qué cliente se entró (sólo el RUC, nunca la clave).
          await chrome.storage.session.set({ [CLIENTE_KEY]: { ruc: rucPedido, ts: Date.now() } });
          break;
        }
        await dormir(400);
      }
    }
    return { ok: true, tabId, sesionActiva: !!r.sesionActiva, mismoCliente: !!r.mismoCliente };
  });
}

// Espera a que la pestaña termine de cargar (máx. 15 s).
async function esperarCarga(tabId, ms = 15000) {
  await dormir(300);
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try { const t = await chrome.tabs.get(tabId); if (t.status === 'complete') return true; } catch { return false; }
    await dormir(250);
  }
  return false;
}

// Chrome informa tanto el origen como la URL de la página remitente. Ambos
// valores deben existir y coincidir: no se acepta un fallback permisivo cuando
// falta alguno, porque esta verificación protege la apertura automática.
function getVerifiedSenderOrigin(sender) {
  const declaredOrigin = normalizeHttpOrigin(sender?.origin);
  const urlOrigin = normalizeHttpOrigin(sender?.url);
  if (!declaredOrigin || !urlOrigin || declaredOrigin !== urlOrigin) return '';
  return declaredOrigin;
}

function normalizeHttpOrigin(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

// Se inyecta en la página de login (función serializada por executeScript).
function inyectarLogin(user, pass) {
  const u = document.querySelector(
    "input[type='text'], input[type='email'], input[name*='user'], input[id*='user']"
  );
  const p = document.querySelector(
    "input[type='password'], input[name*='pass'], input[id*='pass']"
  );
  if (!u || !p) return false;

  u.value = user;
  u.dispatchEvent(new Event('input', { bubbles: true }));
  p.value = pass;
  p.dispatchEvent(new Event('input', { bubbles: true }));

  setTimeout(() => {
    const btn = document.querySelector("button[type='submit'], input[type='submit']");
    if (btn) btn.click();
  }, 800);
  return true;
}
