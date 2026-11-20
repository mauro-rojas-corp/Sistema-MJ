// Buscador de clientes del popup (v2.16). Pregunta a Control Clientes (abierta
// en una pestaña) por buscadorBg.js. Sólo recibe nombre y RUC; al elegir un
// cliente, la app inicia el login con su clave, como el botón Marangatu de la
// fila. Nada se guarda en la extensión.
(() => {
  'use strict';
  const q = document.getElementById('busQ');
  const lista = document.getElementById('busResultados');
  const estado = document.getElementById('busEstado');
  if (!q || !lista || !estado) return;

  const NOTA = estado.textContent;
  const ERRORES = {
    SIN_APP: 'No encuentro Control Clientes. Abrila (con tu sesión y un mes elegido); si ya está abierta, recargá su pestaña una vez y probá de nuevo.',
    SIN_RESPUESTA: 'Control Clientes no respondió. Recargá su pestaña y probá de nuevo.',
    SIN_CLIENTE: 'El cliente ya no está en la lista. Buscalo de nuevo.',
    SIN_CLAVE: 'Ese cliente no tiene Clave MH cargada en la planilla.',
    TAREA_EN_CURSO: 'Hay una tarea en curso en Marangatu. Esperá a que termine.',
  };
  let items = [];
  let sel = -1;
  let temporizador = null;
  let consulta = 0;

  const ponerEstado = (texto, clase) => {
    estado.textContent = texto || NOTA;
    estado.className = 'nota' + (clase ? ' ' + clase : '');
  };

  function dibujar() {
    lista.textContent = '';
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.className = i === sel ? 'sel' : '';
      const nombre = document.createElement('span');
      nombre.textContent = it.nombre;
      const det = document.createElement('small');
      det.textContent = 'RUC ' + (it.ruc || '—') + (it.conClave ? '' : ' · sin Clave MH');
      b.append(nombre, det);
      b.disabled = !it.conClave;
      b.addEventListener('click', () => entrar(it));
      lista.appendChild(b);
    });
  }

  function buscar() {
    const texto = q.value.trim();
    const n = ++consulta;
    if (!texto) { items = []; sel = -1; dibujar(); ponerEstado(); return; }
    ponerEstado('Buscando en Control Clientes…');
    chrome.runtime.sendMessage({ action: 'BUSCADOR_BUSCAR', q: texto }, (r) => {
      void chrome.runtime.lastError;
      if (n !== consulta) return; // llegó una búsqueda más nueva
      if (!r || !r.ok) { items = []; sel = -1; dibujar(); ponerEstado(ERRORES[r && r.error] || 'No se pudo buscar.', 'bad'); return; }
      items = r.items || [];
      sel = items.findIndex((it) => it.conClave);
      dibujar();
      ponerEstado(items.length ? 'Elegí el cliente (Enter entra con el marcado).' : 'Sin resultados.', items.length ? '' : 'warn');
    });
  }

  function entrar(it) {
    if (!it || !it.conClave) return;
    ponerEstado('Abriendo Marangatu con ' + it.nombre + '…');
    lista.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    chrome.runtime.sendMessage({ action: 'BUSCADOR_ENTRAR', ref: it.ref, ruc: it.ruc }, (r) => {
      void chrome.runtime.lastError;
      if (r && r.ok) { ponerEstado('Listo: entrando como ' + it.nombre + '.', 'ok'); setTimeout(() => window.close(), 900); return; }
      ponerEstado(ERRORES[r && r.error] || 'No se pudo abrir Marangatu.', 'bad');
      dibujar();
    });
  }

  q.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(buscar, 250);
  });
  q.addEventListener('keydown', (e) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % items.length; dibujar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; dibujar(); }
    else if (e.key === 'Enter') { e.preventDefault(); entrar(items[sel]); }
    else if (e.key === 'Escape') { items = []; sel = -1; dibujar(); ponerEstado(); }
  });
  q.focus();
})();
