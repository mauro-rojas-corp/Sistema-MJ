import { useEffect, useRef } from 'react';
import { useClientsData, useClientsMeta } from '../context/ClientsContext';
import { normalizeSearchText } from '../utils';

const sameText = (a, b) => normalizeSearchText(a) === normalizeSearchText(b);
const compactRuc = (v) => String(v ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase();

// Abre la ficha de un cliente que llega desde un aviso del Buzón. Vive dentro
// del <ClientsProvider>: espera a que se cargue el período del aviso y busca
// la fila (por número de fila y nombre; si la planilla cambió, por RUC o por
// nombre). No muestra nada en pantalla.
//
// target: { anio, mes, fila, cliente, ruc, samePeriod }
export default function PendingClientOpener({ target, onFound, onMissing }) {
  const { year, month, nameKey, rucKey } = useClientsMeta();
  const { rows, loading, error } = useClientsData();
  // Si el aviso es de otro período, hay que esperar a que arranque y termine
  // su carga: hasta entonces las filas en memoria son del período anterior.
  const sawLoadingRef = useRef(Boolean(target.samePeriod));
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    if (String(year) !== String(target.anio) || String(month) !== String(target.mes)) return;
    if (loading) {
      sawLoadingRef.current = true;
      return;
    }
    if (!sawLoadingRef.current) return;

    doneRef.current = true;
    if (error) {
      onMissing(`No se pudo abrir ${target.cliente}: ${error}`);
      return;
    }
    const byRow = rows.find(
      (r) => r._row === target.fila && (!nameKey || sameText(r[nameKey], target.cliente))
    );
    const ruc = compactRuc(target.ruc);
    const byRuc = !byRow && ruc && rucKey ? rows.find((r) => compactRuc(r[rucKey]) === ruc) : null;
    const byName = !byRow && !byRuc && nameKey ? rows.find((r) => sameText(r[nameKey], target.cliente)) : null;
    const found = byRow || byRuc || byName;
    if (found) onFound(found);
    else onMissing(`No se encontró a ${target.cliente} en ${target.mes} ${target.anio}.`);
  }, [year, month, loading, error, rows, nameKey, rucKey, target, onFound, onMissing]);

  return null;
}
