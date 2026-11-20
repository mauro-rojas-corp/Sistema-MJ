// ============================================================================
// RECOLECTOR CDC — NÚCLEO (LÓGICA PURA)
// ----------------------------------------------------------------------------
// Acá viven SOLO las reglas y el estado. Este archivo:
//   - NO conoce el DOM de Marangatu (no busca tablas ni celdas HTML).
//   - NO crea elementos visuales ni estilos.
//   - NO sabe nada de botones, colores ni textos de pantalla.
//
// Si cambia una regla de negocio (qué es un CDC válido, cómo se deduplica,
// cómo se persiste la selección), se toca acá.
// La interfaz de página está en recolectorCdcPagina.js y la presentación en
// recolectorCdcUi.js. No modificar esta separación sin actualizar ambos.
// ============================================================================
(() => {
  'use strict';
  if (globalThis.EkuCdcCore) return;

  const CDC_EXACTO = /^\d{44}$/;

  // Quita todo lo que no sea dígito. El CDC siempre es texto: se preservan
  // los ceros a la izquierda y nunca se convierte a número.
  function soloDigitos(texto) {
    return String(texto || '').replace(/\D/g, '');
  }

  function esCdcValido(cdc) {
    return CDC_EXACTO.test(String(cdc || ''));
  }

  // Recibe los textos ya leídos de las celdas de una fila (sin HTML) y
  // devuelve el CDC si alguna celda contiene exactamente 44 dígitos.
  // Así, una fila MANUAL sin CDC simplemente devuelve null.
  function extraerCdcDeTextos(textosDeCeldas) {
    for (const texto of textosDeCeldas || []) {
      const digitos = soloDigitos(texto);
      if (esCdcValido(digitos)) return digitos;
    }
    return null;
  }

  // Identifica la fuente por la ruta, ignorando query y token _cyp.
  function detectarFuente(pathname) {
    const ruta = String(pathname || '').toLowerCase();
    if (ruta.includes('registrocomprobantesvirtuales.do')) return 'FUENTE_REGISTRO_VIRTUAL';
    if (ruta.includes('consultarcomprobantesregistrados.do')) return 'FUENTE_CONSULTA_REGISTRADOS';
    return null;
  }

  // Lee "… 25 registros en página, 2 páginas" (y variantes) del texto visible.
  function totalPaginasDesdeTexto(texto) {
    const t = String(texto || '');
    const m = t.match(/(\d+)\s+registros en p[aá]gina,\s*(\d+)\s+p[aá]ginas/i)
      || t.match(/,\s*(\d+)\s+p[aá]ginas/i);
    return m ? Number(m[m.length - 1]) : 0;
  }

  // Selección = conjunto de CDCs únicos, con persistencia inyectada.
  // almacenamiento: { leer(): Promise<string[]>, escribir(lista): Promise<void> }
  // La UI se entera de cada cambio con alCambiar(fn) y vuelve a dibujar.
  function crearSeleccion(almacenamiento) {
    const valores = new Set();
    const oyentes = new Set();

    const emitir = () => oyentes.forEach((fn) => { try { fn(); } catch { /* un oyente roto no frena al resto */ } });
    const persistir = async () => {
      try { await almacenamiento.escribir([...valores]); } catch { /* la memoria sigue siendo válida */ }
    };
    const guardarYCambios = async () => { await persistir(); emitir(); };

    return {
      tiene: (cdc) => valores.has(cdc),
      cantidad: () => valores.size,
      lista: () => [...valores],

      async cargar() {
        try {
          const guardados = await almacenamiento.leer();
          (guardados || []).forEach((c) => { if (esCdcValido(c)) valores.add(c); });
        } catch { /* arranca vacío */ }
        emitir();
      },

      async agregar(cdcs) {
        let cambio = false;
        (Array.isArray(cdcs) ? cdcs : [cdcs]).forEach((c) => {
          if (esCdcValido(c) && !valores.has(c)) { valores.add(c); cambio = true; }
        });
        if (cambio) await guardarYCambios();
      },

      async quitar(cdcs) {
        let cambio = false;
        (Array.isArray(cdcs) ? cdcs : [cdcs]).forEach((c) => { if (valores.delete(c)) cambio = true; });
        if (cambio) await guardarYCambios();
      },

      async alternar(cdc, marcado) {
        if (marcado) await this.agregar(cdc); else await this.quitar(cdc);
      },

      async limpiar() {
        if (!valores.size) return;
        valores.clear();
        await guardarYCambios();
      },

      alCambiar(fn) { oyentes.add(fn); },
    };
  }

  globalThis.EkuCdcCore = {
    soloDigitos,
    esCdcValido,
    extraerCdcDeTextos,
    detectarFuente,
    totalPaginasDesdeTexto,
    crearSeleccion,
  };
})();
