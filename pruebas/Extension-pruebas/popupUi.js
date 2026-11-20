// Ventana del ícono: pestañas, indicador «En Marangatu» y versión.
// No toca la lógica de los demás scripts (popup.js, popupDescarga.js, …).
(() => {
  const CLAVE_PESTANA = 'ekuPopupPestana';
  const botones = [...document.querySelectorAll('.tabs [data-tab]')];
  const paneles = [...document.querySelectorAll('[data-panel]')];

  function mostrar(id) {
    if (!paneles.some((p) => p.dataset.panel === id)) id = 'inicio';
    botones.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    paneles.forEach((p) => { p.hidden = p.dataset.panel !== id; });
    try { localStorage.setItem(CLAVE_PESTANA, id); } catch { /* sin almacenamiento */ }
  }
  botones.forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.tab)));

  // Teclado: flechas entre pestañas.
  document.querySelector('.tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = botones.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    const n = botones[(i + (e.key === 'ArrowRight' ? 1 : botones.length - 1)) % botones.length];
    n.focus();
    mostrar(n.dataset.tab);
  });

  let inicial = 'inicio';
  try { inicial = localStorage.getItem(CLAVE_PESTANA) || 'inicio'; } catch { /* sin almacenamiento */ }
  // Con datos del Formulario 120 pendientes o una descarga en curso, se abre
  // donde hace falta.
  chrome.storage.session.get(['ivaPendiente', 'ivaDescarga'], (d) => {
    const p = d && d.ivaPendiente;
    if (p && p.expiresAt > Date.now()) mostrar('inicio');
    else if (d && d.ivaDescarga) mostrar('descargas');
    else mostrar(inicial);
  });
  mostrar(inicial);

  // ¿La pestaña activa es Marangatu?
  const chip = document.getElementById('chipMarangatu');
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    let en = false;
    try { en = !!tab && new URL(tab.url).hostname === 'marangatu.set.gov.py'; } catch { en = false; }
    chip.textContent = en ? 'En Marangatu' : 'Fuera de Marangatu';
    chip.classList.toggle('on', en);
  });

  const v = document.getElementById('version');
  if (v) v.textContent = 'v' + chrome.runtime.getManifest().version;
})();
