import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { ESTADOS, gs, perLabel } from './ivaCore.js';
import { compararIva } from './sincronizarIva';

// Después de subir documentos o libros: por cada cliente y mes afectado que
// ya tiene el IVA cargado, muestra cómo cambiaría y pide aceptar o rechazar.
// pendientes = [{ cliente: { ruc, dv, nombre }, periodo }]
const resultado = (k) => (k.pagar > 0 ? `A pagar Gs. ${gs(k.pagar)}` : k.favor > 0 ? `A favor Gs. ${gs(k.favor)}` : 'Sin saldo');

export default function AvisoCambioIva({ pendientes, onCerrar }) {
  const [items, setItems] = useState(() => pendientes.map((p) => ({ ...p, estado: 'cargando' })));

  useEffect(() => {
    let vigente = true;
    pendientes.forEach((p, i) => {
      compararIva(p.cliente, p.periodo)
        .then((r) => {
          if (!vigente) return;
          setItems((xs) => xs.map((x, j) => (j === i ? { ...x, estado: !r ? 'sin-iva' : r.cambia ? 'decidir' : 'igual', r } : x)));
        })
        .catch((e) => {
          if (vigente) setItems((xs) => xs.map((x, j) => (j === i ? { ...x, estado: 'error', error: e.message } : x)));
        });
    });
    return () => { vigente = false; };
  }, [pendientes]);

  // Si nada requiere decisión, el aviso se cierra solo.
  const cargando = items.some((x) => x.estado === 'cargando');
  const visibles = items.filter((x) => ['decidir', 'aplicando', 'aceptado', 'rechazado', 'error'].includes(x.estado));
  useEffect(() => {
    if (!cargando && visibles.length === 0) onCerrar();
  }, [cargando, visibles.length, onCerrar]);

  const decidir = async (i, aceptar) => {
    if (!aceptar) {
      setItems((xs) => xs.map((x, j) => (j === i ? { ...x, estado: 'rechazado' } : x)));
      return;
    }
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, estado: 'aplicando' } : x)));
    try {
      await items[i].r.aplicar();
      setItems((xs) => xs.map((x, j) => (j === i ? { ...x, estado: 'aceptado' } : x)));
    } catch (e) {
      setItems((xs) => xs.map((x, j) => (j === i ? { ...x, estado: 'error', error: e.message || 'No se pudo actualizar el IVA.' } : x)));
    }
  };

  if (!cargando && visibles.length === 0) return null;
  const quedan = items.some((x) => x.estado === 'decidir' || x.estado === 'aplicando');

  return (
    <div className="lb-modal-fondo" role="presentation">
      <div className="lb-modal cp-aviso-iva" role="alertdialog" aria-modal="true" aria-labelledby="cp-aviso-iva-t">
        <div className="lb-modal-head">
          <h2 id="cp-aviso-iva-t"><AlertTriangle size={18} aria-hidden="true" /> El IVA ya cargado cambiaría</h2>
          {!quedan && <button type="button" className="lb-icono" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>}
        </div>
        <div className="lb-modal-body">
          {cargando && <div className="lb-cargando"><RefreshCw size={16} className="animate-spin" aria-hidden="true" /> Comparando con el IVA guardado…</div>}
          {!cargando && <p className="lb-ayuda">Estos clientes ya tienen la liquidación del IVA y con los comprobantes del registro cambiaría. Si aceptás, las ventas y compras del formulario se reemplazan por las del registro (los saldos anteriores, retenciones y demás datos no se tocan). Si rechazás, el IVA queda como está.</p>}
          {visibles.map((x) => {
            const i = items.indexOf(x);
            const { r } = x;
            return (
              <div key={`${x.cliente.ruc}-${x.periodo}`} className={`cp-aviso-item is-${x.estado}`}>
                <div className="cp-aviso-tit">
                  <strong>{x.cliente.nombre}</strong>
                  <span>IVA de {perLabel(x.periodo)}{r ? ` · ${ESTADOS[r.estado] || ''}` : ''}</span>
                </div>
                {r && (
                  <table className="cp-aviso-tabla">
                    <thead><tr><th /><th className="num">Ahora</th><th className="num">Con el registro</th></tr></thead>
                    <tbody>
                      <tr><td>IVA débito</td><td className="num">{gs(r.antes.deb)}</td><td className={`num ${r.antes.deb !== r.despues.deb ? 'is-dif' : ''}`}>{gs(r.despues.deb)}</td></tr>
                      <tr><td>IVA crédito</td><td className="num">{gs(r.antes.cred)}</td><td className={`num ${r.antes.cred !== r.despues.cred ? 'is-dif' : ''}`}>{gs(r.despues.cred)}</td></tr>
                      <tr><td>Resultado</td><td className="num">{resultado(r.antes)}</td><td className="num is-dif"><b>{resultado(r.despues)}</b></td></tr>
                    </tbody>
                  </table>
                )}
                {r && r.estado === 'pres' && x.estado === 'decidir' && (
                  <div className="lb-aviso"><AlertTriangle size={16} aria-hidden="true" /> Figura como <b>presentado</b>: si lo cambiás, puede que haya que rectificar la declaración en Marangatu.</div>
                )}
                {r && r.manual && x.estado === 'decidir' && (
                  <div className="lb-aviso"><AlertTriangle size={16} aria-hidden="true" /> Tiene un monto de IVA cargado a mano: ese monto se mantiene aunque cambien las ventas y compras.</div>
                )}
                {x.estado === 'decidir' && (
                  <div className="cp-aviso-botones">
                    <button type="button" className="rx-btn rx-btn-outline" onClick={() => decidir(i, false)}>Rechazar (no cambiar)</button>
                    <button type="button" className="rx-btn rx-btn-primary" onClick={() => decidir(i, true)}>Aceptar y actualizar el IVA</button>
                  </div>
                )}
                {x.estado === 'aplicando' && <div className="lb-cargando"><RefreshCw size={16} className="animate-spin" aria-hidden="true" /> Actualizando…</div>}
                {x.estado === 'aceptado' && <div className="lb-ok"><CheckCircle2 size={16} aria-hidden="true" /> IVA actualizado.</div>}
                {x.estado === 'rechazado' && <div className="cp-aviso-nada">No se cambió nada en el IVA.</div>}
                {x.estado === 'error' && <div className="lb-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {x.error || 'No se pudo comparar el IVA.'}</div>}
              </div>
            );
          })}
        </div>
        {!quedan && !cargando && (
          <div className="lb-modal-pie">
            <button type="button" className="rx-btn rx-btn-primary" onClick={onCerrar}>Listo</button>
          </div>
        )}
      </div>
    </div>
  );
}
