import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { gs } from '../iva/ivaCore.js';
import MoneyInput from '../iva/MoneyInput';
import {
  CONDICIONES, EMISORES, FORMAS_PAGO, IMPUESTOS, MONEDAS, OPERACIONES, TIPOS,
  calcular, dvRuc, formatearNumero, montoEnLetras, periodoDe, reciboEmitido, revisar,
} from './comprobantesCore.js';

const perTexto = (p) => {
  const [a, m] = String(p || '').split('-').map(Number);
  if (!a || !m) return p;
  const n = new Date(a, m - 1, 1).toLocaleDateString('es-PY', { month: 'long' });
  return n[0].toUpperCase() + n.slice(1) + ' ' + a;
};

// Alta y edición de un comprobante. `contrapartes` = [{ ruc, nombre }] ya
// usados por el cliente, para completar el nombre al escribir el RUC.
// `cliente` = { nombre, ruc, dv } del registro; `estudio` = { nombre, ruc, ... }
// (para los recibos de honorarios). onGuardar(comprobante, otro, conPdf).
// soloRevisar: se usa para corregir algo leído antes de guardarlo (no guarda).
export default function FormComprobante({ inicial, periodoActual, lista, contrapartes, cliente, estudio, guardando, error, onGuardar, onCerrar, soloRevisar = false }) {
  const [c, setC] = useState(inicial);
  const [intentado, setIntentado] = useState(false);
  const primero = useRef(null);
  const editando = !!inicial.id;

  useEffect(() => { if (primero.current) primero.current.focus(); }, []);
  // El padre cambia la `key` para cada comprobante nuevo (se monta de cero).

  const set = (cambio) => setC((x) => ({ ...x, ...cambio }));
  const k = useMemo(() => calcular(c), [c]);
  const recibo = c.tipo === 'recibo';
  const { errores, avisos } = useMemo(() => revisar({ ...c, numero: recibo ? c.numero : formatearNumero(c.numero) }, lista), [c, lista, recibo]);
  const otroMes = c.fecha && periodoDe(c.fecha) !== periodoActual;
  const venta = c.op === 'venta';
  const quien = venta ? 'Cliente' : 'Proveedor';
  const agroVisible = Number(c.g5) > 0 && (venta ? c.tipo === 'factura' || c.tipo === 'nc' : c.tipo === 'nc');

  const alRuc = (v) => {
    const ruc = v.toUpperCase().replace(/\s+/g, '');
    const sinDv = ruc.split('-')[0];
    const conocido = contrapartes.find((x) => x.ruc === ruc) || contrapartes.find((x) => x.ruc.split('-')[0] === sinDv && sinDv.length >= 5);
    set({ ruc, ...(conocido && !c.nombre ? { nombre: conocido.nombre } : {}) });
  };
  const completarDv = () => {
    const r = String(c.ruc || '').trim();
    if (/^\d{5,9}$/.test(r)) set({ ruc: `${r}-${dvRuc(r)}` });
  };

  const enviar = (otro, conPdf = false) => {
    setIntentado(true);
    if (errores.length || guardando) return;
    onGuardar({ ...c, numero: recibo ? String(c.numero || '').trim() : formatearNumero(c.numero) }, otro, conPdf);
  };

  // Cambiar de tipo: el recibo tiene su propio «emisor»; en honorarios del
  // estudio el que paga es el propio cliente.
  const cambiarTipo = (tipo) => {
    if (tipo === c.tipo) return;
    if (tipo === 'recibo') set({ tipo, emisor: 'cliente', numero: '' });
    else set({ tipo, op: c.op || 'venta' });
  };
  const cambiarEmisor = (emisor) => {
    const cambio = { emisor };
    if (emisor === 'estudio' && cliente && !editando) {
      cambio.nombre = cliente.nombre;
      cambio.ruc = cliente.ruc + (cliente.dv ? '-' + cliente.dv : '');
    } else if (c.emisor === 'estudio' && !editando) {
      cambio.nombre = '';
      cambio.ruc = '';
    }
    if (emisor === 'tercero' || c.emisor === 'tercero') cambio.numero = '';
    set(cambio);
  };
  const emitido = recibo && reciboEmitido(c);

  return (
    <div className="lb-modal-fondo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onCerrar(); }}>
      <form
        className="lb-modal cp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-form-titulo"
        onSubmit={(e) => { e.preventDefault(); enviar(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape' && !guardando) onCerrar(); }}
      >
        <div className="lb-modal-head">
          <h2 id="cp-form-titulo">{soloRevisar ? 'Revisar lo leído' : editando ? `Editar ${recibo ? 'recibo' : 'comprobante'}` : recibo ? 'Nuevo recibo de dinero' : 'Nuevo comprobante'}</h2>
          <button type="button" className="lb-icono" onClick={onCerrar} aria-label="Cerrar" disabled={guardando}><X size={18} /></button>
        </div>

        <div className="lb-modal-body cp-form">
          <div className="cp-seg cp-seg-3" role="radiogroup" aria-label="Tipo de documento">
            {Object.entries(TIPOS).map(([v, t]) => (
              <button key={v} type="button" role="radio" aria-checked={c.tipo === v} className={c.tipo === v ? 'is-on' : ''} onClick={() => cambiarTipo(v)} disabled={editando && (v === 'recibo') !== recibo}>
                {t}
              </button>
            ))}
          </div>

          {recibo ? (
            <div className="cp-seg cp-seg-3 cp-seg-sub" role="radiogroup" aria-label="Quién emite el recibo">
              {Object.entries(EMISORES).map(([v, t]) => (
                <button key={v} type="button" role="radio" aria-checked={c.emisor === v} className={c.emisor === v ? 'is-on' : ''} onClick={() => cambiarEmisor(v)}>
                  {t}
                </button>
              ))}
            </div>
          ) : (
          <div className="cp-seg cp-seg-sub" role="radiogroup" aria-label="Operación">
            {Object.entries(OPERACIONES).map(([v, t]) => (
              <button key={v} type="button" role="radio" aria-checked={c.op === v} className={c.op === v ? 'is-on' : ''} onClick={() => set({ op: v, agro: false })}>
                {v === 'venta' ? 'Venta (emitido por el cliente)' : 'Compra (recibido por el cliente)'}
                <span className="cp-seg-corto">{t}</span>
              </button>
            ))}
          </div>
          )}

          {recibo ? (
            <>
              <div className="cp-grid">
                <div className="lb-campo">
                  <label htmlFor="cp-fecha">Fecha</label>
                  <input id="cp-fecha" ref={primero} type="date" value={c.fecha} onChange={(e) => set({ fecha: e.target.value })} />
                </div>
                <div className="lb-campo">
                  <label htmlFor="cp-numero">N° de recibo</label>
                  <input id="cp-numero" value={c.numero} maxLength={40} placeholder={emitido ? 'Automático' : '0000123'}
                    onChange={(e) => set({ numero: e.target.value })} />
                  {emitido && !c.numero && <small>Se numera solo al guardar.</small>}
                </div>
                <div className="lb-campo">
                  <label htmlFor="cp-moneda">Moneda</label>
                  <select id="cp-moneda" value={c.moneda} onChange={(e) => set({ moneda: e.target.value })}>
                    {Object.entries(MONEDAS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </div>
                <div className="lb-campo">
                  <label htmlFor="cp-ruc">{c.emisor === 'tercero' ? 'RUC de quien lo emitió' : 'RUC de quien paga'}</label>
                  <input id="cp-ruc" value={c.ruc} placeholder="80012345-6" list="cp-contrapartes" maxLength={20} autoComplete="off"
                    onChange={(e) => alRuc(e.target.value)} onBlur={completarDv} />
                  <datalist id="cp-contrapartes">
                    {contrapartes.slice(0, 300).map((x) => <option key={x.ruc} value={x.ruc}>{x.nombre}</option>)}
                  </datalist>
                </div>
                <div className="lb-campo cp-span2">
                  <label htmlFor="cp-nombre">{c.emisor === 'tercero' ? 'Emitido por (nombre o razón social)' : 'Recibí de (nombre o razón social)'}</label>
                  <input id="cp-nombre" value={c.nombre} maxLength={120} onChange={(e) => set({ nombre: e.target.value })} />
                </div>
                <div className="lb-campo">
                  <label htmlFor="cp-monto">Monto{c.moneda === 'USD' ? ' (USD)' : ' (Gs.)'}</label>
                  <MoneyInput id="cp-monto" className="cp-monto" decimales={c.moneda === 'USD'} value={c.monto} onValue={(n) => set({ monto: n })} placeholder="0" />
                </div>
                {c.moneda === 'USD' && (
                  <div className="lb-campo">
                    <label htmlFor="cp-cambio">Tipo de cambio (Gs. por USD)</label>
                    <MoneyInput id="cp-cambio" className="cp-monto" value={c.cambio} onValue={(n) => set({ cambio: n })} />
                  </div>
                )}
                <div className={`cp-letras ${c.moneda === 'USD' ? '' : 'cp-span2'}`}>
                  {Number(c.monto) > 0 ? <>Son: <b>{montoEnLetras(c.monto, c.moneda)}</b>{c.moneda === 'USD' && k.total ? ` · Gs. ${gs(k.total)}` : ''}</> : 'El monto en letras aparece acá.'}
                </div>
                <div className="lb-campo cp-span-all">
                  <label htmlFor="cp-concepto">En concepto de</label>
                  <input id="cp-concepto" value={c.concepto} maxLength={300} placeholder={c.emisor === 'estudio' ? 'Honorarios profesionales de noviembre 2026' : 'Pago de factura / anticipo / …'}
                    onChange={(e) => set({ concepto: e.target.value })} />
                </div>
                <div className="lb-campo">
                  <label htmlFor="cp-facturas">Factura(s) que cancela</label>
                  <input id="cp-facturas" value={c.facturas} maxLength={200} placeholder="001-001-0000123"
                    onChange={(e) => set({ facturas: e.target.value })} />
                </div>
                <div className="lb-campo">
                  <label htmlFor="cp-forma">Forma de pago</label>
                  <select id="cp-forma" value={c.formaPago} onChange={(e) => set({ formaPago: e.target.value })}>
                    {Object.entries(FORMAS_PAGO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </div>
                <div className="lb-campo">
                  <label htmlFor="cp-detalle">{c.formaPago === 'cheque' ? 'Banco y N° de cheque' : c.formaPago === 'transferencia' ? 'Banco / referencia' : 'Detalle del pago'}</label>
                  <input id="cp-detalle" value={c.detallePago} maxLength={120} onChange={(e) => set({ detallePago: e.target.value })} />
                </div>
              </div>

              {c.emisor === 'cliente' && (
                <fieldset className="cp-montos cp-emisor">
                  <legend>Datos de {cliente ? cliente.nombre : 'el cliente'} en el recibo (opcionales)</legend>
                  {[['direccion', 'Dirección'], ['telefono', 'Teléfono'], ['ciudad', 'Ciudad']].map(([k2, l]) => (
                    <div className="lb-campo" key={k2}>
                      <label htmlFor={`cp-em-${k2}`}>{l}</label>
                      <input id={`cp-em-${k2}`} value={(c.emisorDatos && c.emisorDatos[k2]) || ''} maxLength={120}
                        onChange={(e) => set({ emisorDatos: { ...(c.emisorDatos || {}), [k2]: e.target.value } })} />
                    </div>
                  ))}
                </fieldset>
              )}
              {c.emisor === 'estudio' && (
                <p className="cp-nota-emisor">
                  Lo emite <b>{estudio ? estudio.nombre : 'el estudio'}</b>{estudio && estudio.ruc ? ` (RUC ${estudio.ruc})` : ''}.
                  {(!estudio || !estudio.ruc) && ' Cargá el RUC, la dirección y el teléfono del estudio en Vencimientos IVA → Colores y feriados → Datos del estudio para los recibos.'}
                </p>
              )}
            </>
          ) : (
            <>
          <div className="cp-grid">
            <div className="lb-campo">
              <label htmlFor="cp-fecha">Fecha</label>
              <input id="cp-fecha" ref={primero} type="date" value={c.fecha} onChange={(e) => set({ fecha: e.target.value })} />
            </div>
            <div className="lb-campo">
              <label htmlFor="cp-condicion">Condición</label>
              <select id="cp-condicion" value={c.condicion} onChange={(e) => set({ condicion: e.target.value })}>
                {Object.entries(CONDICIONES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            <div className="lb-campo">
              <label htmlFor="cp-numero">N° de comprobante</label>
              <input id="cp-numero" value={c.numero} placeholder="001-001-0000001" maxLength={40} inputMode="numeric"
                onChange={(e) => set({ numero: e.target.value })} onBlur={() => set({ numero: formatearNumero(c.numero) })} />
            </div>
            <div className="lb-campo">
              <label htmlFor="cp-timbrado">Timbrado</label>
              <input id="cp-timbrado" value={c.timbrado} placeholder="12345678" inputMode="numeric"
                onChange={(e) => set({ timbrado: e.target.value.replace(/\D/g, '').slice(0, 8) })} />
            </div>
            {c.tipo === 'nc' && (
              <div className="lb-campo">
                <label htmlFor="cp-asociado">Factura que corrige</label>
                <input id="cp-asociado" value={c.asociado} placeholder="001-001-0000001" maxLength={40}
                  onChange={(e) => set({ asociado: e.target.value })} onBlur={() => set({ asociado: formatearNumero(c.asociado) })} />
              </div>
            )}
            <div className="lb-campo">
              <label htmlFor="cp-ruc">RUC del {quien.toLowerCase()}</label>
              <input id="cp-ruc" value={c.ruc} placeholder="80012345-6" list="cp-contrapartes" maxLength={20} autoComplete="off"
                onChange={(e) => alRuc(e.target.value)} onBlur={completarDv} />
              <datalist id="cp-contrapartes">
                {contrapartes.slice(0, 300).map((x) => <option key={x.ruc} value={x.ruc}>{x.nombre}</option>)}
              </datalist>
            </div>
            <div className="lb-campo cp-span2">
              <label htmlFor="cp-nombre">{quien} (nombre o razón social)</label>
              <input id="cp-nombre" value={c.nombre} maxLength={120} onChange={(e) => set({ nombre: e.target.value })} />
            </div>
            <div className="lb-campo">
              <label htmlFor="cp-moneda">Moneda</label>
              <select id="cp-moneda" value={c.moneda} onChange={(e) => set({ moneda: e.target.value })}>
                {Object.entries(MONEDAS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            {c.moneda === 'USD' && (
              <div className="lb-campo">
                <label htmlFor="cp-cambio">Tipo de cambio (Gs. por USD)</label>
                <MoneyInput id="cp-cambio" className="cp-monto" value={c.cambio} onValue={(n) => set({ cambio: n })} />
              </div>
            )}
          </div>

          <fieldset className="cp-montos">
            <legend>Montos {c.moneda === 'USD' ? 'en dólares' : 'en guaraníes'}, con IVA incluido</legend>
            <div className="lb-campo">
              <label htmlFor="cp-g10">Gravado 10%</label>
              <MoneyInput id="cp-g10" className="cp-monto" decimales={c.moneda === 'USD'} value={c.g10} onValue={(n) => set({ g10: n })} placeholder="0" />
              <small>IVA {gs(k.iva10)}</small>
            </div>
            <div className="lb-campo">
              <label htmlFor="cp-g5">Gravado 5%</label>
              <MoneyInput id="cp-g5" className="cp-monto" decimales={c.moneda === 'USD'} value={c.g5} onValue={(n) => set({ g5: n })} placeholder="0" />
              <small>IVA {gs(k.iva5)}</small>
            </div>
            <div className="lb-campo">
              <label htmlFor="cp-ex">Exento</label>
              <MoneyInput id="cp-ex" className="cp-monto" decimales={c.moneda === 'USD'} value={c.ex} onValue={(n) => set({ ex: n })} placeholder="0" />
            </div>
            <div className="cp-total">
              <span>Total{c.moneda === 'USD' ? ' en guaraníes' : ''}</span>
              <strong>Gs. {gs(k.total)}</strong>
            </div>
            {agroVisible && (
              <label className="cp-check cp-span-all">
                <input type="checkbox" checked={!!c.agro} onChange={(e) => set({ agro: e.target.checked })} />
                <span>El 5% es de productos agrícolas naturales (casillas 150/154 del 120)</span>
              </label>
            )}
          </fieldset>

          <div className="cp-imputa" role="group" aria-label="Imputar a">
            <span>Imputar a</span>
            {Object.entries(IMPUESTOS).map(([v, t]) => (
              <label key={v} className={`cp-chip ${c.imputa[v] ? 'is-on' : ''}`}>
                <input type="checkbox" checked={!!c.imputa[v]} onChange={(e) => set({ imputa: { ...c.imputa, [v]: e.target.checked } })} />
                {t}
              </label>
            ))}
          </div>

            </>
          )}

          <div className="lb-campo">
            <label htmlFor="cp-nota">Nota (opcional)</label>
            <input id="cp-nota" value={c.nota} maxLength={200} onChange={(e) => set({ nota: e.target.value })} />
          </div>

          {otroMes && (
            <div className="lb-aviso"><AlertTriangle size={16} aria-hidden="true" /> La fecha es de {perTexto(periodoDe(c.fecha))}: se va a guardar en ese mes.</div>
          )}
          {intentado && errores.length > 0 && (
            <div className="lb-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {errores.join(' ')}</div>
          )}
          {avisos.length > 0 && (
            <ul className="cp-avisos">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          )}
          {error && <div className="lb-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {error}</div>}
        </div>

        <div className="lb-modal-pie">
          <button type="button" className="rx-btn rx-btn-outline" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          {soloRevisar ? (
            <button type="submit" className="rx-btn rx-btn-primary">Listo</button>
          ) : (
            <>
          {!editando && (
            <button type="button" className="rx-btn rx-btn-outline" onClick={() => enviar(true)} disabled={guardando}>Guardar y cargar otro</button>
          )}
          {emitido ? (
            <>
              <button type="submit" className="rx-btn rx-btn-outline" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
              <button type="button" className="rx-btn rx-btn-primary" onClick={() => enviar(false, true)} disabled={guardando}>Guardar y descargar PDF</button>
            </>
          ) : (
            <button type="submit" className="rx-btn rx-btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          )}
            </>
          )}
        </div>
      </form>
    </div>
  );
}
