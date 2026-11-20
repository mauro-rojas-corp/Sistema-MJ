// Buscador de clientes del ícono (v2.16). Lo carga background.js con
// importScripts y comparte su ámbito (ALLOWED_APP_ORIGINS,
// getVerifiedSenderOrigin).
//
// La extensión NO guarda clientes ni claves. Mientras Control Clientes está
// abierta (con sesión y un período elegido) mantiene un puerto 'eku-buscador'.
// El popup pregunta por ese puerto:
//   BUSCADOR_BUSCAR { q }        → la app responde nombre, RUC y si tiene clave.
//   BUSCADOR_ENTRAR { ref, ruc } → la app inicia el login con APP_AUTO_LOGIN,
//                                  igual que el botón Marangatu de la fila.
// La clave nunca pasa por el popup ni por este archivo: va de la app al
// login por el camino de siempre (background.js → abrirLogin).

const puertosBuscador = [];
const pedidosBuscador = new Map();
let siguientePedidoBuscador = 1;

chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name !== 'eku-buscador') return;
  const origen = getVerifiedSenderOrigin(port.sender);
  if (!origen || !ALLOWED_APP_ORIGINS.has(origen)) {
    port.disconnect();
    return;
  }
  puertosBuscador.push(port);
  mantenerDespierto();
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    const i = puertosBuscador.indexOf(port);
    if (i >= 0) puertosBuscador.splice(i, 1);
    mantenerDespierto();
  });
  port.onMessage.addListener((m) => {
    const pedido = m && pedidosBuscador.get(m.id);
    if (!pedido || pedido.port !== port) return;
    pedidosBuscador.delete(m.id);
    clearTimeout(pedido.timer);
    pedido.resolve(m);
  });
  try { port.postMessage({ tipo: 'hola' }); } catch { /* se cerró */ }
});

// Chrome duerme el service worker a los ~30 s sin actividad y eso corta el
// puerto. La pestaña de Control Clientes suele estar en segundo plano, donde
// Chrome demora sus temporizadores hasta 1 minuto: la app tardaba en
// reconectar y el buscador decía «Abrí Control Clientes» con la app abierta.
// Mientras haya una app conectada, una llamada liviana cada 20 s mantiene
// despierto el service worker (y con él, el puerto). Sin app, se apaga.
let despertador = null;
function mantenerDespierto() {
  if (puertosBuscador.length && !despertador) {
    despertador = setInterval(() => { chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError); }, 20000);
  } else if (!puertosBuscador.length && despertador) {
    clearInterval(despertador);
    despertador = null;
  }
}

// Si igual se durmió, al despertar no hay puertos: la app los reabre. Se
// espera hasta 8 s antes de decir que la app no está.
async function puertoBuscador() {
  for (let i = 0; i < 32 && !puertosBuscador.length; i += 1) await dormir(250);
  return puertosBuscador[puertosBuscador.length - 1] || null;
}

async function preguntarApp(mensaje) {
  const port = await puertoBuscador();
  if (!port) return { ok: false, error: 'SIN_APP' };
  const id = siguientePedidoBuscador++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pedidosBuscador.delete(id);
      resolve({ ok: false, error: 'SIN_RESPUESTA' });
    }, 5000);
    pedidosBuscador.set(id, { port, resolve, timer });
    try { port.postMessage({ ...mensaje, id }); } catch {
      clearTimeout(timer);
      pedidosBuscador.delete(id);
      resolve({ ok: false, error: 'SIN_APP' });
    }
  });
}

// Sólo el popup de la extensión (sin pestaña) usa estas acciones.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || (msg.action !== 'BUSCADOR_BUSCAR' && msg.action !== 'BUSCADOR_ENTRAR')) return false;
  if (sender.id !== chrome.runtime.id || sender.tab) return false;

  if (msg.action === 'BUSCADOR_BUSCAR') {
    const q = String(msg.q || '').trim().slice(0, 80);
    if (!q) { sendResponse({ ok: true, items: [] }); return false; }
    preguntarApp({ tipo: 'buscar', q }).then((r) => {
      if (r.tipo !== 'resultados') { sendResponse(r); return; }
      const items = (Array.isArray(r.items) ? r.items : []).slice(0, 8).map((it) => ({
        ref: Number(it.ref),
        nombre: String(it.nombre || '').slice(0, 120),
        ruc: String(it.ruc || '').slice(0, 20),
        conClave: !!it.conClave,
      }));
      sendResponse({ ok: true, items });
    });
    return true;
  }

  preguntarApp({ tipo: 'entrar', ref: Number(msg.ref), ruc: String(msg.ruc || '') }).then((r) => {
    sendResponse(r.tipo === 'entrando' ? { ok: !!r.ok, error: r.error } : r);
  });
  return true;
});
