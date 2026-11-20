// Popup — sección «Descarga directa de XML (eKuatia)»
// Guarda la clave del servicio de captcha en chrome.storage.local de la
// extensión. La clave nunca sale de acá: el motor (descargaDirectaBg.js)
// la lee al momento de bajar y Control Clientes jamás la ve.
'use strict';

const DIR_KEY_STORAGE_POPUP = 'capSolverKeyV1';

async function dirPintarEstado() {
  const d = await chrome.storage.local.get(DIR_KEY_STORAGE_POPUP);
  const hay = !!String(d[DIR_KEY_STORAGE_POPUP] || '').trim();
  document.getElementById('dirEstado').textContent = hay
    ? 'Clave configurada. La descarga directa está lista.'
    : 'Sin clave configurada.';
}

async function dirGuardarClave() {
  const input = document.getElementById('dirClave');
  const valor = input.value.trim();
  if (!valor) {
    document.getElementById('dirEstado').textContent = 'Pegá la clave primero.';
    return;
  }
  await chrome.storage.local.set({ [DIR_KEY_STORAGE_POPUP]: valor });
  input.value = '';
  document.getElementById('dirEstado').textContent = 'Clave guardada.';
}

const DIR_PERFIL_STORAGE_POPUP = 'directaPerfilV1';
const DIR_TRABAJO_KEY_POPUP = 'directaTrabajoV1';
const DIR_PERFIL_ETIQUETAS = {
  actual: 'Actual (seguro)',
  prudente: 'Prudente rápido (3 tokens)',
  rapido: 'Rápido (6 tokens)',
  fondo: 'A fondo (medición)',
};

function dirPintarPerfilEstado(perfil) {
  const div = document.getElementById('dirPerfilEstado');
  if (!div) return;
  div.textContent = perfil === 'actual'
    ? 'Ritmo normal de todos los días.'
    : `Ritmo de medición activo: ${DIR_PERFIL_ETIQUETAS[perfil] || perfil}. Al terminar las pruebas, volvé a «Actual».`;
}

async function dirPintarPerfil() {
  const d = await chrome.storage.local.get(DIR_PERFIL_STORAGE_POPUP);
  const perfil = DIR_PERFIL_ETIQUETAS[d[DIR_PERFIL_STORAGE_POPUP]] ? d[DIR_PERFIL_STORAGE_POPUP] : 'actual';
  const select = document.getElementById('dirPerfil');
  if (select) select.value = perfil;
  dirPintarPerfilEstado(perfil);
}

async function dirPintarUltimaCorrida() {
  const div = document.getElementById('dirUltimaCorrida');
  if (!div) return;
  let t = null;
  try {
    const d = await chrome.storage.session.get(DIR_TRABAJO_KEY_POPUP);
    t = d[DIR_TRABAJO_KEY_POPUP] || null;
  } catch { /* sin storage de sesión */ }
  if (!t || !t.iniciadoEn) {
    div.textContent = 'Sin corridas registradas en esta sesión del navegador.';
    return;
  }
  const fin = t.terminadoEn || Date.now();
  const seg = Math.max(0, (fin - t.iniciadoEn) / 1000);
  const ok = (t.resultados || []).filter((r) => r.ok).length;
  const saldo = typeof t.saldoAntes === 'number' && typeof t.saldoDespues === 'number'
    ? ` · saldo ${t.saldoAntes.toFixed(4)} → ${t.saldoDespues.toFixed(4)}`
    : '';
  div.textContent = `${t.perfilEtiqueta || 'Actual'}: ${ok}/${t.total || 0} XML en ${seg.toFixed(0)} s`
    + ` · tokens pedidos ${t.tokensPedidos || 0} (listos ${t.tokensListos || 0}, fallidos ${t.tokensFallidos || 0}`
    + `${t.tokensDescartados ? `, descartados ${t.tokensDescartados}` : ''})${saldo}${t.corriendo ? ' · EN CURSO' : ''}`;
}

const DIR_HISTORIAL_KEY_POPUP = 'directaHistorialV1';

async function dirLeerHistorial() {
  try {
    const d = await chrome.storage.local.get(DIR_HISTORIAL_KEY_POPUP);
    return Array.isArray(d[DIR_HISTORIAL_KEY_POPUP]) ? d[DIR_HISTORIAL_KEY_POPUP] : [];
  } catch {
    return [];
  }
}

function dirFormatearCorrida(r) {
  const fecha = new Date(r.ts).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const tok = typeof r.tokenMedianaSeg === 'number'
    ? ` · token med ${r.tokenMedianaSeg} s (máx ${r.tokenMaxSeg} s)`
    : '';
  const costo = typeof r.costoPorXml === 'number' ? ` · ~US$ ${r.costoPorXml.toFixed(4)}/XML` : '';
  const fallos = r.fallos ? ` · fallos ${r.fallos}` : '';
  return `${fecha} · ${r.perfilEtiqueta || r.perfil} — ${r.ok}/${r.total} en ${r.duracionSeg} s${tok} · tokens pedidos ${r.tokensPedidos}${fallos}${costo}`;
}

async function dirPintarHistorial() {
  const div = document.getElementById('dirHistorial');
  if (!div) return;
  const lista = await dirLeerHistorial();
  div.textContent = lista.length
    ? lista.map(dirFormatearCorrida).join('\n')
    : 'Bitácora vacía: todavía no terminó ninguna corrida.';
}

async function dirCopiarHistorial() {
  const estado = document.getElementById('dirHistorialEstado');
  const lista = await dirLeerHistorial();
  if (!lista.length) {
    estado.textContent = 'No hay mediciones para copiar todavía.';
    return;
  }
  const errores = {};
  for (const r of lista) {
    for (const [tipo, n] of Object.entries(r.erroresPorTipo || {})) {
      errores[tipo] = (errores[tipo] || 0) + n;
    }
  }
  const detalleErrores = Object.entries(errores).map(([k, v]) => `${k}: ${v}`).join(' · ');
  const texto = 'MEDICIONES — DESCARGA DIRECTA DE XML (más nueva primero)\n'
    + lista.map(dirFormatearCorrida).join('\n')
    + (detalleErrores ? `\nErrores por tipo (todas las corridas): ${detalleErrores}` : '');
  try {
    await navigator.clipboard.writeText(texto);
    estado.textContent = 'Resumen copiado: pegalo donde quieras.';
  } catch {
    const ta = document.createElement('textarea');
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    estado.textContent = 'Resumen copiado: pegalo donde quieras.';
  }
}

async function dirBorrarHistorial() {
  await chrome.storage.local.set({ [DIR_HISTORIAL_KEY_POPUP]: [] });
  document.getElementById('dirHistorialEstado').textContent = 'Bitácora borrada.';
  dirPintarHistorial();
}

document.getElementById('dirCopiarHistorial').addEventListener('click', dirCopiarHistorial);
document.getElementById('dirBorrarHistorial').addEventListener('click', dirBorrarHistorial);

document.getElementById('dirGuardar').addEventListener('click', dirGuardarClave);
document.getElementById('dirPerfil').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ [DIR_PERFIL_STORAGE_POPUP]: e.target.value });
  dirPintarPerfilEstado(e.target.value);
});
dirPintarEstado();
dirPintarPerfil();
dirPintarUltimaCorrida();
dirPintarHistorial();
setInterval(() => { dirPintarUltimaCorrida(); dirPintarHistorial(); }, 2000);
