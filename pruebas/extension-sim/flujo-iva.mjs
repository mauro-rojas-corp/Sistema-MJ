import { createRequire } from 'node:module';
const require = createRequire(process.env.PW_MODULES || import.meta.url);
const { chromium } = require('playwright');
// Simulador del flujo del Formulario 120 de la extensión contra un Marangatu
// falso (HTTPS local con el nombre marangatu.set.gov.py). Uso:
//   NUEVA=1 FORM_VENTANA=0 node pruebas/extension-sim/flujo-iva.mjs
// NUEVA: «Presentar Declaración» abre otra ventana (1) o la misma (0).
// FORM_VENTANA: «Abrir declaración» abre el formulario en otra ventana (1) o
// lo dibuja en la misma pantalla (0). Necesita Playwright y openssl.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const AQUI = dirname(fileURLToPath(import.meta.url));
const EXT = join(AQUI, '..', '..', 'Extension');
const CERT_DIR = process.env.CERT_DIR || '/tmp/ekuatia-sim';
execSync(`mkdir -p ${CERT_DIR} && [ -f ${CERT_DIR}/cert.pem ] || openssl req -x509 -newkey rsa:2048 -nodes -keyout ${CERT_DIR}/key.pem -out ${CERT_DIR}/cert.pem -days 30 -subj "/CN=marangatu.set.gov.py" -addext "subjectAltName=DNS:marangatu.set.gov.py" 2>/dev/null`);
const ID = 'dffknnjnidhfldehfalchalikfkjbehm';
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) process.exitCode = 1; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Marangatu simulado (la sesión se comparte entre pestañas, como el real)
const st = { user: null, logouts: 0, logins: [] };
const VARIANTE_PRESENTAR_NUEVA = process.env.NUEVA !== '0';
const pagina = (body, title = 'MARANGATU') => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
// Como el real: el menú del usuario con «Salir» está en el menú principal /eset/.
const navbar = () => `<nav class="navbar"><a id="navbarDropdownMenuLink" href="#" onclick="document.getElementById('dd').style.display='block';return false">CONTRIBUYENTE ${st.user}</a>
  <div id="dd" class="dropdown-menu" style="display:none"><a class="dropdown-item" href="/eset/logout">
							<i class="fa fa-sign-out" aria-hidden="true"></i> Salir
						</a></div></nav>`;
async function marangatu(req, res, cuerpo) {
  const url = new URL(req.url, 'https://marangatu.set.gov.py');
  const p = url.pathname;
  const redir = (to) => { res.writeHead(302, { location: to }); res.end(); };
  const html = (b, t) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(pagina(b, t)); };
  if (p === '/eset/login' && req.method === 'POST') {
    const f = new URLSearchParams(cuerpo || '');
    st.user = f.get('usuario'); st.logins.push(st.user);
    return redir('https://marangatu.set.gov.py/eset/');
  }
  if (p === '/eset/login') {
    if (st.user) return redir('https://marangatu.set.gov.py/eset/');
    return html(`<h1>Acceso</h1><form method="post" action="/eset/login"><input type="text" name="usuario"><input type="password" name="clave"><button type="submit">Ingresar</button></form>`, 'Login');
  }
  if (p === '/eset/logout') {
    (st.salidas ||= []).push(req.headers.referer || '(directo)');
    if (!String(req.headers.referer || '').endsWith('/eset/')) return html('<p>Solicitud inválida</p>');
    st.user = null; st.logouts += 1; return redir('https://marangatu.set.gov.py/eset/login'); }
  if (!st.user) return redir('https://marangatu.set.gov.py/eset/login');
  if (p === '/eset/' || p === '/eset') {
    return html(`<div id="nav"></div><script>setTimeout(() => { document.getElementById('nav').innerHTML = ${'`'}${navbar().replace(/`/g, '')}${'`'}; }, 800);</script><div>CONSULTAS</div><a href="/eset/recibirDDJJContribuyente.do?_cyp=T${Date.now()}" ${VARIANTE_PRESENTAR_NUEVA ? 'target="_blank" rel="opener"' : ''} title="Presentar Declaración">Presentar Declaración</a>`, 'Bienvenido | MARANGATU');
  }
  if (p === '/eset/mantenerAbmXsl.do') return html(`<h2>Visión Integral del Contribuyente</h2><button name="botonConsultar">Búsqueda</button>`);
  if (p === '/eset/recibirDDJJContribuyente.do') {
    return html(`<div id="app"><h3>Presentar declaración</h3>
      <select data-ng-model="vm.datos.obligacion"></select>
      <select data-ng-model="vm.datos.periodicidad"></select>
      <select data-ng-model="vm.datos.anio"></select>
      <select data-ng-model="vm.datos.mes"></select>
      <button id="abrir" disabled>Abrir declaración</button></div>
      <script>
        const s = (m) => document.querySelector('select[data-ng-model="vm.datos.' + m + '"]');
        const llenar = (m, ops) => { s(m).innerHTML = '<option value="">--</option>' + ops.map(([v,t]) => '<option value="'+v+'">'+t+'</option>').join(''); };
        setTimeout(() => llenar('obligacion', [['211','211 - IVA GENERAL'],['715','715 - IRP']]), 400);
        s('obligacion').addEventListener('change', () => setTimeout(() => llenar('periodicidad', [['1','MENSUAL']]), 300));
        s('periodicidad').addEventListener('change', () => setTimeout(() => llenar('anio', [['2025','2025'],['2026','2026']]), 300));
        s('anio').addEventListener('change', () => setTimeout(() => llenar('mes', Array.from({length:12},(_,i)=>[String(i+1), String(i+1)])), 300));
        s('mes').addEventListener('change', () => { document.getElementById('abrir').disabled = false; });
        document.getElementById('abrir').onclick = () => {
          if (${process.env.FORM_VENTANA === '1'}) { window.open('/eset/formulario120.do', '_blank'); return; }
          // Como Angular: el formulario aparece en la misma pantalla, un rato después.
          setTimeout(() => {
            document.getElementById('app').innerHTML = '<h3>Formulario 120</h3>' +
              '<input id="C10" onchange="document.getElementById(\\'C44\\').value = Math.round(Number(this.value.replace(/\\\\D/g,\\'\\'))*0.1)">' +
              '<input id="C11"><input id="C44" readonly><button>Presentar</button>' +
              '<button id="cerrarDecl" onclick="window.opener.postMessage(\\'declaracion-cerrada\\', \\'*\\'); window.close()">Cerrar</button>';
          }, 900);
        };
      </script>`, 'Presentar Declaración');
  }
  if (p === '/eset/formulario120.do') {
    return html('<h3>Formulario 120</h3><input id="C10" onchange="document.getElementById(\'C44\').value = Math.round(Number(this.value.replace(/\\D/g,\'\'))*0.1)"><input id="C11"><input id="C44" readonly>' +
      '<button id="cerrarDecl" onclick="window.opener.postMessage(\'declaracion-cerrada\', \'*\'); window.close()">Cerrar</button>', 'Formulario 120');
  }
  return html(`<p>otra página ${p}</p>`);
}

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
const srv = https.createServer({ key: fs.readFileSync(CERT_DIR + '/key.pem'), cert: fs.readFileSync(CERT_DIR + '/cert.pem') }, (req, res) => {
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => marangatu(req, res, b));
});
await new Promise((r) => srv.listen(8443, '127.0.0.1', r));
const appSrv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(pagina('<h1>App</h1>')); });
await new Promise((r) => appSrv.listen(3999, '127.0.0.1', r));
const ctx = await chromium.launchPersistentContext(CERT_DIR + '/perfil-' + Date.now(), {
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  ignoreHTTPSErrors: true,
  ignoreDefaultArgs: ['--disable-popup-blocking'],
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-proxy-server', '--ignore-certificate-errors',
    '--host-resolver-rules=MAP marangatu.set.gov.py:443 127.0.0.1:8443, MAP localhost:3000 127.0.0.1:3999'],
});
let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const errores = [];
sw.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
ok(sw.url().includes(ID), 'extensión cargada con el ID fijo ' + ID);

const app = await ctx.newPage();
await app.goto('http://localhost:3000/');
const enviar = (msg) => app.evaluate(([id, m]) => new Promise((res) => chrome.runtime.sendMessage(id, m, (r) => res(r || { lastError: chrome.runtime.lastError && chrome.runtime.lastError.message }))), [ID, msg]);
const pedirIva = (ruc, c10) => enviar({ action: 'APP_IVA_PREPARE', ruc, nombre: 'Cliente ' + ruc, periodo: '2026-10', casillas: [{ cas: '10', valor: c10 }], control: [{ cas: '44', valor: Math.round(c10 * 0.1) }], user: ruc, pass: 'clave' });
const marangatuTabs = () => ctx.pages().filter((p) => p.url().startsWith('https://marangatu.set.gov.py'));
async function esperar(fn, ms = 20000, paso = 250) { const fin = Date.now() + ms; while (Date.now() < fin) { const v = await fn(); if (v) return v; await dormir(paso); } return null; }
const paginaPresentar = () => esperar(async () => marangatuTabs().find((p) => p.url().includes('recibirDDJJContribuyente.do')));

async function completarHastaFormulario(tag, c10) {
  const pres = await paginaPresentar();
  ok(!!pres, `${tag}: llegó a «Presentar Declaración»`);
  if (!pres) return null;
  await pres.waitForLoadState('domcontentloaded');
  if (VARIANTE_PRESENTAR_NUEVA) ok(!!(await pres.opener()), `${tag}: «Presentar Declaración» la abrió la página de Marangatu (con su ventana de origen)`);
  const elegido = await esperar(() => pres.evaluate(() => {
    const v = (m) => document.querySelector('select[data-ng-model="vm.datos.' + m + '"]').value;
    return v('obligacion') === '211' && v('periodicidad') === '1' && v('anio') === '2026' && v('mes') === '10';
  }).catch(() => false), 15000);
  ok(!!elegido, `${tag}: eligió 211 · Mensual · 2026 · 10 solo`);
  // La persona toca «Abrir declaración».
  const antes = new Set(ctx.pages());
  await pres.click('#abrir');
  let form = pres;
  if (process.env.FORM_VENTANA === '1') {
    form = await esperar(async () => ctx.pages().find((p) => !antes.has(p) && p.url().includes('formulario120.do')), 10000);
    ok(!!form, `${tag}: el formulario se abrió en una ventana aparte`);
    if (!form) return null;
  }
  const lleno = await esperar(() => form.evaluate(() => { const e = document.getElementById('C10'); return e && e.value; }).catch(() => null), 15000);
  ok(lleno === String(c10), `${tag}: completó la casilla 10 cuando apareció el formulario (${lleno})`);
  const c44 = await form.evaluate(() => document.getElementById('C44').value);
  ok(c44 === String(Math.round(c10 * 0.1)), `${tag}: Marangatu calculó la casilla 44 (${c44})`);
  const ref = await esperar(() => form.evaluate(() => { const b = document.getElementById('ekuatia-referencia'); return b && b.innerText.includes('Casillas cargadas: 10') ? b.innerText : null; }).catch(() => null), 8000);
  ok(!!ref && ref.includes('coinciden'), `${tag}: recuadro con el resultado y totales que coinciden`);
  // «Cerrar» de la declaración: tiene que cerrar su ventana (necesita la
  // «ventana que la abrió», como en Marangatu).
  if (process.env.NUEVA !== '0' || process.env.FORM_VENTANA === '1') {
    const cerrada = form.waitForEvent('close', { timeout: 6000 }).then(() => true).catch(() => false);
    const errs = []; form.on('pageerror', (e) => errs.push(e.message));
    await form.click('#cerrarDecl', { noWaitAfter: true }).catch(() => {});
    ok(await cerrada, `${tag}: «Cerrar» de la declaración cierra su ventana ${errs.join(' ')}`);
  }
  return pres;
}

// 1) Sin Marangatu abierto: cliente A
let r = await pedirIva('80000001', 1000000);
ok(r && r.ok, '1. la app pide el Formulario 120 del cliente A: ' + JSON.stringify(r));
ok(!!(await esperar(() => st.logins.at(-1) === '80000001', 8000)), '1. inyectó el login del cliente A');
await completarHastaFormulario('1', 1000000);


// 2) Mismo cliente otra vez: no cierra la sesión
const logoutsAntes = st.logouts, loginsAntes = st.logins.length;
r = await pedirIva('80000001', 2000000);
ok(r && r.ok, '2. mismo cliente otra vez: ' + JSON.stringify(r));
await dormir(1500);
ok(st.logouts === logoutsAntes && st.logins.length === loginsAntes, '2. reutilizó la sesión (sin cerrar ni volver a entrar)');
// cerrar la pestaña de presentar vieja para encontrar la nueva
for (const p of marangatuTabs()) if (p.url().includes('recibirDDJJ')) { /* se deja */ }

// 3) Otro cliente, con la pestaña de trabajo en una ventana SIN menú (Visión Integral)
const trabajo = marangatuTabs().find((p) => !p.url().includes('recibirDDJJ')) || marangatuTabs()[0];
await trabajo.goto('https://marangatu.set.gov.py/eset/mantenerAbmXsl.do');
const pestanasAntes = marangatuTabs().length;
const logouts2 = st.logouts;
r = await pedirIva('80000002', 3000000);
ok(r && r.ok, '3. otro cliente (B) con la pestaña en una ventana sin menú: ' + JSON.stringify(r));
ok(st.logouts === logouts2 + 1, `3. cerró la sesión del cliente A (cierres: ${st.logouts - logouts2})`);
ok(!!(await esperar(() => st.logins.at(-1) === '80000002' && st.user === '80000002', 8000)), '3. entró con el cliente B');
await dormir(500);
console.log(`   pestañas de Marangatu antes: ${pestanasAntes}, después de cerrar las del cliente A: ${marangatuTabs().filter((p) => !p.url().includes('recibirDDJJ')).length} + presentar`);
await completarHastaFormulario('3', 3000000);
ok(marangatuTabs().every((p) => !p.url().includes('mantenerAbmXsl')), '3. no quedaron ventanas del cliente A');

// 4) Cerrar sesión desde la app
r = await enviar({ action: 'APP_CERRAR_SESION' });
await dormir(800);
ok(r && r.ok && st.user === null, '4. cerrar sesión desde la app: ' + JSON.stringify(r));
ok(marangatuTabs().length === 1 && marangatuTabs()[0].url().includes('/eset/login'), `4. quedó una sola ventana de Marangatu, en el acceso (${marangatuTabs().map((p) => p.url()).join(', ')})`);

// 5) Sesión iniciada A MANO con otro usuario y después «Abrir Marangatu» de un cliente
for (const p of marangatuTabs()) await p.close();
st.user = 'MANUAL';
const manual = await ctx.newPage();
await manual.goto('https://marangatu.set.gov.py/eset/');
await dormir(1500);
const l5 = st.logouts;
r = await enviar({ action: 'APP_AUTO_LOGIN', user: '80000003', pass: 'x' });
ok(r && r.ok, '5. «Abrir Marangatu» con una sesión iniciada a mano: ' + JSON.stringify(r));
ok(st.logouts === l5 + 1 && !!(await esperar(() => st.user === '80000003', 8000)), '5. cerró la sesión manual y entró con el cliente pedido');

ok(errores.length === 0, 'sin errores en la extensión ' + errores.join(' / '));
console.log('   SALIDAS desde:', JSON.stringify(st.salidas));
ok((st.salidas || []).every((r) => r.endsWith('/eset/')), 'cada cierre fue el clic en «Salir» del menú principal');
await ctx.close(); srv.close(); appSrv.close();
