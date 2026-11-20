import { useEffect, useMemo, useState } from 'react';
import { useClientsData, useClientsMeta } from '../context/ClientsContext';
import { clientesDeFilas } from '../comun/clientes';
import { firma } from '../iva/ivaCore.js';
import { getIvaConfig } from '../iva/ivaConfigCache';
import AvisoCambioIva from '../iva/AvisoCambioIva';
import LeerDocumentos from './LeerDocumentos';
import '../libros/libros.css';
import './comprobantes.css';

// «Subir documentos» desde otra sección (p. ej. XML / KuDE): lee los
// archivos, deja revisar, guarda en el registro y avisa si cambia un IVA.
// onCerrar(mensaje) al terminar (mensaje vacío si se canceló).
export default function SubirAlRegistro({ archivos, onCerrar }) {
  const { headers, nameKey, rucKey } = useClientsMeta();
  const { assignedRows } = useClientsData();
  const clientes = useMemo(
    () => [...clientesDeFilas(assignedRows, headers, nameKey, rucKey).values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [assignedRows, headers, nameKey, rucKey]
  );
  const [estudio, setEstudio] = useState(null);
  useEffect(() => { let v = true; getIvaConfig().then((c) => { if (v) setEstudio(c ? { nombre: firma(c), ...(c.estudio || {}) } : null); }); return () => { v = false; }; }, []);
  const [aviso, setAviso] = useState(null); // { pendientes, mensaje }

  if (aviso) return <AvisoCambioIva pendientes={aviso.pendientes} onCerrar={() => onCerrar(aviso.mensaje)} />;
  return (
    <LeerDocumentos
      clientes={clientes}
      preferido=""
      estudio={estudio}
      archivosIniciales={archivos}
      onCerrar={() => onCerrar('')}
      onGuardado={({ afectados, agregados, repetidos }) => {
        const mensaje = `Guardados ${agregados} en Comprobantes${repetidos ? ` · ${repetidos} ya estaban` : ''}`;
        if (afectados.length) setAviso({ pendientes: afectados, mensaje });
        else onCerrar(mensaje);
      }}
    />
  );
}
