import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useClientsMeta } from '../context/ClientsContext';
import {
  pickNameColumn,
  findUserStampColumn,
  findPresentadoColumn,
  findArchivadoColumn,
  findRucColumn,
  findClaveMarangatuColumn,
  findVencimientoColumn,
  findDocumentColumns,
  findObservacionesColumn,
  findFechaRecepcionColumn,
  isDocumentReceived,
  getDocumentItems,
  buildDocumentValue,
  formatDateDMY,
  formatSheetValue,
  parseSheetDate,
  compactHeader,
  normalizeSearchText,
  getFieldType,
  getDisplayHeader,
  formatPeriodLabel,
} from '../utils';
import { api } from '../api';
import { openMarangatuLogin } from '../marangatu';
import {
  splitRuc,
  lastDigit,
  normalizeConfig,
  colorFor,
  textOn,
  vencAuto,
  periodoFiscalDeHoja,
  diasRetraso,
  monthIndexFromSheet,
  fechaCorta,
  DIAS_C,
} from '../iva/ivaCore';
import { getIvaConfig } from '../iva/ivaConfigCache';
import {
  ArrowLeft,
  Receipt,
  Check,
  Save,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
  Archive,
  ChevronDown,
  Eye,
  EyeOff,
  Send,
  Loader2,
  Clock,
  X,
} from 'lucide-react';

// Cuánto queda visible el ✓ "Guardado" después de pintar el cambio.
const SAVED_FEEDBACK_MS = 1800;

// Orden de los datos del cliente en la grilla plegable: primero los que se
// consultan seguido; después el resto de las columnas de la planilla.
const PRIORITY_FIELD_TESTS = [
  (c) => c === 'zona',
  (c) => c.includes('casa'),
  (c) => c === 'barrio',
  (c) => c === 'estado',
  (c) => c === 'contacto' || c.startsWith('contacto'),
  (c) => c.startsWith('telefono') || c.startsWith('tel') || c.startsWith('celular'),
];

function sameUser(a, b) {
  return normalizeSearchText(a) === normalizeSearchText(b);
}

// "Día 7" -> "día 7"; una fecha ISO -> dd/mm/aaaa.
function formatVencimiento(value) {
  const text = formatSheetValue(value);
  if (!text) return '';
  return /^d[ií]a\s/i.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

export default function ClientDetail({
  user,
  year,
  month,
  client,
  onBack,
  canAssignClients,
  readOnlyPreview = false,
  onOpenIva,
}) {
  // El detalle también escribe sobre el estado compartido del período: así
  // lo que se edita acá ya está actualizado en la lista y en "Asignar
  // clientes" cuando se vuelve, sin recargar nada. Usa useClientsMeta()
  // para no re-renderizarse cuando cambian `rows`, filtros o `savedRows`.
  const { saveRowUpdatesInBackground, encargadoCol, teamUsers, repartoUsers } = useClientsMeta();

  const [values, setValues] = useState(client);
  const [savedField, setSavedField] = useState(null);
  const [activeField, setActiveField] = useState(null);
  const [error, setError] = useState('');

  // Timer del ✓ "Guardado". Se limpia al desmontar: si el usuario vuelve a
  // la lista antes de que se cumpla, no queda un setState colgado.
  const savedTimer = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const fields = useMemo(() => {
    // Excluye TODOS los campos internos que arrancan con "_" (no solo
    // _row): son cálculos del frontend (como _assignedUser, el
    // encargado calculado por round-robin) que nunca fueron columnas
    // reales de tu hoja.
    return Object.keys(client).filter((k) => !k.startsWith('_'));
  }, [client]);

  const nameKey = pickNameColumn(fields);
  const clientName = values[nameKey] || client[nameKey] || 'Cliente';

  const presentadoPorCol = useMemo(() => findUserStampColumn(fields, 'presentado'), [fields]);
  const archivadoPorCol = useMemo(() => findUserStampColumn(fields, 'archivado'), [fields]);
  const rucColumn = useMemo(() => findRucColumn(fields), [fields]);
  const claveColumn = useMemo(() => findClaveMarangatuColumn(fields), [fields]);
  const vencimientoColumn = useMemo(() => findVencimientoColumn(fields), [fields]);

  // --- Columnas de la recepción de documentación -----------------------
  const documentColumns = useMemo(() => findDocumentColumns(fields), [fields]);
  const observacionesColumn = useMemo(() => findObservacionesColumn(fields), [fields]);
  const fechaColumn = useMemo(() => findFechaRecepcionColumn(fields), [fields]);
  const hasReception = documentColumns.length > 0;

  // Con casillas de verificación de Sheets la celda trae true/false: en ese
  // caso se escribe igual, para no romper la casilla.
  const booleanDocs = useMemo(
    () => documentColumns.some((d) => typeof client[d.column] === 'boolean'),
    [documentColumns, client]
  );

  // Borrador de la recepción: no se guarda hasta "Registrar recepción".
  const initialDraft = useMemo(() => {
    const docs = {};
    documentColumns.forEach((d) => {
      docs[d.column] = {
        received: isDocumentReceived(client[d.column]),
        items: getDocumentItems(client[d.column]),
        input: '',
      };
    });
    return {
      docs,
      observaciones: observacionesColumn ? formatSheetValue(client[observacionesColumn]) : '',
    };
  }, [documentColumns, observacionesColumn, client]);
  const [draft, setDraft] = useState(initialDraft);
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState(null); // { tipo: 'ok'|'aviso'|'error', texto }

  const [datosOpen, setDatosOpen] = useState(!hasReception);
  const [showClave, setShowClave] = useState(false);

  // El campo Encargado se edita con un desplegable del equipo completo. Los
  // que no participan del reparto automático van en su propio grupo, pero
  // se pueden elegir igual.
  const nonParticipants = useMemo(
    () => (teamUsers || []).filter((u) => !(repartoUsers || []).includes(u)),
    [teamUsers, repartoUsers]
  );

  const presUser = presentadoPorCol && values[presentadoPorCol] ? String(values[presentadoPorCol]) : null;
  const archUser = archivadoPorCol && values[archivadoPorCol] ? String(values[archivadoPorCol]) : null;

  const encargado = encargadoCol ? String(values[encargadoCol] ?? '').trim() : '';
  const avisaAlEncargado = Boolean(encargado) && !sameUser(encargado, user);

  // Credenciales de Marangatu de esta fila. Sólo se ofrece el botón cuando
  // la planilla tiene ambas columnas y la fila tiene los dos valores.
  const marangatuCredentials = useMemo(() => {
    if (readOnlyPreview || !rucColumn || !claveColumn) return null;
    const ruc = String(values[rucColumn] ?? '').trim();
    const clave = String(values[claveColumn] ?? '').trim();
    if (!ruc || !clave) return null;
    return { user: ruc, pass: clave };
  }, [rucColumn, claveColumn, values, readOnlyPreview]);

  // RUC sin DV: identifica al cliente en Vencimientos IVA.
  const ivaRuc = useMemo(
    () => (rucColumn ? splitRuc(values[rucColumn]).ruc : ''),
    [rucColumn, values]
  );

  const rucText = rucColumn ? String(values[rucColumn] ?? '').trim() : '';

  // Vencimiento como en Vencimientos IVA: VENC. = último dígito del RUC (sin
  // DV), vence el día 7 + 2·VENC. del mes siguiente al de la hoja (hoja
  // octubre → noviembre), con el color de ese
  // VENC. Sin RUC usable, se toma el día de la columna Vencimiento.
  const [ivaConfig, setIvaConfig] = useState(() => normalizeConfig(null));
  useEffect(() => {
    let vivo = true;
    getIvaConfig().then((config) => {
      if (vivo) setIvaConfig(config);
    });
    return () => {
      vivo = false;
    };
  }, []);
  const venc = useMemo(() => {
    const digito = lastDigit(splitRuc(rucText).ruc);
    const periodo = periodoFiscalDeHoja(year, month);
    let fecha = null;
    if (digito !== null && periodo) {
      fecha = vencAuto(ivaConfig, digito, periodo).fecha;
    } else {
      const dia = parseInt(String(vencimientoColumn ? values[vencimientoColumn] ?? '' : '').replace(/\D+/g, ' ').trim(), 10);
      const mesIdx = monthIndexFromSheet(month);
      const anioHoja = String(month || '').match(/\b(20\d{2})\b/);
      const anio = Number(anioHoja ? anioHoja[1] : year);
      // Vence el mes siguiente al de la hoja (hoja octubre → noviembre).
      if (dia >= 1 && dia <= 31 && mesIdx !== null && anio) fecha = new Date(anio, mesIdx + 1, dia);
    }
    const color = digito !== null ? colorFor(ivaConfig, digito) : null;
    return { digito, fecha, color };
  }, [rucText, year, month, ivaConfig, vencimientoColumn, values]);

  // Retraso de la documentación: los papeles deben llegar hasta el día del
  // vencimiento (el 7/11 para VENC. 0; el 8/11 ya es 1 día de retraso). Si ya
  // se registró la llegada (columna Fecha), el retraso queda fijo en esa
  // fecha; si todavía no llegaron, se cuenta hasta hoy.
  // La documentación del período llega desde el 1° del mes del vencimiento
  // (papeles de septiembre: desde el 1/10). Una fecha anterior es de otro
  // mes (por ejemplo, quedó al copiar la planilla) y no cuenta como llegada.
  const fechaCelda = fechaColumn ? parseSheetDate(values[fechaColumn]) : null;
  const inicioRecepcion = venc.fecha ? new Date(venc.fecha.getFullYear(), venc.fecha.getMonth(), 1) : null;
  const llegada = fechaCelda && (!inicioRecepcion || fechaCelda >= inicioRecepcion) ? fechaCelda : null;
  const retraso = venc.fecha
    ? llegada
      ? { tipo: 'llego', dias: diasRetraso(venc.fecha, llegada), fecha: llegada }
      : { tipo: 'pendiente', dias: diasRetraso(venc.fecha, new Date()) }
    : { tipo: 'pendiente', dias: 0 };
  const textoFecha = (d) => `${DIAS_C[d.getDay()]} ${fechaCorta(d)}`;
  const diasTexto = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;
  // Retraso con que quedaría registrada la recepción si se registra hoy.
  const retrasoHoy = venc.fecha ? diasRetraso(venc.fecha, new Date()) : 0;
  const vencimientoText = vencimientoColumn ? formatVencimiento(values[vencimientoColumn]) : '';
  const fechaActual = fechaColumn ? formatSheetValue(values[fechaColumn]) : '';
  const hoy = formatDateDMY(new Date());

  // Campos de la grilla "Datos del cliente": todo lo que no está en la
  // recepción, con los más consultados primero.
  const datosFields = useMemo(() => {
    const reception = new Set(documentColumns.map((d) => d.column));
    if (observacionesColumn) reception.add(observacionesColumn);
    if (fechaColumn) reception.add(fechaColumn);
    const rest = hasReception ? fields.filter((f) => !reception.has(f)) : [...fields];
    const ordered = [];
    const take = (f) => {
      if (f && rest.includes(f) && !ordered.includes(f)) ordered.push(f);
    };
    PRIORITY_FIELD_TESTS.forEach((test) => take(rest.find((f) => test(compactHeader(f)))));
    take(claveColumn);
    take(encargadoCol);
    rest.forEach(take);
    return ordered;
  }, [fields, documentColumns, observacionesColumn, fechaColumn, hasReception, claveColumn, encargadoCol]);

  const datosResumen = useMemo(
    () =>
      datosFields
        .slice(0, 4)
        .map((f) => formatSheetValue(values[f]))
        .filter(Boolean)
        .join(' · '),
    [datosFields, values]
  );

  // Guardado fluido de un campo de la grilla: el valor se pinta AL INSTANTE
  // (formulario + estado compartido) y la escritura real queda en la cola de
  // fondo. Si falla, se revierte y se muestra el error.
  function saveField(column, newValue) {
    if (readOnlyPreview) return;

    const valToSave = newValue !== undefined ? newValue : values[column];
    const updates = { [column]: valToSave };

    // Sello de usuario al marcar SÍ en Presentado / Archivado; se limpia con NO.
    if (valToSave === 'SI' || valToSave === 'SÍ') {
      if (findPresentadoColumn([column]) && presentadoPorCol && column !== presentadoPorCol) {
        updates[presentadoPorCol] = user;
      } else if (findArchivadoColumn([column]) && archivadoPorCol && column !== archivadoPorCol) {
        updates[archivadoPorCol] = user;
      }
    } else if (valToSave === 'NO' || valToSave === '') {
      if (findPresentadoColumn([column]) && presentadoPorCol && column !== presentadoPorCol) {
        updates[presentadoPorCol] = '';
      } else if (findArchivadoColumn([column]) && archivadoPorCol && column !== archivadoPorCol) {
        updates[archivadoPorCol] = '';
      }
    }

    const prevValues = {};
    Object.keys(updates).forEach((col) => {
      prevValues[col] = values[col];
    });

    setValues((prev) => ({ ...prev, ...updates }));
    setError('');

    setSavedField(column);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => {
      savedTimer.current = null;
      setSavedField(null);
    }, SAVED_FEEDBACK_MS);

    saveRowUpdatesInBackground(client._row, updates).catch((err) => {
      if (!mountedRef.current) return;
      setSavedField((prev) => (prev === column ? null : prev));
      setValues((prev) => {
        let next = null;
        Object.entries(updates).forEach(([col, val]) => {
          if (prev[col] === val) {
            if (!next) next = { ...prev };
            next[col] = prevValues[col];
          }
        });
        return next || prev;
      });
      setError(`No se pudo guardar "${column}": ${err.message}`);
    });
  }

  // --- Recepción de documentación ---------------------------------------
  const receivedDocs = documentColumns.filter((d) => draft.docs[d.column]?.received);
  const observacionesDraft = draft.observaciones.trim();
  const canRegister =
    !readOnlyPreview && !registering && (receivedDocs.length > 0 || observacionesDraft.length > 0);

  function toggleDoc(column) {
    if (readOnlyPreview || registering) return;
    setRegisterResult(null);
    setDraft((prev) => ({
      ...prev,
      docs: {
        ...prev.docs,
        [column]: { ...prev.docs[column], received: !prev.docs[column].received },
      },
    }));
  }

  const MAX_ITEMS = 40;

  function setDocInput(column, input) {
    setRegisterResult(null);
    setDraft((prev) => ({
      ...prev,
      docs: { ...prev.docs, [column]: { ...prev.docs[column], input } },
    }));
  }

  // Enter suma lo escrito como un ítem más de ese documento.
  function addDocItem(column) {
    setRegisterResult(null);
    setDraft((prev) => {
      const doc = prev.docs[column];
      const item = doc.input.trim();
      if (!item || doc.items.length >= MAX_ITEMS) return prev;
      return { ...prev, docs: { ...prev.docs, [column]: { ...doc, items: [...doc.items, item], input: '' } } };
    });
  }

  function removeDocItem(column, index) {
    setRegisterResult(null);
    setDraft((prev) => {
      const doc = prev.docs[column];
      return {
        ...prev,
        docs: { ...prev.docs, [column]: { ...doc, items: doc.items.filter((_, i) => i !== index) } },
      };
    });
  }

  // Ítems finales: lo agregado más lo que haya quedado escrito sin Enter.
  const finalItems = (doc) => (doc.input.trim() ? [...doc.items, doc.input.trim()] : doc.items);

  async function registerReception() {
    if (!canRegister) return;
    setRegistering(true);
    setRegisterResult(null);
    setError('');

    const updates = {};
    const itemsPorDoc = {};
    documentColumns.forEach((d) => {
      const doc = draft.docs[d.column];
      const items = booleanDocs ? [] : finalItems(doc);
      itemsPorDoc[d.column] = items;
      const nextValue = buildDocumentValue(doc.received, items, booleanDocs);
      const current = values[d.column];
      const unchanged =
        isDocumentReceived(current) === doc.received &&
        (booleanDocs || getDocumentItems(current).join('\n') === items.join('\n'));
      if (!unchanged) updates[d.column] = nextValue;
    });
    // Lo escrito sin Enter queda incorporado a la lista.
    setDraft((prev) => {
      const docs = { ...prev.docs };
      documentColumns.forEach((d) => {
        if (!booleanDocs) docs[d.column] = { ...docs[d.column], items: itemsPorDoc[d.column], input: '' };
      });
      return { ...prev, docs };
    });
    if (observacionesColumn && observacionesDraft !== formatSheetValue(values[observacionesColumn])) {
      updates[observacionesColumn] = observacionesDraft;
    }
    // La fecha se completa sola con el día del registro.
    if (fechaColumn) updates[fechaColumn] = hoy;

    const prevValues = {};
    Object.keys(updates).forEach((col) => {
      prevValues[col] = values[col];
    });
    setValues((prev) => ({ ...prev, ...updates }));

    try {
      await saveRowUpdatesInBackground(client._row, updates);
    } catch (err) {
      if (!mountedRef.current) return;
      setValues((prev) => {
        const next = { ...prev };
        Object.entries(updates).forEach(([col, val]) => {
          if (prev[col] === val) next[col] = prevValues[col];
        });
        return next;
      });
      setRegistering(false);
      setRegisterResult({ tipo: 'error', texto: `No se pudo registrar la recepción: ${err.message}` });
      return;
    }

    // La fila se pinta de B a K con el color del Vencimiento (columna A).
    // Si no se puede, la recepción igual quedó registrada: sólo se avisa.
    let notaColor = '';
    try {
      const pintura = await api.recepcion.pintarFila({ year, sheet: month, row: client._row });
      if (pintura && pintura.pintado === false) notaColor = ` No se pintó la fila: ${pintura.motivo}`;
    } catch (err) {
      notaColor = ` No se pudo pintar la fila: ${err.message}`;
    }

    const conRetraso = retrasoHoy > 0 ? ` con ${diasTexto(retrasoHoy)} de retraso` : '';
    let result;
    if (!avisaAlEncargado) {
      result = {
        tipo: 'ok',
        texto: encargado
          ? `Recepción registrada el ${hoy}${conRetraso}. Sos el Encargado de este cliente: no hace falta aviso.`
          : `Recepción registrada el ${hoy}${conRetraso}. El cliente no tiene Encargado: no se envió aviso.`,
      };
    } else {
      try {
        await api.avisos.crear({
          para: encargado,
          anio: String(year),
          mes: String(month),
          fila: client._row,
          cliente: String(clientName),
          ruc: rucText,
          documentos: receivedDocs.map((d) => {
            const items = itemsPorDoc[d.column] || [];
            return items.length ? `${d.label} (${items.join(', ')})` : d.label;
          }),
          nota: observacionesDraft,
          vencimiento: venc.fecha
            ? `${textoFecha(venc.fecha)}${retrasoHoy > 0 ? ` · llegó con ${diasTexto(retrasoHoy)} de retraso` : ''}`
            : vencimientoText,
        });
        result = { tipo: 'ok', texto: `Recepción registrada el ${hoy}${conRetraso} y aviso enviado a ${encargado}.` };
      } catch (err) {
        result = {
          tipo: 'aviso',
          texto: `La recepción quedó registrada, pero no se pudo avisar a ${encargado}: ${err.message}`,
        };
      }
    }
    if (notaColor) {
      result = { tipo: result.tipo === 'ok' ? 'aviso' : result.tipo, texto: result.texto + notaColor };
    }
    if (!mountedRef.current) return;
    setRegistering(false);
    setRegisterResult(result);
  }

  // --- Controles de un campo de la grilla --------------------------------
  function renderSaveButton(field) {
    const isJustSaved = savedField === field;
    return (
      <motion.button
        type="button"
        className={`field-save-btn ${isJustSaved ? 'saved' : ''}`}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        disabled={values[field] === client[field]}
        onClick={() => saveField(field)}
        aria-label={`Guardar ${getDisplayHeader(field)}`}
      >
        {isJustSaved ? <Check size={15} /> : <Save size={15} />}
      </motion.button>
    );
  }

  function renderTextInput(field, { placeholder = 'Escribir...', type = 'text' } = {}) {
    return (
      <input
        type={type}
        className="field-input"
        placeholder={placeholder}
        value={formatSheetValue(values[field])}
        autoComplete={type === 'password' ? 'off' : undefined}
        onFocus={() => setActiveField(field)}
        onBlur={() => setActiveField((prev) => (prev === field ? null : prev))}
        onChange={(e) => setValues({ ...values, [field]: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') saveField(field);
        }}
      />
    );
  }

  function renderFieldControl(field) {
    const isEncargadoField = Boolean(encargadoCol) && field === encargadoCol;
    const fieldType = isEncargadoField ? 'assignment' : getFieldType(field, values[field]);
    const currentValue = String(values[field] ?? '').trim().toUpperCase();

    if (readOnlyPreview) {
      return (
        <div className="field-readonly-value" title="Preview ejecutivo de sólo lectura">
          {field === claveColumn ? '••••••••' : formatSheetValue(values[field]) || '—'}
        </div>
      );
    }

    if (field === claveColumn) {
      return (
        <div className="field-input-row">
          {renderTextInput(field, { type: showClave ? 'text' : 'password', placeholder: 'Clave MH' })}
          <button
            type="button"
            className="field-save-btn rx-clave-toggle"
            onClick={() => setShowClave((v) => !v)}
            aria-label={showClave ? 'Ocultar Clave MH' : 'Mostrar Clave MH'}
            title={showClave ? 'Ocultar' : 'Mostrar'}
          >
            {showClave ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          {renderSaveButton(field)}
        </div>
      );
    }

    if (fieldType === 'pure_yesno' || fieldType === 'hybrid') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="yesno-toggle-group">
            <motion.button
              type="button"
              className={`yesno-toggle-btn ${currentValue === 'SI' || currentValue === 'SÍ' ? 'active-si' : ''}`}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              onFocus={() => setActiveField(field)}
              onClick={() => saveField(field, 'SI')}
            >
              <CheckCircle2 size={14} />
              <span>SÍ</span>
            </motion.button>
            <motion.button
              type="button"
              className={`yesno-toggle-btn ${currentValue === 'NO' ? 'active-no' : ''}`}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              onFocus={() => setActiveField(field)}
              onClick={() => saveField(field, 'NO')}
            >
              <XCircle size={14} />
              <span>NO</span>
            </motion.button>
            {fieldType === 'pure_yesno' && (
              <motion.button
                type="button"
                className="yesno-toggle-btn"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                style={{ flex: '0 0 auto', padding: '8px' }}
                title="Limpiar campo"
                onFocus={() => setActiveField(field)}
                onClick={() => saveField(field, '')}
              >
                -
              </motion.button>
            )}
          </div>
          {fieldType === 'hybrid' && (
            <div className="field-input-row">
              {renderTextInput(field, { placeholder: 'Escribir texto o nombre...' })}
              {renderSaveButton(field)}
            </div>
          )}
        </div>
      );
    }

    if (isEncargadoField) {
      if (!canAssignClients) {
        return (
          <div className="field-readonly-value" title="Solo administradores pueden cambiar este campo">
            {encargado || 'Sin asignar'}
          </div>
        );
      }
      // Si la hoja tiene un encargado que ya no está en el equipo
      // sincronizado, se conserva como opción en vez de blanquearlo.
      const encargadoFueraDeEquipo =
        encargado && !(teamUsers || []).includes(encargado) ? encargado : '';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <select
            className="select-input"
            value={encargado}
            onFocus={() => setActiveField(field)}
            onBlur={() => setActiveField((prev) => (prev === field ? null : prev))}
            onChange={(e) => saveField(field, e.target.value)}
          >
            <option value="">Sin asignar</option>
            {encargadoFueraDeEquipo && (
              <option value={encargadoFueraDeEquipo}>{encargadoFueraDeEquipo} (fuera del equipo)</option>
            )}
            {(repartoUsers || []).length > 0 && (
              <optgroup label="Participan del reparto">
                {(repartoUsers || []).map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </optgroup>
            )}
            {nonParticipants.length > 0 && (
              <optgroup label="No participan (asignación manual)">
                {nonParticipants.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </optgroup>
            )}
          </select>
          <div className="field-input-row">
            {renderTextInput(field, { placeholder: 'Otro nombre (se escribe tal cual en la hoja)' })}
            {renderSaveButton(field)}
          </div>
        </div>
      );
    }

    return (
      <div className="field-input-row">
        {renderTextInput(field)}
        {renderSaveButton(field)}
      </div>
    );
  }

  function renderFieldCard(field) {
    const isJustSaved = savedField === field;
    const isActive = activeField === field;
    return (
      <div className={`field-card rx-datos-card ${isActive ? 'field-card-active' : ''}`} key={field}>
        <div className="field-label">
          <span className="field-label-wrapper">
            <span>{getDisplayHeader(field)}</span>
          </span>
          <AnimatePresence>
            {isJustSaved && (
              <motion.span
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
              >
                <Check size={12} /> Guardado
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        {renderFieldControl(field)}
      </div>
    );
  }

  const metaParts = [
    rucText && `R.U.C. ${rucText}`,
    vencimientoText && `Vence el ${vencimientoText}`,
    `Fila #${client._row}`,
    formatPeriodLabel(month, year),
  ].filter(Boolean);

  return (
    <div className="screen wide rx-client-detail">
      <div className="screen-header">
        <motion.button
          className="back-btn"
          whileHover={{ scale: 1.04, x: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
        >
          <ArrowLeft size={16} />
          <span>Volver a la lista</span>
        </motion.button>

        <div className="save-all-notice">
          <FileText size={14} />
          <span>{readOnlyPreview ? 'Vista de sólo lectura' : 'Cambios sincronizados en vivo'}</span>
        </div>
      </div>

      {/* Cabecera: identidad del cliente y accesos rápidos */}
      <motion.section
        className="rx-card rx-client-head"
        style={venc.color ? { borderLeft: `6px solid ${venc.color}` } : undefined}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      >
        <div className="rx-client-head-main">
          <h2 className="rx-client-name">{formatSheetValue(clientName)}</h2>
          <div className="rx-client-meta">
            {venc.color && (
              <span
                className="rx-venc-chip"
                style={{ background: venc.color, color: textOn(venc.color) }}
                title="Color del vencimiento en Vencimientos IVA"
              >
                VENC. {venc.digito}
                {venc.fecha && ` · ${DIAS_C[venc.fecha.getDay()]} ${venc.fecha.getDate()}`}
              </span>
            )}
            <span>{metaParts.join(' · ')}</span>
          </div>
          {(presUser || archUser) && (
            <div className="stamps-row">
              {presUser && (
                <span className="user-stamp-badge presentado">
                  <CheckCircle2 size={11} />{' '}
                  {sameUser(presUser, user) ? 'Presentado por vos' : <>Presentado por: <strong>{presUser}</strong></>}
                </span>
              )}
              {archUser && (
                <span className="user-stamp-badge archivado">
                  <Archive size={11} />{' '}
                  {sameUser(archUser, user) ? 'Archivado por vos' : <>Archivado por: <strong>{archUser}</strong></>}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="rx-client-head-actions">
          {/* Las credenciales viajan sólo por el canal de la extensión
              (nunca por la URL). */}
          {marangatuCredentials && (
            <button
              type="button"
              className="rx-btn rx-btn-outline"
              title={`Abrir Marangatu con el RUC ${marangatuCredentials.user}`}
              onClick={() => openMarangatuLogin(marangatuCredentials, (m) => window.alert(m))}
            >
              <img className="rx-btn-logo" src="/marangatu.svg" alt="" aria-hidden="true" />
              <span>Abrir Marangatu</span>
            </button>
          )}
          {onOpenIva && ivaRuc && (
            <button
              type="button"
              className="rx-btn rx-btn-outline"
              title="Abrir la liquidación de IVA de este cliente"
              onClick={() => onOpenIva(ivaRuc)}
            >
              <Receipt size={16} />
              <span>Liquidación IVA</span>
            </button>
          )}
        </div>
      </motion.section>

      {error && (
        <div className="error-banner" role="alert">
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
      )}

      {/* Registro de documentación: lo que más se edita, arriba y destacado */}
      {hasReception && (
        <section className="rx-card rx-recepcion" aria-labelledby="rx-recepcion-title">
          <div className="rx-recepcion-head">
            <h3 id="rx-recepcion-title">Registro de documentación</h3>
            {fechaColumn && (
              <span className="rx-recepcion-fecha">
                <span>Fecha: <strong>hoy, {hoy}</strong> (se completa sola)</span>
                {fechaActual && fechaActual !== hoy && (
                  <span className="rx-recepcion-fecha-prev">Último registro: {fechaActual}</span>
                )}
              </span>
            )}
          </div>

          {retraso.dias > 0 && (
            <div className="rx-retraso" role="status">
              <Clock size={18} aria-hidden="true" />
              {retraso.tipo === 'llego' ? (
                <span>
                  <strong>Llegó con {diasTexto(retraso.dias)} de retraso</strong> (el {textoFecha(retraso.fecha)};
                  vencía el {textoFecha(venc.fecha)}).
                </span>
              ) : (
                <span>
                  <strong>Documentación pendiente: {diasTexto(retraso.dias)} de retraso.</strong> Vencía el{' '}
                  {textoFecha(venc.fecha)}; si se registra hoy, queda con {diasTexto(retraso.dias)} de retraso.
                </span>
              )}
            </div>
          )}

          <div className="rx-doc-grid">
            {documentColumns.map((d) => {
              const doc = draft.docs[d.column];
              const received = Boolean(doc?.received);
              return (
                <div className="rx-doc" key={d.column}>
                  <button
                    type="button"
                    className={`rx-doc-btn ${received ? 'is-received' : ''}`}
                    aria-pressed={received}
                    disabled={readOnlyPreview || registering}
                    onClick={() => toggleDoc(d.column)}
                  >
                    <span className="rx-doc-label">
                      {received && <Check size={18} strokeWidth={3} aria-hidden="true" />}
                      {d.label}
                    </span>
                    <small>{received ? 'Recibido' : 'Pendiente'}</small>
                  </button>
                  {received && !booleanDocs && doc.items.length > 0 && (
                    <ul className="rx-doc-items" aria-label={`${d.label}: lo que llegó`}>
                      {doc.items.map((item, i) => (
                        <li key={`${i}-${item}`}>
                          <span>{item}</span>
                          {!readOnlyPreview && (
                            <button
                              type="button"
                              className="rx-doc-item-remove"
                              aria-label={`Quitar ${item}`}
                              title="Quitar"
                              disabled={registering}
                              onClick={() => removeDocItem(d.column, i)}
                            >
                              <X size={14} aria-hidden="true" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {received && !booleanDocs && !readOnlyPreview && (
                    <div className="rx-doc-add">
                      <input
                        type="text"
                        className="rx-doc-detail"
                        aria-label={`Agregar a ${d.label}`}
                        value={doc.input}
                        maxLength={120}
                        disabled={registering || doc.items.length >= MAX_ITEMS}
                        onChange={(e) => setDocInput(d.column, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addDocItem(d.column);
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {observacionesColumn && (
            <div className="rx-obs">
              <label htmlFor="rx-obs-input">{getDisplayHeader(observacionesColumn)}</label>
              <textarea
                id="rx-obs-input"
                rows={2}
                value={draft.observaciones}
                placeholder="Ej.: faltan facturas de agosto"
                disabled={readOnlyPreview || registering}
                maxLength={1000}
                onChange={(e) => {
                  setRegisterResult(null);
                  setDraft((prev) => ({ ...prev, observaciones: e.target.value }));
                }}
              />
            </div>
          )}

          {registerResult && (
            <div
              className={`rx-register-result is-${registerResult.tipo}`}
              role={registerResult.tipo === 'ok' ? 'status' : 'alert'}
            >
              {registerResult.tipo === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{registerResult.texto}</span>
            </div>
          )}

          {!readOnlyPreview && (
            <div className="rx-recepcion-foot">
              <span className="rx-recepcion-aviso">
                {avisaAlEncargado ? (
                  <>Se avisará a <strong>{encargado}</strong> al registrar.</>
                ) : encargado ? (
                  <>Sos el Encargado de este cliente: no se envía aviso.</>
                ) : (
                  <>Sin Encargado asignado: se registra sin aviso.</>
                )}
              </span>
              <button
                type="button"
                className="rx-btn rx-btn-primary"
                disabled={!canRegister}
                title={canRegister ? undefined : 'Marcá al menos un documento o escribí una observación'}
                onClick={registerReception}
              >
                {registering ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                <span>
                  {registering
                    ? 'Registrando…'
                    : avisaAlEncargado
                      ? 'Registrar recepción y avisar'
                      : 'Registrar recepción'}
                </span>
              </button>
            </div>
          )}
        </section>
      )}

      {/* Datos del cliente: grilla compacta y plegable, todo editable */}
      <section className="rx-card rx-datos">
        <button
          type="button"
          className="rx-datos-toggle"
          aria-expanded={datosOpen}
          aria-controls="rx-datos-grid"
          onClick={() => setDatosOpen((v) => !v)}
        >
          <span className="rx-datos-title">
            <h3>Datos del cliente</h3>
            {!datosOpen && datosResumen && <span className="rx-datos-resumen">{datosResumen}</span>}
          </span>
          <span className="rx-datos-toggle-label">
            {datosOpen ? 'Ocultar' : 'Mostrar'}
            <ChevronDown size={18} className={datosOpen ? 'is-open' : ''} aria-hidden="true" />
          </span>
        </button>
        {datosOpen && (
          <div className="rx-datos-grid" id="rx-datos-grid">
            {datosFields.map(renderFieldCard)}
          </div>
        )}
      </section>
    </div>
  );
}
