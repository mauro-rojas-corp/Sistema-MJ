// ============================================================================
// DESCARGA DIRECTA DE XML (eKuatia por API) — lado service worker.
// ----------------------------------------------------------------------------
// Control Clientes pide bajar una lista de CDCs y este módulo, sin abrir
// ninguna pestaña:
//   1) pide un token reCAPTCHA a CapSolver (clave guardada en la extensión),
//   2) POST /docs/documento-electronico { cdc, captcha } — la sesión del
//      navegador queda autorizada por cookies,
//   3) GET /docs/documento-electronico-xml/{cdc} → el texto del XML.
// El trabajo corre en segundo plano: su estado y resultados quedan en
// chrome.storage.session y la app los consulta (así el progreso se puede
// mostrar aunque este worker se reinicie). Los XML no se guardan en disco:
// vuelven a Control Clientes, que los parsea y los registra en el backend.
//
// Mensajes externos (solo orígenes verificados de Control Clientes):
//   APP_CDC_DIR_DESCARGAR  { cdcs }  → { ok, iniciado, total }
//   APP_CDC_DIR_ESTADO               → { ok, corriendo, hechos, total }
//   APP_CDC_DIR_RESULTADOS           → { ok, resultados: [...] }
// ============================================================================

const DIR_SITEKEY = '6Ldcb-wrAAAAAGp5mRQLnbGW0GFsKyi71OhYDImu';
const DIR_SOLVER_API = 'https://api.capsolver.com';
const DIR_EK_BASE = 'https://ekuatia.set.gov.py';
const DIR_EK_AUTH = 'afsdafasf9408539lfsasfas'; // cabecera que usa el portal público
const DIR_KEY_STORAGE = 'capSolverKeyV1';
const DIR_PERFIL_STORAGE = 'directaPerfilV1';
const DIR_TRABAJO_KEY = 'directaTrabajoV1';
const DIR_ESTADO_KEY = 'directaEstadoV1';
const DIR_HISTORIAL_KEY = 'directaHistorialV1';
const DIR_HISTORIAL_MAX = 20;

// Perfiles de ritmo para MEDIR (se eligen en el popup; el normal es
// «actual»). Las consultas a eKuatia siempre van de a una: lo que cambia
// es cuántos tokens se resuelven en paralelo y la pausa entre consultas.
const DIR_PERFILES = {
  actual: { etiqueta: 'Actual (seguro)', tokensEnVuelo: 1, pausaMs: 2000 },
  prudente: { etiqueta: 'Prudente rápido (3 tokens)', tokensEnVuelo: 3, pausaMs: 2000 },
  rapido: { etiqueta: 'Rápido (6 tokens)', tokensEnVuelo: 6, pausaMs: 500 },
  fondo: { etiqueta: 'A fondo (todos los tokens, sin pausa)', tokensEnVuelo: Infinity, pausaMs: 0 },
};

const dirSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// El service worker MV3 se duerme a los ~30 s sin actividad de API: este
// latido lo mantiene vivo mientras dura una descarga.
let dirLatido = null;
function dirLatidoStart() {
  if (dirLatido) return;
  dirLatido = setInterval(() => { try { chrome.runtime.getPlatformInfo(); } catch { /* noop */ } }, 20000);
}
function dirLatidoStop() {
  if (dirLatido) { clearInterval(dirLatido); dirLatido = null; }
}

async function dirMarcar(paso, detalle) {
  try {
    await chrome.storage.local.set({ [DIR_ESTADO_KEY]: { paso, detalle, ts: Date.now() } });
  } catch { /* noop */ }
}

async function dirSolverPost(ruta, payload) {
  const resp = await fetch(`${DIR_SOLVER_API}/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data) throw new Error(`El servicio de captcha respondió HTTP ${resp.status} en ${ruta}.`);
  if (data.errorId) {
    throw new Error(`El servicio de captcha devolvió error en ${ruta}: ${data.errorCode || ''} ${data.errorDescription || ''}`.trim());
  }
  return data;
}

async function dirLeerSaldo(clientKey) {
  try {
    const data = await dirSolverPost('getBalance', { clientKey });
    const n = Number(data.balance);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function dirEsperarTareaToken(clientKey, taskId, creadoEn, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await dirSleep(2000);
    const r = await dirSolverPost('getTaskResult', { clientKey, taskId });
    if (r.status === 'ready' && r.solution && r.solution.gRecaptchaResponse) {
      const listoEn = Date.now();
      return {
        token: r.solution.gRecaptchaResponse,
        creadoEn,
        listoEn,
        segSolver: Number(((listoEn - creadoEn) / 1000).toFixed(1)),
      };
    }
    // 'idle' es el estado inicial de la tarea: hay que seguir esperando.
    if (r.status && r.status !== 'processing' && r.status !== 'idle') {
      throw new Error(`La tarea de captcha terminó con estado inesperado: ${r.status}`);
    }
  }
  throw new Error('El token de captcha no estuvo listo en 120 s.');
}

// Crea UNA tarea de captcha y espera su token. Cuenta el pedido en las
// métricas de la corrida; quien llama decide cómo contar el resultado.
async function dirResolverToken(clientKey, metricas, timeoutMs = 120000) {
  const creadoEn = Date.now();
  if (metricas) metricas.tokensPedidos += 1;
  const creada = await dirSolverPost('createTask', {
    clientKey,
    task: {
      type: 'ReCaptchaV2TaskProxyless',
      websiteURL: 'https://ekuatia.set.gov.py/consultas/',
      websiteKey: DIR_SITEKEY,
    },
  });
  if (!creada.taskId) throw new Error('El servicio de captcha no devolvió taskId.');
  return dirEsperarTareaToken(clientKey, creada.taskId, creadoEn, timeoutMs);
}

async function dirPedirToken(clientKey, metricas, timeoutMs = 120000) {
  const info = await dirResolverToken(clientKey, metricas, timeoutMs);
  if (metricas) metricas.tokensListos += 1;
  return info.token;
}

// Pool de tokens para los perfiles de medición: mantiene hasta
// `maxEnVuelo` tareas de captcha resolviéndose a la vez y entrega los
// tokens en el orden en que quedan listos. Las consultas siguen de a
// una; un token que espera más de 100 s en la fila se descarta.
function dirCrearPoolTokens(clientKey, maxEnVuelo, total, metricas) {
  const listos = [];
  const esperando = [];
  let entregados = 0;
  let enCurso = 0;
  let fallosSeguidos = 0;
  let ultimoError = null;
  let cerrado = false;

  function avisar() {
    while (esperando.length) esperando.shift()();
  }

  function lanzar() {
    if (cerrado) return;
    while (enCurso < maxEnVuelo && entregados + listos.length + enCurso < total) {
      enCurso += 1;
      dirResolverToken(clientKey, metricas)
        .then((info) => {
          enCurso -= 1;
          fallosSeguidos = 0;
          metricas.tokensListos += 1;
          listos.push(info);
          avisar();
          lanzar();
        })
        .catch((err) => {
          enCurso -= 1;
          fallosSeguidos += 1;
          metricas.tokensFallidos += 1;
          ultimoError = err;
          avisar();
        });
    }
  }

  async function tomar() {
    while (true) {
      while (listos.length && Date.now() - listos[0].listoEn > 100000) {
        listos.shift();
        metricas.tokensDescartados += 1;
      }
      if (listos.length) {
        entregados += 1;
        return listos.shift();
      }
      if (fallosSeguidos >= 2 && enCurso === 0) {
        const err = ultimoError || new Error('El servicio de captcha no entregó tokens.');
        fallosSeguidos = 0; // el reintento de quien llama arranca limpio
        ultimoError = null;
        throw err;
      }
      lanzar();
      if (listos.length) continue;
      await new Promise((resolve) => esperando.push(resolve));
    }
  }

  return {
    tomar,
    reponer: lanzar,
    cerrar() { cerrado = true; avisar(); },
  };
}

async function dirConsultarYDescargar(cdc, clientKey, metricas) {
  const t0 = Date.now();
  await dirMarcar('token', `pidiendo token para …${cdc.slice(-6)}`);
  let token;
  try {
    token = await dirPedirToken(clientKey, metricas);
  } catch (errToken) {
    // Un intento más de token antes de dar el CDC por fallido.
    if (metricas) metricas.tokensFallidos += 1;
    await dirMarcar('token', `reintentando token para …${cdc.slice(-6)}`);
    try {
      token = await dirPedirToken(clientKey, metricas);
    } catch (errToken2) {
      if (metricas) metricas.tokensFallidos += 1;
      throw errToken2;
    }
  }
  const segToken = (Date.now() - t0) / 1000;
  await dirMarcar('consulta', `token ok (${segToken.toFixed(1)} s); consultando eKuatia…`);

  const consulta = await fetch(`${DIR_EK_BASE}/docs/documento-electronico`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: DIR_EK_AUTH,
    },
    body: JSON.stringify({ cdc, captcha: token }),
  });
  const datos = await consulta.json().catch(() => null);
  if (consulta.status !== 200) {
    throw new Error(`Consulta rechazada (HTTP ${consulta.status}): ${datos?.mensaje || 'sin mensaje'}`);
  }

  await dirMarcar('descarga', 'consulta aceptada; bajando el XML…');
  const respXml = await fetch(`${DIR_EK_BASE}/docs/documento-electronico-xml/${cdc}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/xml, application/json' },
  });
  const xml = await respXml.text();
  if (respXml.status !== 200 || !/<(rDE|DE)[\s>]/.test(xml)) {
    throw new Error(`La descarga del XML falló (HTTP ${respXml.status}, ${xml.length} bytes).`);
  }

  return {
    ok: true,
    cdc,
    segToken: Number(segToken.toFixed(1)),
    segTotal: Number(((Date.now() - t0) / 1000).toFixed(1)),
    bytes: xml.length,
    xml,
  };
}

// Consulta + descarga usando un token que el pool ya resolvió.
async function dirConsultarConToken(cdc, tokenInfo) {
  const tConsulta = Date.now();
  await dirMarcar('consulta', `token ok (${tokenInfo.segSolver} s); consultando eKuatia…`);

  const consulta = await fetch(`${DIR_EK_BASE}/docs/documento-electronico`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: DIR_EK_AUTH,
    },
    body: JSON.stringify({ cdc, captcha: tokenInfo.token }),
  });
  const datos = await consulta.json().catch(() => null);
  if (consulta.status !== 200) {
    const err = new Error(`Consulta rechazada (HTTP ${consulta.status}): ${datos?.mensaje || 'sin mensaje'}`);
    if (consulta.status === 403 || consulta.status === 429 || /try again later/i.test(String(datos?.mensaje || ''))) {
      err.bloqueo = true; // posible freno del portal: la corrida se corta
    }
    throw err;
  }

  await dirMarcar('descarga', 'consulta aceptada; bajando el XML…');
  const respXml = await fetch(`${DIR_EK_BASE}/docs/documento-electronico-xml/${cdc}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/xml, application/json' },
  });
  const xml = await respXml.text();
  if (respXml.status !== 200 || !/<(rDE|DE)[\s>]/.test(xml)) {
    throw new Error(`La descarga del XML falló (HTTP ${respXml.status}, ${xml.length} bytes).`);
  }

  return {
    ok: true,
    cdc,
    segToken: tokenInfo.segSolver,
    segConsulta: Number(((Date.now() - tConsulta) / 1000).toFixed(1)),
    segTotal: Number(((Date.now() - tConsulta) / 1000).toFixed(1)),
    bytes: xml.length,
    xml,
  };
}

function dirMediana(valores) {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Number(((o[m - 1] + o[m]) / 2).toFixed(1));
}

// Bitácora de mediciones: al terminar cada corrida guarda un resumen
// numérico (sin XML y sin la clave) en chrome.storage.local, que
// sobrevive al cierre de Chrome. Sirve para comparar ritmos y vigilar
// la «salud» posterior a una prueba agresiva. Nunca frena la descarga.
async function dirRegistrarEnHistorial(trabajo) {
  try {
    const resultados = trabajo.resultados || [];
    const ok = resultados.filter((r) => r.ok);
    const tokensSeg = ok.map((r) => r.segToken).filter((n) => typeof n === 'number');
    const erroresPorTipo = {};
    for (const r of resultados) {
      if (r.ok) continue;
      const msg = String(r.error || '');
      let tipo = 'otro';
      if (/freno|bloqueo|detenida|HTTP 403|HTTP 429/i.test(msg)) tipo = 'freno del portal';
      else if (/token|captcha/i.test(msg)) tipo = 'token/captcha';
      else if (/Consulta rechazada/.test(msg)) tipo = 'consulta rechazada';
      else if (/XML/.test(msg)) tipo = 'descarga de XML';
      erroresPorTipo[tipo] = (erroresPorTipo[tipo] || 0) + 1;
    }
    const costoTotal = (typeof trabajo.saldoAntes === 'number' && typeof trabajo.saldoDespues === 'number')
      ? Number((trabajo.saldoAntes - trabajo.saldoDespues).toFixed(4))
      : null;
    const registro = {
      ts: trabajo.iniciadoEn,
      perfil: trabajo.perfil,
      perfilEtiqueta: trabajo.perfilEtiqueta,
      total: trabajo.total,
      ok: ok.length,
      fallos: resultados.length - ok.length,
      duracionSeg: trabajo.duracionSeg,
      tokenMedianaSeg: dirMediana(tokensSeg),
      tokenMaxSeg: tokensSeg.length ? Math.max(...tokensSeg) : null,
      tokensPedidos: trabajo.tokensPedidos,
      tokensListos: trabajo.tokensListos,
      tokensFallidos: trabajo.tokensFallidos,
      tokensDescartados: trabajo.tokensDescartados,
      saldoAntes: trabajo.saldoAntes,
      saldoDespues: trabajo.saldoDespues,
      costoPorXml: (costoTotal != null && ok.length) ? Number((costoTotal / ok.length).toFixed(5)) : null,
      erroresPorTipo,
    };
    const d = await chrome.storage.local.get(DIR_HISTORIAL_KEY);
    const lista = Array.isArray(d[DIR_HISTORIAL_KEY]) ? d[DIR_HISTORIAL_KEY] : [];
    lista.unshift(registro);
    await chrome.storage.local.set({ [DIR_HISTORIAL_KEY]: lista.slice(0, DIR_HISTORIAL_MAX) });
  } catch { /* la bitácora nunca frena la descarga */ }
}

async function dirGuardarTrabajo(trabajo) {
  try { await chrome.storage.session.set({ [DIR_TRABAJO_KEY]: trabajo }); } catch { /* noop */ }
}

async function dirLeerTrabajo() {
  try {
    const d = await chrome.storage.session.get(DIR_TRABAJO_KEY);
    return d[DIR_TRABAJO_KEY] || null;
  } catch {
    return null;
  }
}

async function dirCorrerTrabajo(cdcs, clientKey, perfilNombre) {
  dirLatidoStart();
  const perfil = DIR_PERFILES[perfilNombre] || DIR_PERFILES.actual;
  const trabajo = {
    corriendo: true,
    total: cdcs.length,
    hechos: 0,
    resultados: [],
    perfil: DIR_PERFILES[perfilNombre] ? perfilNombre : 'actual',
    perfilEtiqueta: perfil.etiqueta,
    iniciadoEn: Date.now(),
    terminadoEn: null,
    duracionSeg: null,
    tokensPedidos: 0,
    tokensListos: 0,
    tokensFallidos: 0,
    tokensDescartados: 0,
    saldoAntes: null,
    saldoDespues: null,
  };
  const saldoAntesPromesa = dirLeerSaldo(clientKey); // corre en paralelo
  await dirGuardarTrabajo(trabajo);
  try {
    if (trabajo.perfil === 'actual') {
      for (let i = 0; i < cdcs.length; i += 1) {
        const cdc = cdcs[i];
        try {
          trabajo.resultados.push(await dirConsultarYDescargar(cdc, clientKey, trabajo));
        } catch (err) {
          trabajo.resultados.push({ ok: false, cdc, error: err?.message || String(err) });
        }
        trabajo.hechos = trabajo.resultados.length;
        await dirGuardarTrabajo(trabajo);
        if (i < cdcs.length - 1) await dirSleep(perfil.pausaMs); // pausa breve entre CDCs
      }
    } else {
      const maxEnVuelo = perfil.tokensEnVuelo === Infinity ? cdcs.length : perfil.tokensEnVuelo;
      const pool = dirCrearPoolTokens(clientKey, maxEnVuelo, cdcs.length, trabajo);
      pool.reponer();
      let corte = '';
      for (let i = 0; i < cdcs.length; i += 1) {
        const cdc = cdcs[i];
        if (corte) {
          trabajo.resultados.push({ ok: false, cdc, error: `Descarga detenida por posible freno del portal: ${corte}` });
        } else {
          const tTurno = Date.now();
          try {
            await dirMarcar('token', `esperando token para …${cdc.slice(-6)}`);
            let tokenInfo;
            try {
              tokenInfo = await pool.tomar();
            } catch (errToken) {
              // Un intento más de token antes de dar el CDC por fallido.
              await dirMarcar('token', `reintentando token para …${cdc.slice(-6)}`);
              tokenInfo = await pool.tomar();
            }
            pool.reponer(); // el próximo token se resuelve durante la consulta
            const resultado = await dirConsultarConToken(cdc, tokenInfo);
            resultado.segEsperaToken = Number(((tokenInfo.listoEn - tTurno) / 1000).toFixed(1));
            resultado.segTotal = Number(((Date.now() - tTurno) / 1000).toFixed(1));
            trabajo.resultados.push(resultado);
          } catch (err) {
            trabajo.resultados.push({
              ok: false,
              cdc,
              segTotal: Number(((Date.now() - tTurno) / 1000).toFixed(1)),
              error: err?.message || String(err),
            });
            if (err?.bloqueo) corte = err.message;
          }
        }
        trabajo.hechos = trabajo.resultados.length;
        await dirGuardarTrabajo(trabajo);
        if (i < cdcs.length - 1 && perfil.pausaMs) await dirSleep(perfil.pausaMs);
      }
      pool.cerrar();
    }
  } finally {
    trabajo.saldoAntes = await saldoAntesPromesa;
    trabajo.saldoDespues = await dirLeerSaldo(clientKey);
    trabajo.terminadoEn = Date.now();
    trabajo.duracionSeg = Number(((trabajo.terminadoEn - trabajo.iniciadoEn) / 1000).toFixed(1));
    trabajo.corriendo = false;
    await dirGuardarTrabajo(trabajo);
    await dirRegistrarEnHistorial(trabajo);
    await dirMarcar('listo', `descarga directa terminada (${trabajo.perfilEtiqueta})`);
    dirLatidoStop();
  }
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!msg || !['APP_CDC_DIR_DESCARGAR', 'APP_CDC_DIR_ESTADO', 'APP_CDC_DIR_RESULTADOS'].includes(msg.action)) return false;

  const origen = getVerifiedSenderOrigin(sender);
  if (!origen || !ALLOWED_APP_ORIGINS.has(origen)) {
    sendResponse({ ok: false, error: 'origen no autorizado' });
    return false;
  }

  (async () => {
    if (msg.action === 'APP_CDC_DIR_ESTADO') {
      const t = await dirLeerTrabajo();
      sendResponse(t
        ? { ok: true, corriendo: !!t.corriendo, hechos: t.hechos || 0, total: t.total || 0 }
        : { ok: true, corriendo: false, hechos: 0, total: 0 });
      return;
    }
    if (msg.action === 'APP_CDC_DIR_RESULTADOS') {
      const t = await dirLeerTrabajo();
      sendResponse({ ok: true, corriendo: !!t?.corriendo, resultados: t?.resultados || [] });
      return;
    }
    // APP_CDC_DIR_DESCARGAR
    const cdcs = [...new Set((msg.cdcs || []).map((c) => String(c).replace(/\D/g, '')).filter((c) => /^\d{44}$/.test(c)))];
    if (!cdcs.length) {
      sendResponse({ ok: false, error: 'No llegaron CDCs válidos de 44 dígitos.' });
      return;
    }
    const previo = await dirLeerTrabajo();
    if (previo?.corriendo) {
      sendResponse({ ok: false, error: 'Ya hay una descarga directa en curso.' });
      return;
    }
    const guardada = await chrome.storage.local.get([DIR_KEY_STORAGE, DIR_PERFIL_STORAGE]);
    const clientKey = String(guardada[DIR_KEY_STORAGE] || '').trim();
    if (!clientKey) {
      sendResponse({ ok: false, error: 'FALTA_CLAVE_DIRECTA' });
      return;
    }
    const perfilNombre = DIR_PERFILES[guardada[DIR_PERFIL_STORAGE]] ? guardada[DIR_PERFIL_STORAGE] : 'actual';
    dirCorrerTrabajo(cdcs, clientKey, perfilNombre); // sigue en segundo plano; la app consulta el estado
    sendResponse({ ok: true, iniciado: true, total: cdcs.length, perfil: perfilNombre });
  })().catch(() => sendResponse({ ok: false, error: 'La extensión no pudo procesar el pedido.' }));
  return true;
});
