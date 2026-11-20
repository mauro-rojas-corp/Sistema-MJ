// ============================================================================
// RECOLECTOR CDC — ADAPTADOR DE PÁGINA (MARANGATU)
// ----------------------------------------------------------------------------
// Acá vive SOLO el conocimiento de cómo es la página de Marangatu:
//   - qué tablas son "la de resultados" y cómo leer sus filas;
//   - cómo se ve y se opera la paginación.
//
// Este archivo NO crea elementos visuales, NO pone estilos y NO decide
// reglas (eso es del núcleo). Si Marangatu cambia su HTML, se toca acá.
// La UI (recolectorCdcUi.js) le pide datos con estas funciones y dibuja.
// ============================================================================
(() => {
  'use strict';
  const Core = globalThis.EkuCdcCore;
  if (!Core || globalThis.EkuCdcPagina) return;

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  // Tablas candidatas: las que mencionan un CDC y tienen cuerpo con filas.
  // No se asume posición ni cantidad de columnas (la Fuente B tiene doble
  // encabezado y puede variar).
  function tablasResultados() {
    return [...document.querySelectorAll('table')].filter((tabla) => {
      if (!tabla.querySelector('tbody tr')) return false;
      return /\bCDC\b/.test(String(tabla.innerText || ''));
    });
  }

  // CDC de una fila HTML. Se saltean las celdas que agrega la propia UI
  // (marcadas con data-cdc-ui="celda") para no leerse a sí misma.
  function cdcDeFila(tr) {
    const textos = [...tr.cells]
      .filter((td) => !td.hasAttribute('data-cdc-ui'))
      .map((td) => td.innerText || '');
    return Core.extraerCdcDeTextos(textos);
  }

  // Todas las filas con CDC válido de una tabla: [{ tr, cdc }].
  function filasConCdc(tabla) {
    const filas = [];
    tabla.querySelectorAll('tbody tr').forEach((tr) => {
      const cdc = cdcDeFila(tr);
      if (cdc) filas.push({ tr, cdc });
    });
    return filas;
  }

  // CDCs válidos visibles ahora mismo en la página (todas las tablas).
  function cdcsPaginaActual() {
    const lista = [];
    tablasResultados().forEach((t) => filasConCdc(t).forEach((f) => lista.push(f.cdc)));
    return lista;
  }

  // Huella de la página visible, para detectar que la paginación cargó.
  function firmaPagina() {
    const cdcs = cdcsPaginaActual();
    if (cdcs.length) return cdcs.join('|');
    const tabla = tablasResultados()[0];
    return tabla ? String(tabla.innerText || '').slice(0, 300) : '';
  }

  function totalPaginas() {
    return Core.totalPaginasDesdeTexto(document.body ? document.body.innerText : '');
  }

  // Botones/enlaces numerados de paginación cercanos a la tabla, sin los de
  // la barra de la UI ni los del cuerpo de la tabla.
  function controlesNumerados() {
    const tabla = tablasResultados()[0];
    const candidatos = [...document.querySelectorAll('a, button, li, span, [role="button"]')]
      .filter((e) => /^\d+$/.test(String(e.textContent || '').trim()))
      .filter((e) => e.offsetParent !== null)
      .filter((e) => !e.closest('[data-cdc-ui="barra"]') && !e.closest('tbody'));
    if (tabla) {
      const r = tabla.getBoundingClientRect();
      candidatos.sort((a, b) => {
        const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
        return Math.abs(ra.top - r.top) - Math.abs(rb.top - r.top);
      });
    }
    const vistos = new Map();
    candidatos.forEach((e) => {
      const n = Number(String(e.textContent || '').trim());
      if (!vistos.has(n)) vistos.set(n, e);
    });
    return vistos;
  }

  function paginaActual() {
    for (const [n, e] of controlesNumerados()) {
      if (e.getAttribute('aria-current')) return n;
      let nodo = e;
      for (let i = 0; i < 4 && nodo; i += 1) {
        if (/\b(active|current|selected|seleccionad|pagina-actual)\b/i.test(String(nodo.className || ''))) return n;
        nodo = nodo.parentElement;
      }
    }
    return 0;
  }

  function clickEnControl(e) {
    const clickeable = e.matches('a, button, [role="button"]')
      ? e
      : e.querySelector('a, button, [role="button"]') || e;
    clickeable.click();
  }

  // Navega a la página n y espera a que el contenido cambie.
  // alNavegar: callback de la UI para re-dibujar mientras se espera.
  // estaCancelado: función que indica si hay que abortar.
  async function irAPagina(n, { alNavegar, estaCancelado } = {}) {
    const control = controlesNumerados().get(n);
    if (!control) throw new Error(`No encontré el botón de la página ${n}.`);
    const firmaAntes = firmaPagina();
    clickEnControl(control);
    const limite = Date.now() + 9000;
    while (Date.now() < limite) {
      if (estaCancelado && estaCancelado()) return false;
      await dormir(300);
      if (alNavegar) alNavegar();
      if (firmaPagina() !== firmaAntes || paginaActual() === n) return true;
    }
    if (paginaActual() === n) return true;
    throw new Error(`La página ${n} tardó demasiado en cargar.`);
  }

  globalThis.EkuCdcPagina = {
    tablasResultados,
    cdcDeFila,
    filasConCdc,
    cdcsPaginaActual,
    firmaPagina,
    totalPaginas,
    controlesNumerados,
    paginaActual,
    irAPagina,
    dormir,
  };
})();
