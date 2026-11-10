import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Bug, CircleCheck, Ellipsis, Lightbulb, MessageCircle, RotateCcw, Send, X } from 'lucide-react';

// Ventana de Sugerencias: se despliega debajo del ícono de la barra.
// - Cualquier usuario escribe una sugerencia y ve en qué estado están las
//   suyas.
// - ADMINISTRADOR y SUPERUSUARIO ven todas, con el nombre de quien la
//   escribió, y las marcan como resueltas.

const TIPOS_SUGERENCIA = [
  { id: 'recomendacion', label: 'Recomendación', Icon: Lightbulb },
  { id: 'fallo', label: 'Fallo', Icon: Bug },
  { id: 'consejo', label: 'Consejo', Icon: MessageCircle },
  { id: 'otro', label: 'Otro', Icon: Ellipsis },
];
const TIPO = Object.fromEntries(TIPOS_SUGERENCIA.map((t) => [t.id, t]));
const MAX_TEXTO = 1500;

const ESTADO_USUARIO = {
  nueva: 'Enviada',
  vista: 'Vista por el administrador',
  resuelta: 'Resuelta',
};

function fechaHora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Etiqueta({ tipo }) {
  const t = TIPO[tipo] || TIPO.otro;
  return (
    <span className={`rx-sug-tipo is-${t.id}`}>
      <t.Icon size={12} aria-hidden="true" /> {t.label}
    </span>
  );
}

function Formulario({ seccion, onEnviar }) {
  const [tipo, setTipo] = useState('');
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState({ enviando: false, error: '', ok: false });
  const largo = texto.trim().length;
  const puede = Boolean(tipo) && largo >= 3 && largo <= MAX_TEXTO && !estado.enviando;

  async function enviar(e) {
    e.preventDefault();
    if (!puede) return;
    setEstado({ enviando: true, error: '', ok: false });
    try {
      await onEnviar({ tipo, texto: texto.trim(), seccion });
      setTexto('');
      setTipo('');
      setEstado({ enviando: false, error: '', ok: true });
    } catch (err) {
      setEstado({ enviando: false, error: err?.message || 'No se pudo enviar. Probá de nuevo.', ok: false });
    }
  }

  if (estado.ok) {
    return (
      <div className="rx-sug-gracias" role="status">
        <CircleCheck size={28} aria-hidden="true" />
        <strong>¡Gracias por tu sugerencia!</strong>
        <span>Ya le llegó al administrador.</span>
        <button type="button" className="rx-buzon-link" onClick={() => setEstado({ enviando: false, error: '', ok: false })}>
          Escribir otra
        </button>
      </div>
    );
  }

  return (
    <form className="rx-sug-form" onSubmit={enviar}>
      <div className="rx-sug-label" id="rx-sug-tipo-label">¿Qué querés contarnos?</div>
      <div className="rx-sug-tipos" role="radiogroup" aria-labelledby="rx-sug-tipo-label">
        {TIPOS_SUGERENCIA.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tipo === t.id}
            className={`rx-sug-tipo-btn ${tipo === t.id ? 'is-active' : ''}`}
            onClick={() => setTipo(t.id)}
          >
            <t.Icon size={16} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>
      <label className="rx-sug-label" htmlFor="rx-sug-texto">
        Tu sugerencia
      </label>
      <textarea
        id="rx-sug-texto"
        className="rx-sug-textarea"
        value={texto}
        maxLength={MAX_TEXTO}
        rows={4}
        placeholder={
          tipo === 'fallo'
            ? 'Contá qué pasó, en qué pantalla y qué esperabas que pasara.'
            : 'Contanos qué se puede mejorar, qué te gustaría que tenga el sistema…'
        }
        onChange={(e) => setTexto(e.target.value)}
      />
      <div className="rx-sug-meta">
        <span>La verá el administrador con tu nombre.</span>
        <span>
          {texto.length}/{MAX_TEXTO}
        </span>
      </div>
      {estado.error && (
        <div className="rx-sug-error" role="alert">
          {estado.error}
        </div>
      )}
      <button type="submit" className="rx-btn rx-btn-primary rx-sug-enviar" disabled={!puede}>
        <Send size={16} aria-hidden="true" />
        {estado.enviando ? 'Enviando…' : 'Enviar sugerencia'}
      </button>
    </form>
  );
}

function Recibidas({ sugerencias, loaded, error, onEstado }) {
  const [filtro, setFiltro] = useState('pendientes');
  const [tipo, setTipo] = useState('');
  const [fallo, setFallo] = useState('');
  const lista = sugerencias.filter(
    (s) =>
      (filtro === 'todas' || (filtro === 'resueltas' ? s.estado === 'resuelta' : s.estado !== 'resuelta')) &&
      (!tipo || s.tipo === tipo)
  );
  const cambiar = (id, estado) => {
    setFallo('');
    onEstado([id], estado).catch((err) => setFallo(err?.message || 'No se pudo guardar el cambio'));
  };

  return (
    <>
      <div className="rx-sug-filtros">
        {[
          ['pendientes', 'Pendientes'],
          ['resueltas', 'Resueltas'],
          ['todas', 'Todas'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rx-buzon-chip ${filtro === id ? 'is-active' : ''}`}
            aria-pressed={filtro === id}
            onClick={() => setFiltro(id)}
          >
            {label}
          </button>
        ))}
        <select className="rx-sug-select" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Todos los tipos</option>
          {TIPOS_SUGERENCIA.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {fallo && (
        <div className="rx-sug-error" role="alert">
          {fallo}
        </div>
      )}
      <ul className="rx-sug-lista">
        {!loaded && <li className="rx-sug-vacio">Cargando…</li>}
        {loaded && error && !sugerencias.length && <li className="rx-sug-vacio">{error}</li>}
        {loaded && !error && !lista.length && (
          <li className="rx-sug-vacio">
            {sugerencias.length ? 'No hay sugerencias con este filtro.' : 'Todavía nadie dejó sugerencias.'}
          </li>
        )}
        {lista.map((s) => (
          <li key={s.id} className={`rx-sug-item ${s.estado === 'nueva' ? 'is-nueva' : ''}`}>
            <div className="rx-sug-item-top">
              <strong className="rx-sug-autor">{s.usuario}</strong>
              <Etiqueta tipo={s.tipo} />
              {s.estado === 'nueva' && <span className="rx-sug-nueva">Nueva</span>}
            </div>
            <div className="rx-sug-fecha">
              {fechaHora(s.creada)}
              {s.seccion ? ` · ${s.seccion}` : ''}
            </div>
            <p className="rx-sug-texto">{s.texto}</p>
            <div className="rx-sug-item-actions">
              {s.estado === 'resuelta' ? (
                <>
                  <span className="rx-sug-resuelta">
                    <CircleCheck size={14} aria-hidden="true" /> Resuelta{s.revisadaPor ? ` por ${s.revisadaPor}` : ''}
                  </span>
                  <button type="button" className="rx-buzon-link" onClick={() => cambiar(s.id, 'vista')}>
                    <RotateCcw size={14} aria-hidden="true" /> Reabrir
                  </button>
                </>
              ) : (
                <button type="button" className="rx-btn rx-sug-resolver" onClick={() => cambiar(s.id, 'resuelta')}>
                  <CircleCheck size={15} aria-hidden="true" /> Marcar resuelta
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function MisSugerencias({ sugerencias, loaded, error }) {
  return (
    <ul className="rx-sug-lista">
      {!loaded && <li className="rx-sug-vacio">Cargando…</li>}
      {loaded && error && !sugerencias.length && <li className="rx-sug-vacio">{error}</li>}
      {loaded && !error && !sugerencias.length && <li className="rx-sug-vacio">Todavía no enviaste sugerencias.</li>}
      {sugerencias.map((s) => (
        <li key={s.id} className="rx-sug-item">
          <div className="rx-sug-item-top">
            <Etiqueta tipo={s.tipo} />
            <span className={`rx-sug-estado is-${s.estado}`}>{ESTADO_USUARIO[s.estado] || 'Enviada'}</span>
          </div>
          <div className="rx-sug-fecha">{fechaHora(s.creada)}</div>
          <p className="rx-sug-texto">{s.texto}</p>
        </li>
      ))}
    </ul>
  );
}

export default function SugerenciasPanel({ anchorRef, admin, data, seccion, onClose }) {
  const [tab, setTab] = useState(admin ? 'recibidas' : 'escribir');
  const [pos, setPos] = useState({});
  const panelRef = useRef(null);
  const { sugerencias, loaded, error, nuevas, crear, cambiarEstado, refresh } = data;

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Debajo del ícono; en pantallas angostas, a lo ancho.
  useLayoutEffect(() => {
    const ubicar = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      const vw = window.innerWidth;
      const top = (r ? r.bottom : 56) + 8;
      if (vw < 560 || !r) setPos({ top, left: 8, right: 8 });
      else setPos({ top, right: Math.max(8, vw - r.right - 8), width: 400 });
    };
    ubicar();
    window.addEventListener('resize', ubicar);
    return () => window.removeEventListener('resize', ubicar);
  }, [anchorRef]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Al ver las recibidas, las nuevas quedan como vistas (como leer el correo).
  const idsNuevas = admin && tab === 'recibidas' ? sugerencias.filter((s) => s.estado === 'nueva').map((s) => s.id).join(',') : '';
  useEffect(() => {
    if (!idsNuevas) return undefined;
    const t = setTimeout(() => cambiarEstado(idsNuevas.split(','), 'vista').catch(() => {}), 2500);
    return () => clearTimeout(t);
  }, [idsNuevas, cambiarEstado]);

  const tabs = admin
    ? [
        ['recibidas', `Recibidas${nuevas ? ` (${nuevas})` : ''}`],
        ['escribir', 'Escribir'],
      ]
    : [
        ['escribir', 'Escribir'],
        ['mias', 'Mis sugerencias'],
      ];

  return (
    <>
      <div className="rx-sug-backdrop" onClick={onClose} aria-hidden="true" />
      <motion.div
        ref={panelRef}
        className="rx-sug-panel"
        style={pos}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rx-sug-title"
        tabIndex={-1}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.16 }}
      >
        <div className="rx-sug-head">
          <h2 id="rx-sug-title">
            <Lightbulb size={18} aria-hidden="true" /> Sugerencias
          </h2>
          <button type="button" className="rx-buzon-close" onClick={onClose} aria-label="Cerrar sugerencias">
            <X size={18} />
          </button>
        </div>
        <div className="rx-sug-tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`rx-sug-tab ${tab === id ? 'is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="rx-sug-body">
          {tab === 'escribir' && <Formulario seccion={seccion} onEnviar={crear} />}
          {tab === 'recibidas' && (
            <Recibidas sugerencias={sugerencias} loaded={loaded} error={error} onEstado={cambiarEstado} />
          )}
          {tab === 'mias' && <MisSugerencias sugerencias={sugerencias} loaded={loaded} error={error} />}
        </div>
      </motion.div>
    </>
  );
}
