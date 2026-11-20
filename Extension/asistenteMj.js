// ============================================================================
// ASISTENTE MJ: botón flotante de navegación en Marangatu (v2.18)
// ----------------------------------------------------------------------------
// Botón redondo con el logo de MJ (abajo a la izquierda, se puede arrastrar).
// Al tocarlo abre un menú con destinos:
//   · Obtener comprobantes: menú principal → Declaraciones Informativas →
//     Gestión de Comprobantes Informativos → Obtener Comprob. Elect. y
//     Virtuales. Marangatu abre ventanas nuevas: cada una retoma el paso.
//     Ahí mismo: elegir mes y año busca con un clic.
//   · Visión integral del contribuyente (Consultas).
//   · Presentar declaración.
//   · Menú principal.
// Si se pide un destino fuera del menú principal, primero vuelve al menú y
// sigue solo. Los CDC se marcan con la columna «XML» del recolector.
// Viene de «Marangatu Helper» (sin su Extraer/Procesar KuDE).
// Guarda en el localStorage de Marangatu sólo posición, tamaño, último
// mes/año y el destino pendiente (1 minuto). Nada de claves ni clientes.
// ============================================================================
(function () {
  'use strict';
  if (window !== window.top) return;
  if (document.getElementById('mjas-widget')) return;
  if (/\/eset\/login/i.test(location.pathname)) return; // en el acceso no hace falta

  var INICIO_URL = 'https://marangatu.set.gov.py/eset/';
  // Logo sin el cuadro blanco del ícono (fondo transparente).
  var LOGO = chrome.runtime.getURL('asistente-logo.png');

  var TAB_ID = sessionStorage.getItem('mjas_tab_id');
  if (!TAB_ID) {
    TAB_ID = Math.random().toString(36).slice(2);
    sessionStorage.setItem('mjas_tab_id', TAB_ID);
  }

  // Datos de versiones anteriores (helper original y botón de calendario de la 2.16).
  try {
    localStorage.removeItem('mjas_current_cdc');
    localStorage.removeItem('mjas_cdc_action');
    var viejo = JSON.parse(localStorage.getItem('mjas_state') || 'null');
    if (viejo && viejo.cdcList) localStorage.setItem('mjas_state', JSON.stringify({ lastMonth: viejo.lastMonth || null, lastYear: viejo.lastYear || null }));
    if (!localStorage.getItem('mj_asistente_v2')) { localStorage.removeItem('mjas_position'); localStorage.setItem('mj_asistente_v2', '1'); }
    var oldPos = JSON.parse(localStorage.getItem('mjas_position') || 'null');
    if (oldPos && (oldPos.x < 0 || oldPos.y < 0 || oldPos.x > window.innerWidth || oldPos.y > window.innerHeight)) localStorage.removeItem('mjas_position');
  } catch { localStorage.removeItem('mjas_config'); localStorage.removeItem('mjas_position'); }

  var PAGE = detectPage();

  function detectPage() {
    var url = window.location.href;
    if (url.indexOf('/eset/gdi/registroComprobantesVirtuales.do') !== -1)
      return { id: 'comprobantes', label: 'Obtener comprobantes', color: '#10b981' };
    if (url.indexOf('/eset/gestionComprobantesVirtuales') !== -1 ||
        (url.indexOf('/eset/gdi/') !== -1 && url.indexOf('registroComprobantesVirtuales') === -1))
      return { id: 'gestion', label: 'Gestión de comprobantes', color: '#6366f1' };
    if (url.indexOf('mantenerAbmXsl.do') !== -1)
      return { id: 'vision', label: 'Visión integral', color: '#0ea5e9' };
    if (url.indexOf('recibirDDJJContribuyente.do') !== -1)
      return { id: 'presentar', label: 'Presentar declaración', color: '#f97316' };
    if (url.indexOf('/eset/main.do') !== -1 || url.indexOf('/eset/inicio') !== -1 || /\/eset\/?(\?|#|$)/.test(url))
      return { id: 'main', label: 'Menú principal', color: '#f59e0b' };
    return { id: 'other', label: 'Marangatu', color: '#64748b' };
  }

  var MONTHS = [
    { label: 'Ene', value: '1', full: 'Enero' }, { label: 'Feb', value: '2', full: 'Febrero' },
    { label: 'Mar', value: '3', full: 'Marzo' }, { label: 'Abr', value: '4', full: 'Abril' },
    { label: 'May', value: '5', full: 'Mayo' }, { label: 'Jun', value: '6', full: 'Junio' },
    { label: 'Jul', value: '7', full: 'Julio' }, { label: 'Ago', value: '8', full: 'Agosto' },
    { label: 'Sep', value: '9', full: 'Septiembre' }, { label: 'Oct', value: '10', full: 'Octubre' },
    { label: 'Nov', value: '11', full: 'Noviembre' }, { label: 'Dic', value: '12', full: 'Diciembre' },
  ];
  var currentYear = new Date().getFullYear();
  var YEARS = Array.from({ length: 10 }, function (_, i) { return currentYear - i; });

  var DESTINOS = [
    { id: 'comprobantes', titulo: 'Obtener comprobantes', detalle: 'Comprobantes electrónicos y virtuales (XML)' },
    { id: 'vision', titulo: 'Visión integral', detalle: 'Consultas · declaraciones presentadas' },
    { id: 'presentar', titulo: 'Presentar declaración', detalle: 'Formularios (IVA 120 y otros)' },
    { id: 'inicio', titulo: 'Menú principal', detalle: 'Volver al inicio de Marangatu' },
  ];

  var SIZES = {
    small: { width: 270, fontSize: 11, btnSize: 46 },
    medium: { width: 320, fontSize: 12, btnSize: 56 },
    large: { width: 370, fontSize: 13, btnSize: 66 },
  };
  function loadConfig() {
    try {
      var c = JSON.parse(localStorage.getItem('mjas_config') || 'null');
      if (c) return { locked: !!c.locked, size: SIZES[c.size] ? c.size : 'medium' };
    } catch { /* por defecto */ }
    return { locked: false, size: 'medium' };
  }
  function saveConfig() { localStorage.setItem('mjas_config', JSON.stringify(config)); applySize(); }
  var config = loadConfig();

  function applySize() {
    var s = SIZES[config.size] || SIZES.medium;
    var w = document.getElementById('mjas-widget');
    var t = document.getElementById('mjas-widget-toggle');
    if (w) { w.style.width = s.width + 'px'; w.style.fontSize = s.fontSize + 'px'; }
    if (t) { t.style.width = s.btnSize + 'px'; t.style.height = s.btnSize + 'px'; }
  }

  function loadState() {
    try { var s = JSON.parse(localStorage.getItem('mjas_state') || 'null'); if (s) return s; } catch { /* vacío */ }
    return { lastMonth: null, lastYear: null };
  }
  function saveState() { localStorage.setItem('mjas_state', JSON.stringify({ lastMonth: state.lastMonth, lastYear: state.lastYear })); }

  // Destino pendiente: { active, dest, step, ts, tabId, url }.
  function loadNav() {
    try { var n = JSON.parse(localStorage.getItem('mjas_nav') || 'null'); if (n) return n; } catch { /* vacío */ }
    return { active: false };
  }
  function saveNav(dest, step) {
    localStorage.setItem('mjas_nav', JSON.stringify({ active: true, dest: dest, step: step, ts: Date.now(), tabId: TAB_ID, url: window.location.href }));
  }
  function clearNav() { localStorage.removeItem('mjas_nav'); }

  var persisted = loadState();
  var state = { lastMonth: persisted.lastMonth, lastYear: persisted.lastYear, open: false };

  function defaultPosition() {
    var s = SIZES[config.size] || SIZES.medium;
    return { x: 18, y: window.innerHeight - s.btnSize - 18 };
  }
  function loadPosition() {
    try { var p = JSON.parse(localStorage.getItem('mjas_position') || 'null'); if (p) return p; } catch { /* por defecto */ }
    return defaultPosition();
  }
  function savePosition(x, y) { localStorage.setItem('mjas_position', JSON.stringify({ x: x, y: y })); }

  function xpathEl(path) {
    return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }
  function triggerChange(el) {
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function getMonthObj(val) { return MONTHS.find(function (x) { return x.value === val; }); }
  // Íconos SVG en línea (trazos de Lucide, licencia ISC, la misma familia que
  // usa la app). Nada de emojis: se ven igual en cualquier PC y heredan el
  // color. Las animaciones (al pasar el mouse, al aparecer) están en el CSS.
  var ICONOS = {
    comprobantes: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    vision: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    presentar: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/>',
    inicio: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    calendario: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    ajustes: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    cerrar: '<path d="M18 6 6 18M6 6l12 12"/>',
    ok: '<path class="mj-trazo" d="M20 6 9 17l-5-5"/>',
    alerta: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    candado: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    abierto: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    reiniciar: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    volver: '<path d="m12 19-7-7 7-7M19 12H5"/>',
    seguir: '<path d="m9 18 6-6-6-6"/>',
  };
  function svg(nombre, clase) {
    return '<svg class="mj-ico' + (clase ? ' ' + clase : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONOS[nombre] || '') + '</svg>';
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function waitFor(fn, timeout) {
    return new Promise(function (resolve, reject) {
      var start = Date.now();
      var check = setInterval(function () {
        var el = fn();
        if (el) { clearInterval(check); resolve(el); }
        else if (Date.now() - start > (timeout || 5000)) { clearInterval(check); reject(new Error('timeout')); }
      }, 100);
    });
  }

  function visible(el) { return el && el.offsetParent !== null && !el.closest('#mjas-widget'); }

  // Elemento clicable (enlace, botón, ítem) cuyo texto contiene `texto`.
  function findClickableByText(texto) {
    var t = texto.toLowerCase();
    var all = document.querySelectorAll('a, button, li, [data-ng-click], .cursor-pointer');
    var mejor = null;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!visible(el)) continue;
      var txt = (el.textContent || '').trim().replace(/\s+/g, ' ');
      if (txt.length > 160 || txt.toLowerCase().indexOf(t) === -1) continue;
      if (!mejor || txt.length < (mejor.textContent || '').trim().length) mejor = el;
    }
    return mejor;
  }

  function findMenuCards(text) {
    var results = [], seen = [], i, inner, el;
    function push(e) { if (e && seen.indexOf(e) === -1) { seen.push(e); results.push(e); } }
    var ngClicks = document.querySelectorAll('[data-ng-click]');
    for (i = 0; i < ngClicks.length; i++) {
      inner = (ngClicks[i].textContent || '').trim().replace(/\s+/g, ' ');
      if (inner.indexOf(text) !== -1) push(ngClicks[i]);
    }
    var cursors = document.querySelectorAll('.cursor-pointer');
    for (i = 0; i < cursors.length; i++) {
      inner = (cursors[i].textContent || '').trim().replace(/\s+/g, ' ');
      if (inner.indexOf(text) !== -1) push(cursors[i]);
    }
    var tags = document.querySelectorAll('h4, h3, h2, div.ng-binding, span.ng-binding');
    for (i = 0; i < tags.length; i++) {
      inner = (tags[i].textContent || '').trim().replace(/\s+/g, ' ');
      if (inner.indexOf(text) !== -1) {
        el = tags[i].closest('[data-ng-click]') || tags[i].closest('.cursor-pointer');
        push(el);
      }
    }
    return results.filter(function (e) { return !e.closest('#mjas-widget'); });
  }
  function findMenuCard(text, occurrence) {
    var m = findMenuCards(text);
    return m[Math.max(0, (occurrence || 1) - 1)] || m[0] || null;
  }
  function clickElement(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  // --- Pantallas del panel -----------------------------------------------------
  function body() { return document.getElementById('mjas-body'); }
  function openWidget() {
    if (state.open) return;
    state.open = true;
    document.getElementById('mjas-widget').classList.add('mjas-open');
    document.getElementById('mjas-widget-toggle').classList.add('mj-activo');
    positionWidget();
  }
  function closeWidget() {
    state.open = false;
    document.getElementById('mjas-widget').classList.remove('mjas-open');
    document.getElementById('mjas-widget-toggle').classList.remove('mj-activo');
  }
  function navStatus(text) {
    body().innerHTML = '<div class="mjas-nav-status"><div class="mjas-nav-spinner"></div><span>' + text + '</span></div>';
  }
  function navError(text) {
    body().innerHTML = '<div class="mjas-status error mj-estado">' + svg('alerta') + '<span>' + text + '</span></div>';
    clearNav();
    setTimeout(function () { if (state.open) showMenu(); }, 2200);
  }
  function navDone(text) {
    body().innerHTML = '<div class="mjas-status success mj-estado">' + svg('ok', 'mj-dibuja') + '<span>' + text + '</span></div>';
    setTimeout(closeWidget, 900);
  }

  function updateContextBar() {
    var bar = document.getElementById('mjas-context-bar');
    if (!bar) return;
    bar.innerHTML = '<span class="mjas-ctx-dot" style="background:' + PAGE.color + '"></span><span class="mjas-ctx-label">Estás en: ' + esc(PAGE.label) + '</span>';
  }

  function showMenu() {
    updateContextBar();
    var html = '';
    if (PAGE.id === 'comprobantes') {
      html += '<button class="mj-dest mj-dest-destacado" id="mj-periodo"><span class="mj-dest-icono">' + svg('calendario') + '</span>' +
        '<span class="mj-dest-texto"><strong>Buscar por mes</strong><small>Elegir mes y año en esta pantalla</small></span></button>';
    }
    html += '<p class="mjas-step-label">¿A dónde vamos?</p><div class="mj-destinos">';
    DESTINOS.forEach(function (d) {
      var aca = d.id === PAGE.id || (d.id === 'inicio' && PAGE.id === 'main');
      html += '<button class="mj-dest' + (aca ? ' mj-aca' : '') + '" data-dest="' + d.id + '"' + (aca ? ' disabled' : '') + '>' +
        '<span class="mj-dest-icono mj-ico-' + d.id + '">' + svg(d.id) + '</span>' +
        '<span class="mj-dest-texto"><strong>' + d.titulo + '</strong><small>' + (aca ? 'Ya estás acá' : d.detalle) + '</small></span>' +
        (aca ? '' : svg('seguir', 'mj-flecha')) + '</button>';
    });
    html += '</div>';
    body().innerHTML = html;
    body().querySelectorAll('[data-dest]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); irA(b.dataset.dest); });
    });
    var p = document.getElementById('mj-periodo');
    if (p) p.addEventListener('click', function (e) { e.stopPropagation(); showMonths(); });
  }

  // --- Navegación --------------------------------------------------------------
  function irA(dest) {
    if (dest === 'inicio') {
      clearNav();
      if (PAGE.id === 'main') { navDone('Ya estás en el menú principal'); return; }
      navStatus('Volviendo al menú principal…');
      location.href = INICIO_URL;
      return;
    }
    if (dest === 'comprobantes' && (PAGE.id === 'gestion' || PAGE.id === 'comprobantes')) { irAComprobantes(); return; }
    if (PAGE.id !== 'main') {
      // Primero al menú principal; al cargar, sigue solo.
      saveNav(dest, 'ir-inicio');
      navStatus('Volviendo al menú principal para seguir…');
      location.href = INICIO_URL;
      return;
    }
    desdeInicio(dest);
  }

  function desdeInicio(dest) {
    if (dest === 'comprobantes') irAComprobantes();
    else if (dest === 'vision') irAVision();
    else if (dest === 'presentar') irAPresentar();
  }

  function irAComprobantes() {
    if (PAGE.id === 'main' || PAGE.id === 'other') {
      saveNav('comprobantes', 1);
      navStatus('Paso 1/3: Declaraciones Informativas…');
      waitFor(function () {
        var el1 = findMenuCard('Declaraciones Informativas', 2);
        if (!el1) {
          var dx = xpathEl('/html/body/div[1]/div/div/div/div[2]/div/div[1]/div/div/div/div/section/div/div/div[2]/div/div/div[9]/div/div[1]');
          if (dx) el1 = dx.closest('[data-ng-click]') || dx.closest('.cursor-pointer') || dx;
        }
        return el1;
      }, 8000)
        .then(function (el1) {
          clickElement(el1);
          saveNav('comprobantes', 2);
          navStatus('Paso 2/3: Gestión de Comprobantes…');
          return waitFor(function () { return findMenuCard('Comprobantes Informativos'); }, 6000)
            .then(function (el2) {
              saveNav('comprobantes', 3);
              clickElement(el2);
              navDone('Abriendo Gestión de Comprobantes…');
            })
            .catch(function () { navError('No encontré Gestión de Comprobantes'); });
        })
        .catch(function () { navError('No encontré Declaraciones Informativas'); });
      return;
    }

    if (PAGE.id === 'gestion') {
      saveNav('comprobantes', 3);
      navStatus('Paso 3/3: Obtener Comprobantes…');
      waitFor(function () {
        var cards = document.querySelectorAll('.card-action-green');
        for (var i = 0; i < cards.length; i++) {
          var h4 = cards[i].querySelector('h4');
          if (h4 && h4.textContent.trim() === 'Obtener Comprob. Elect. y Virtuales') return cards[i];
        }
        return null;
      }, 10000)
        .then(function (target) {
          clearNav();
          target.click();
          navDone('Abriendo Obtener Comprobantes…');
        })
        .catch(function () { navError('No encontré Obtener Comprobantes'); });
      return;
    }

    if (PAGE.id === 'comprobantes') { clearNav(); showMonths(); return; }
    navError('Navegá al menú principal');
  }

  function irAVision() {
    saveNav('vision', 1);
    navStatus('Abriendo Consultas…');
    waitFor(function () { return findClickableByText('Consultas'); }, 8000)
      .then(function (menu) {
        clickElement(menu);
        navStatus('Buscando Visión integral…');
        return waitFor(function () { return findClickableByText('Visión Integral'); }, 8000)
          .then(function (link) {
            clearNav();
            clickElement(link);
            navDone('Abriendo Visión integral…');
          })
          .catch(function () { navError('No encontré Visión integral del contribuyente'); });
      })
      .catch(function () { navError('No encontré el menú Consultas'); });
  }

  function irAPresentar() {
    navStatus('Buscando Presentar declaración…');
    waitFor(function () {
      var link = document.querySelector('a[href*="recibirDDJJContribuyente.do"]');
      if (link && !link.closest('#mjas-widget')) return link;
      return findClickableByText('Presentar Declaraci');
    }, 8000)
      .then(function (link) {
        clearNav();
        // Clic dentro de la página (como una persona): Marangatu abre su ventana.
        link.click();
        navDone('Abriendo Presentar declaración…');
      })
      .catch(function () { navError('No encontré Presentar declaración'); });
  }

  // --- Mes y año (pantalla Obtener comprobantes) ---------------------------------
  function showMonths() {
    updateContextBar();
    var hasYear = state.lastYear !== null && state.lastYear !== undefined;
    var html = '';
    if (hasYear) {
      html += '<button class="mjas-year-bar" id="mjas-change-year">' +
        '<span class="mjas-year-bar-text">Año: <strong>' + state.lastYear + '</strong></span>' +
        '<span class="mjas-year-bar-arrow">cambiar ' + svg('seguir') + '</span></button>';
    }
    html += '<p class="mjas-step-label">Elegí el mes</p><div class="mjas-month-grid" id="mjas-months"></div>' +
      '<p class="mjas-hint">Para bajar XML, marcá los CDC en la columna <b>XML</b> de la tabla («Marcar todas las páginas» y «Crear lote»).</p>' +
      '<button class="mjas-back-btn" id="mjas-back">' + svg('volver') + ' Destinos</button>';
    body().innerHTML = html;

    var container = document.getElementById('mjas-months');
    MONTHS.forEach(function (m) {
      var btn = document.createElement('button');
      btn.className = 'mjas-month-btn' + (state.lastMonth === m.value ? ' last-used' : '');
      btn.textContent = m.label;
      btn.addEventListener('click', function (e) {
        e.stopPropagation(); state.lastMonth = m.value; saveState();
        if (hasYear) executeQuick(m.value, state.lastYear); else showYears();
      });
      container.appendChild(btn);
    });
    var cb = document.getElementById('mjas-change-year');
    if (cb) cb.addEventListener('click', function (e) { e.stopPropagation(); yearGrid('Cambiar año', function () { showMonths(); }); });
    document.getElementById('mjas-back').addEventListener('click', function (e) { e.stopPropagation(); showMenu(); });
  }

  function yearGrid(title, onPick, intro) {
    updateContextBar();
    body().innerHTML = (intro || '') + '<p class="mjas-step-label">' + title + '</p><div class="mjas-year-grid" id="mjas-years"></div>';
    var c = document.getElementById('mjas-years');
    YEARS.forEach(function (y) {
      var btn = document.createElement('button');
      btn.className = 'mjas-year-item' + (state.lastYear === y ? ' selected' : '');
      btn.textContent = y;
      btn.addEventListener('click', function (e) { e.stopPropagation(); state.lastYear = y; saveState(); onPick(y); });
      c.appendChild(btn);
    });
  }
  function showYears() {
    var m = getMonthObj(state.lastMonth);
    yearGrid('Elegí el año', function (y) { executeFirst(state.lastMonth, y); },
      '<div class="mjas-chosen"><span class="mjas-chosen-label">Mes:</span><span class="mjas-chosen-value">' + m.full + '</span></div>');
  }

  function selectPeriod(month, year) {
    var ys = document.querySelector('#periodo > div > div:nth-child(1) > select') || xpathEl('//*[@id="periodo"]/div/div[1]/select');
    if (ys) { ys.value = String(year); triggerChange(ys); }
    var ms = document.querySelector('#periodo > div > div:nth-child(2) > select') || xpathEl('//*[@id="periodo"]/div/div[2]/select');
    if (ms) { ms.value = month; triggerChange(ms); }
    return !!(ys && ms);
  }
  function clickBuscar(m, year) {
    var label = xpathEl('//*[@id="imputaciones"]/div[2]/div[1]/div/div[1]/div[1]/label/span');
    if (label) label.click();
    setTimeout(function () {
      var btn = xpathEl('//*[@id="botones"]/div/div[2]/button');
      if (btn) { btn.click(); showStatusInBody(m.full + ' ' + year, 'success'); setTimeout(closeWidget, 800); }
      else { showStatusInBody('Botón de búsqueda no encontrado', 'error'); setTimeout(showMonths, 1500); }
    }, 300);
  }
  function executeFirst(month, year) {
    var m = getMonthObj(month);
    showStatusInBody(m.full + ' ' + year + '...', 'loading');
    if (!selectPeriod(month, year)) { showStatusInBody('No encontré el período en esta página', 'error'); setTimeout(showMonths, 1500); return; }
    setTimeout(function () { clickBuscar(m, year); }, 300);
  }
  function executeQuick(month, year) {
    var m = getMonthObj(month);
    showStatusInBody(m.full + ' ' + year + '...', 'loading');
    // Si ya hay un resultado en pantalla, se vuelve a las opciones de búsqueda.
    var opcionesLink = xpathEl('//*[@id="opciones"]/div/div[1]/div/div[1]/div/a[1]');
    if (opcionesLink) opcionesLink.click();
    setTimeout(function () {
      if (!selectPeriod(month, year)) { showStatusInBody('No encontré el período en esta página', 'error'); setTimeout(showMonths, 1500); return; }
      setTimeout(function () { clickBuscar(m, year); }, 300);
    }, 400);
  }
  function showStatusInBody(msg, type) {
    var ico = type === 'success' ? svg('ok', 'mj-dibuja') : type === 'error' ? svg('alerta') : '<div class="mjas-nav-spinner"></div>';
    body().innerHTML = '<div class="mjas-status mj-estado ' + type + '">' + ico + '<span>' + msg + '</span></div>';
  }

  // --- Configuración ---------------------------------------------------------------
  function showConfig() {
    updateContextBar();
    body().innerHTML =
      '<p class="mjas-step-label">Configuración</p>' +
      '<div class="mjas-config-item"><span class="mjas-config-label">Bloquear posición</span>' +
        '<button class="mjas-toggle ' + (config.locked ? 'active' : '') + '" id="mjas-toggle-lock">' + (config.locked ? svg('candado') + ' Bloqueado' : svg('abierto') + ' Libre') + '</button></div>' +
      '<div class="mjas-config-item"><span class="mjas-config-label">Tamaño</span><div class="mjas-size-btns">' +
        '<button class="mjas-size-btn ' + (config.size === 'small' ? 'active' : '') + '" data-size="small">S</button>' +
        '<button class="mjas-size-btn ' + (config.size === 'medium' ? 'active' : '') + '" data-size="medium">M</button>' +
        '<button class="mjas-size-btn ' + (config.size === 'large' ? 'active' : '') + '" data-size="large">L</button>' +
      '</div></div>' +
      '<div class="mjas-config-item"><span class="mjas-config-label">Posición</span><button class="mjas-reset-btn" id="mjas-reset-pos">' + svg('reiniciar') + ' Abajo a la izquierda</button></div>' +
      '<button class="mjas-back-btn" id="mjas-back">' + svg('volver') + ' Volver</button>';

    document.getElementById('mjas-toggle-lock').addEventListener('click', function (e) {
      e.stopPropagation(); config.locked = !config.locked; saveConfig(); showConfig();
    });
    document.querySelectorAll('.mjas-size-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); config.size = btn.dataset.size; saveConfig(); showConfig(); positionWidget(); });
    });
    document.getElementById('mjas-reset-pos').addEventListener('click', function (e) {
      e.stopPropagation(); localStorage.removeItem('mjas_position'); syncPosition(); positionWidget();
    });
    document.getElementById('mjas-back').addEventListener('click', function (e) { e.stopPropagation(); showMenu(); });
  }

  // --- Armado ----------------------------------------------------------------------
  function buildWidget() {
    var w = document.createElement('div');
    w.id = 'mjas-widget';
    w.innerHTML =
      '<div class="mjas-header">' +
        '<div class="mjas-header-left">' +
          '<img class="mj-header-logo" src="' + LOGO + '" alt="">' +
          '<span class="mj-header-titulos"><span class="mjas-header-title">Asistente MJ</span><small>Navegación en Marangatu</small></span>' +
        '</div>' +
        '<div class="mjas-header-right">' +
          '<button class="mjas-config-btn" id="mjas-config-btn" title="Configuración">' + svg('ajustes', 'mj-gira') + '</button>' +
          '<button class="mjas-close-btn" id="mjas-close" title="Cerrar">' + svg('cerrar') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="mjas-context-bar" id="mjas-context-bar"></div>' +
      '<div class="mjas-body" id="mjas-body"></div>';
    return w;
  }

  function buildToggle() {
    var btn = document.createElement('button');
    btn.id = 'mjas-widget-toggle';
    btn.type = 'button';
    btn.title = config.locked ? 'Asistente MJ' : 'Asistente MJ (arrastrá para mover)';
    btn.setAttribute('aria-label', 'Asistente MJ');
    btn.innerHTML = '<img src="' + LOGO + '" alt="" draggable="false">';
    var pos = loadPosition();
    btn.style.left = pos.x + 'px'; btn.style.top = pos.y + 'px';
    var dragging = false, wasDragged = false, ox = 0, oy = 0, sx = 0, sy = 0;
    btn.addEventListener('mousedown', function (e) {
      if (config.locked || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); dragging = true; wasDragged = false;
      sx = e.clientX; sy = e.clientY;
      ox = e.clientX - btn.getBoundingClientRect().left;
      oy = e.clientY - btn.getBoundingClientRect().top;
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      if (!wasDragged && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 4) return; // un clic no es arrastre
      wasDragged = true;
      btn.style.cursor = 'grabbing';
      var size = btn.offsetWidth;
      btn.style.left = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - size)) + 'px';
      btn.style.top = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - size)) + 'px';
      if (state.open) positionWidget();
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return; dragging = false;
      btn.style.cursor = '';
      if (wasDragged) savePosition(parseInt(btn.style.left, 10), parseInt(btn.style.top, 10));
      else toggleWidget();
    });
    btn.addEventListener('click', function (e) { if (config.locked) { e.stopPropagation(); toggleWidget(); } });
    return btn;
  }

  function toggleWidget() {
    if (state.open) { closeWidget(); return; }
    PAGE = detectPage();
    openWidget();
    if (PAGE.id === 'comprobantes') showMonths(); else showMenu();
  }

  // El panel se abre del lado del botón que tenga más lugar.
  function positionWidget() {
    var w = document.getElementById('mjas-widget'), t = document.getElementById('mjas-widget-toggle');
    if (!w || !t) return;
    var r = t.getBoundingClientRect(), s = SIZES[config.size] || SIZES.medium;
    var alto = Math.min(w.offsetHeight || 440, window.innerHeight - 16);
    var left = r.left + r.width / 2 < window.innerWidth / 2 ? r.left : r.right - s.width;
    left = Math.max(8, Math.min(left, window.innerWidth - s.width - 8));
    var top = r.top > window.innerHeight / 2 ? r.top - alto - 10 : r.bottom + 10;
    top = Math.max(8, Math.min(top, window.innerHeight - alto - 8));
    w.style.top = top + 'px'; w.style.left = left + 'px';
  }

  function syncPosition() {
    var btn = document.getElementById('mjas-widget-toggle'); if (!btn) return;
    var pos = loadPosition(); btn.style.left = pos.x + 'px'; btn.style.top = pos.y + 'px';
  }

  function init() {
    if (!document.body || document.getElementById('mjas-widget')) return;
    document.body.appendChild(buildWidget());
    document.body.appendChild(buildToggle());
    applySize();

    // El contenido cambia de alto (menú, meses, estados): se reubica solo.
    if (window.ResizeObserver) {
      new ResizeObserver(function () { if (state.open) positionWidget(); }).observe(document.getElementById('mjas-widget'));
    }

    document.getElementById('mjas-close').addEventListener('click', function (e) { e.stopPropagation(); closeWidget(); });
    document.getElementById('mjas-config-btn').addEventListener('click', function (e) { e.stopPropagation(); showConfig(); });

    document.addEventListener('mousedown', function (e) {
      if (!state.open) return;
      var w = document.getElementById('mjas-widget'), t = document.getElementById('mjas-widget-toggle');
      if (w && t && !w.contains(e.target) && !t.contains(e.target)) closeWidget();
    });
    window.addEventListener('resize', function () {
      var t = document.getElementById('mjas-widget-toggle');
      if (!t) return;
      var size = t.offsetWidth;
      t.style.left = Math.min(parseInt(t.style.left, 10) || 0, window.innerWidth - size) + 'px';
      t.style.top = Math.min(parseInt(t.style.top, 10) || 0, window.innerHeight - size) + 'px';
      if (state.open) positionWidget();
    });

    window.addEventListener('storage', function (e) {
      if (e.key === 'mjas_position') syncPosition();
      if (e.key === 'mjas_config') { config = loadConfig(); applySize(); }
      if (e.key === 'mjas_state') { var p = loadState(); state.lastMonth = p.lastMonth; state.lastYear = p.lastYear; }
    });

    var lastUrl = window.location.href;
    new MutationObserver(function () {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        PAGE = detectPage();
        updateContextBar();
      }
    }).observe(document.body, { childList: true, subtree: true });

    retomar();
  }

  // Retoma un destino pedido en esta pestaña (o en la que abrió esta ventana:
  // Marangatu copia el sessionStorage, así que comparte TAB_ID).
  function retomar() {
    var nav = loadNav();
    if (!nav.active) return;
    var vigente = Date.now() - (nav.ts || 0) < 60000 && nav.tabId === TAB_ID && nav.url !== window.location.href;
    if (!vigente) { clearNav(); return; }
    var seguir = function (fn) { setTimeout(function () { PAGE = detectPage(); openWidget(); fn(); }, 800); };

    if (nav.step === 'ir-inicio') {
      if (PAGE.id === 'main') seguir(function () { desdeInicio(nav.dest); });
      else clearNav();
      return;
    }
    if (nav.dest === 'comprobantes') {
      if (PAGE.id === 'comprobantes') { clearNav(); seguir(showMonths); }
      else if (PAGE.id === 'gestion') seguir(irAComprobantes);
      else if (PAGE.id !== 'main') {
        setTimeout(function () {
          PAGE = detectPage();
          if (PAGE.id === 'gestion') { openWidget(); irAComprobantes(); } else clearNav();
        }, 1500);
      }
      return;
    }
    clearNav();
  }

  // Al imprimir, el asistente no sale en el papel.
  var st = document.createElement('style');
  st.textContent = '@media print { #mjas-widget, #mjas-widget-toggle { display: none !important; } }';
  (document.head || document.documentElement).appendChild(st);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
