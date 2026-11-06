import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function inicioDelDia(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function etiquetaDia(date, ahora) {
  const dias = Math.round((inicioDelDia(ahora) - inicioDelDia(date)) / 86_400_000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  return `${DIAS[date.getDay()]} ${date.getDate()} de ${MESES[date.getMonth()]}`;
}

function haceCuanto(date, ahora) {
  const min = Math.floor((ahora - date) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24 && inicioDelDia(date) === inicioDelDia(ahora)) return `hace ${horas} h`;
  const dias = Math.round((inicioDelDia(ahora) - inicioDelDia(date)) / 86_400_000);
  if (dias <= 1) return 'ayer';
  return `hace ${dias} días`;
}

function textoVencimiento(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /^d[ií]a\s/i.test(text) ? `vence el ${text.charAt(0).toLowerCase()}${text.slice(1)}` : `vence el ${text}`;
}

// Panel lateral del Buzón: avisos agrupados por día, filtro "Sin leer /
// Todos" y "Marcar todo como leído". Tocar un aviso lo marca leído y abre
// la ficha del cliente (no hay confirmación de recepción).
export default function BuzonPanel({ avisos, noLeidos, loaded, error, onClose, onOpenAviso, onMarkAllRead }) {
  const [filtro, setFiltro] = useState(() => (noLeidos > 0 ? 'sin-leer' : 'todos'));
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Se recalcula en cada render (la lista es corta): así "hace X min" y los
  // grupos Hoy/Ayer se mantienen al día mientras el panel está abierto.
  const ahora = new Date();
  const grupos = (() => {
    // Más recientes primero, por fecha de creación.
    const lista = (filtro === 'sin-leer' ? avisos.filter((a) => !a.leido) : avisos)
      .slice()
      .sort((a, b) => (Date.parse(b.creado) || 0) - (Date.parse(a.creado) || 0));
    const out = [];
    lista.forEach((aviso) => {
      const fecha = new Date(aviso.creado);
      const valida = !Number.isNaN(fecha.getTime());
      const etiqueta = valida ? etiquetaDia(fecha, ahora) : 'Sin fecha';
      let grupo = out[out.length - 1];
      if (!grupo || grupo.etiqueta !== etiqueta) {
        grupo = { etiqueta, items: [] };
        out.push(grupo);
      }
      grupo.items.push({ aviso, fecha: valida ? fecha : null });
    });
    return out;
  })();

  return (
    <>
      <motion.div
        className="rx-buzon-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.aside
        ref={panelRef}
        className="rx-buzon-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Buzón"
        tabIndex={-1}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      >
        <div className="rx-buzon-head">
          <h2>Buzón</h2>
          <div className="rx-buzon-head-actions">
            <button type="button" className="rx-buzon-link" disabled={noLeidos === 0} onClick={onMarkAllRead}>
              Marcar todo como leído
            </button>
            <button type="button" className="rx-buzon-close" onClick={onClose} aria-label="Cerrar buzón">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="rx-buzon-filters" role="group" aria-label="Filtrar avisos">
          <button
            type="button"
            className={`rx-buzon-chip ${filtro === 'sin-leer' ? 'is-active' : ''}`}
            aria-pressed={filtro === 'sin-leer'}
            onClick={() => setFiltro('sin-leer')}
          >
            Sin leer ({noLeidos})
          </button>
          <button
            type="button"
            className={`rx-buzon-chip ${filtro === 'todos' ? 'is-active' : ''}`}
            aria-pressed={filtro === 'todos'}
            onClick={() => setFiltro('todos')}
          >
            Todos
          </button>
        </div>

        <div className="rx-buzon-list">
          {error && <p className="rx-buzon-error">{error}</p>}
          {!loaded && !error && <p className="rx-buzon-empty">Cargando avisos…</p>}
          {loaded && grupos.length === 0 && !error && (
            <p className="rx-buzon-empty">
              {filtro === 'sin-leer' ? 'No tenés avisos sin leer.' : 'Todavía no recibiste avisos.'}
            </p>
          )}
          {grupos.map((grupo) => (
            <section key={grupo.etiqueta} aria-label={grupo.etiqueta}>
              <div className="rx-buzon-day">{grupo.etiqueta}</div>
              {grupo.items.map(({ aviso, fecha }) => {
                const docs = (aviso.documentos || []).join(', ');
                const meta = [
                  aviso.de && `Registró ${aviso.de}`,
                  fecha && haceCuanto(fecha, ahora),
                  textoVencimiento(aviso.vencimiento),
                ].filter(Boolean);
                return (
                  <button
                    type="button"
                    key={aviso.id}
                    className={`rx-buzon-item ${aviso.leido ? '' : 'is-unread'}`}
                    onClick={() => onOpenAviso(aviso)}
                  >
                    <span className="rx-buzon-dot" aria-hidden="true" />
                    <span className="rx-buzon-body">
                      <span className="rx-buzon-title">
                        {aviso.cliente} · llegaron papeles
                        {!aviso.leido && <span className="sr-only"> (sin leer)</span>}
                      </span>
                      {(docs || aviso.nota) && (
                        <span className="rx-buzon-docs">
                          {docs && `${docs}.`}
                          {docs && aviso.nota && ' '}
                          {aviso.nota && `“${aviso.nota}”`}
                        </span>
                      )}
                      <span className="rx-buzon-meta">{meta.join(' · ')}</span>
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </motion.aside>
    </>
  );
}
