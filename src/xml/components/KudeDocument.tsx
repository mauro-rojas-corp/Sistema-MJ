import React, { useState } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { KudeDocumentData } from '../types/kude';
import { KudeQrCode } from './KudeQrCode';
import { formatParaguayDate } from '../utils/dateFormatter';

interface KudeDocumentProps {
  document: KudeDocumentData;
  scale?: number;
  ecoMode?: boolean;
  compact?: boolean;
  id?: string;
  copyTag?: string;
  targetItemRows?: number;
  /** Alto disponible real (en mm) para esta factura compacta dentro de la
   * hoja dúo. Si el contenido natural la excede, se achica con transform
   * hasta que entre completa — nunca se recorta (no se pierden ítems). */
  maxHeightMm?: number;
  /** Para facturas largas partidas manualmente en varias hojas: los ítems
   * que corresponden a ESTA hoja en particular (en vez de doc.items). */
  itemsOverride?: KudeDocumentData['items'];
  /** Si es false, no se renderiza el bloque de totales/IVA/QR — se usa en
   * las hojas de continuación, dejando ese bloque solo para la última. */
  showFooter?: boolean;
  /** Etiqueta opcional de paginación, ej. "Página 1 de 3". */
  pageLabel?: string;
}

export const KudeDocument: React.FC<KudeDocumentProps> = ({
  document: doc,
  scale = 1,
  ecoMode = true,
  compact = false,
  id = 'kude-printable-sheet',
  copyTag,
  targetItemRows,
  maxHeightMm,
  itemsOverride,
  showFooter = true,
  pageLabel,
}) => {
  const [copiedCdc, setCopiedCdc] = useState(false);

  const handleCopyCdc = () => {
    if (!doc.cdc) return;
    navigator.clipboard.writeText(doc.cdc);
    setCopiedCdc(true);
    setTimeout(() => setCopiedCdc(false), 2000);
  };

  const isGuarani = doc.totales.moneda === 'PYG';
  const isUsd = doc.totales.moneda === 'USD';
  const currencySymbol = isGuarani ? '₲' : isUsd ? 'US$' : '$';

  const formatMoney = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    if (isGuarani) {
      return Math.round(val).toLocaleString('es-PY');
    }
    return val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Cuando se pagina manualmente una factura larga, esta hoja muestra solo
  // un subconjunto de ítems (itemsOverride); el resto del documento
  // (encabezado, totales) sigue viniendo de `doc` completo.
  const displayItems = itemsOverride ?? doc.items;

  // Harmonize empty padding rows for symmetrical visual balance
  const itemCount = displayItems?.length || 0;
  const currentItemCount = itemCount;
  const desiredRows = targetItemRows !== undefined
    ? Math.max(currentItemCount, targetItemRows)
    : (!compact && currentItemCount < 3 ? 3 : currentItemCount);
  const emptyRowsCount = Math.max(0, desiredRows - currentItemCount);

  // Escala dinámica "a prueba de recorte": estimamos el alto natural del
  // documento compacto (misma fórmula base que usa DuoPrintSheet para
  // presupuestar el espacio) y, si no entra en el alto disponible
  // (maxHeightMm), lo achicamos con transform hasta que SÍ entre. Esto
  // reemplaza el umbral fijo anterior ("> 10 ítems"), que no consideraba
  // el espacio real disponible y — combinado con overflow:hidden ANTES del
  // scale — terminaba recortando (perdiendo) ítems en vez de mostrarlos
  // simplemente más chicos.
  const rowsForNaturalHeight = Math.max(desiredRows, 1);
  const estimatedNaturalHeightMm = 96 + rowsForNaturalHeight * 4.6;
  const fitScale =
    compact && maxHeightMm
      ? Math.min(1, maxHeightMm / estimatedNaturalHeightMm)
      : 1;
  // Piso de legibilidad: por debajo de esto el texto deja de ser útil.
  // Preferimos una factura chiquita pero completa a una recortada.
  const dynamicScale = compact ? Math.max(0.45, fitScale) : 1;

  return (
    <div
      id={id}
      className={`kude-printable-area bg-white text-slate-900 mx-auto transition-transform origin-top relative ${
        compact ? 'flex flex-col justify-start box-border' : ''
      }`}
      style={{
        width: '100%',
        maxWidth: '800px',
        // IMPORTANTE: en modo compacto usamos alto natural (auto), NUNCA
        // una altura/max-height fija con overflow:hidden. Antes el recorte
        // por overflow se aplicaba ANTES del transform:scale(), así que
        // aunque la factura se viera "más chica" igual perdía ítems por
        // debajo del borde. Ahora el contenedor crece a su alto real, se
        // achica completo con transform, y es el contenedor padre
        // (.duo-half, con su propio overflow:hidden) el que recorta
        // únicamente el espacio sobrante ya vacío — nunca contenido real.
        height: 'auto',
        minHeight: 'auto',
        maxHeight: 'none',
        padding: compact ? '2px 4px' : '18px 20px',
        fontSize: compact ? '7px' : '11px',
        lineHeight: compact ? 1.1 : 1.32,
        boxShadow: compact ? 'none' : '0 4px 20px -2px rgba(0, 0, 0, 0.08)',
        border: compact ? '1px solid #cbd5e1' : '1px solid #e2e8f0',
        boxSizing: 'border-box',
        overflow: 'visible',
        transform: compact && dynamicScale < 1 ? `scale(${dynamicScale})` : 'none',
        transformOrigin: 'top center',
      }}
    >
      {/* Etiqueta opcional de copia (Original / Duplicado) */}
      {copyTag && (
        <div className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-slate-400 bg-white text-slate-700 rounded-xs">
          {copyTag}
        </div>
      )}

      {/* 1. TOP HEADER GRID */}
      <div className={`grid grid-cols-12 gap-1.5 ${compact ? 'mb-0.5 pb-0.5' : 'mb-2 pb-2'} border-b-2 border-slate-900`}>
        {/* Left: Emisor Details */}
        <div className="col-span-6 pr-2 flex flex-col justify-start">
          <div className={`border-b border-slate-200 ${compact ? 'pb-0.5 mb-0.5' : 'pb-1.5 mb-1.5'}`}>
            <h1 className={`font-bold ${compact ? 'text-xs sm:text-[13px]' : 'text-base'} tracking-tight text-slate-950 uppercase leading-tight`}>
              {doc.emisor.nombreFantasia || doc.emisor.razonSocial}
            </h1>
            {doc.emisor.nombreFantasia && doc.emisor.razonSocial ? (
              <p className={`${compact ? 'text-[9px] line-clamp-1' : 'text-[11px]'} font-semibold text-slate-600 mt-0.5 tracking-normal`}>
                {doc.emisor.razonSocial}
              </p>
            ) : null}
          </div>

          <div className={`${compact ? 'space-y-0 text-[8px] sm:text-[8.5px]' : 'space-y-1 text-[10.5px]'} text-slate-700 leading-normal`}>
            {doc.emisor.actividadEconomica && (
              <p className="line-clamp-1">
                <span className="font-semibold text-slate-900">Actividad:</span>{' '}
                {doc.emisor.codigoActividad ? `[${doc.emisor.codigoActividad}] ` : ''}
                {doc.emisor.actividadEconomica}
              </p>
            )}
            <p className="line-clamp-1">
              <span className="font-semibold text-slate-900">Dirección:</span>{' '}
              {doc.emisor.direccion} {doc.emisor.numeroCasa ? `N° ${doc.emisor.numeroCasa}` : ''}
              {doc.emisor.ciudad ? ` - ${doc.emisor.ciudad}` : ''}
              {doc.emisor.departamento ? `, ${doc.emisor.departamento}` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[8px] sm:text-[8.5px]">
              {doc.emisor.telefono && (
                <p>
                  <span className="font-semibold text-slate-900">Tel:</span>{' '}
                  {doc.emisor.telefono}
                </p>
              )}
              {doc.emisor.email && (
                <p>
                  <span className="font-semibold text-slate-900">Email:</span>{' '}
                  {doc.emisor.email}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: SIFEN Timbrado & Document Box */}
        <div className="col-span-6">
          <div
            className={`border-2 border-slate-900 rounded-sm ${compact ? 'p-1' : 'p-3'} text-center ${
              ecoMode ? 'bg-white' : 'bg-slate-50'
            }`}
          >
            <p className={`font-mono font-black ${compact ? 'text-[11px]' : 'text-sm'} text-slate-950 tracking-wider`}>
              RUC: {doc.emisor.ruc}-{doc.emisor.dv}
            </p>

            <div
              className={`${compact ? 'my-0.5 py-0.5 px-1 text-[9px]' : 'my-1.5 py-1.5 px-2 text-xs sm:text-sm'} font-black uppercase tracking-wide rounded-xs ${
                ecoMode
                  ? 'bg-white text-slate-950 border-2 border-slate-900'
                  : 'bg-slate-900 text-white'
              }`}
            >
              {doc.tipoDocumentoNombre}
            </div>

            <div className={`grid grid-cols-2 ${compact ? 'text-[8px] sm:text-[8.5px] mt-0.5 gap-y-0' : 'text-[10.5px] mt-1.5 gap-y-1'} text-slate-800 text-left px-1`}>
              <div>
                <span className="font-extrabold text-slate-900">TIMBRADO N°:</span>
              </div>
              <div className={`font-mono font-black text-right text-slate-950 ${compact ? 'text-[9.5px]' : 'text-xs'}`}>
                {doc.timbradoNumero}
              </div>

              <div>
                <span className="font-semibold text-slate-700">Inicio Vigencia:</span>
              </div>
              <div className="text-right font-bold text-slate-900">
                {formatParaguayDate(doc.timbradoFechaInicio, false)}
              </div>
            </div>

            <div className={`${compact ? 'mt-0.5 pt-0.5 border-t' : 'mt-2 pt-1.5 border-t-2'} border-slate-900`}>
              <span className={`${compact ? 'text-[8px]' : 'text-[9px]'} text-slate-600 block uppercase font-bold tracking-wider`}>
                Número del Documento
              </span>
              <span className={`font-mono font-black ${compact ? 'text-xs sm:text-sm' : 'text-base sm:text-lg'} tracking-wider text-slate-950`}>
                N° {doc.numeroCompleto}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. RECEPTOR & TRANSACTION INFO */}
      <div className={`border border-slate-400 rounded-sm ${compact ? 'p-1 mb-0.5 text-[8px] sm:text-[8.5px]' : 'p-2 mb-2 text-[10.5px]'} bg-white`}>
        <div className="grid grid-cols-12 gap-x-3 gap-y-0.5">
          <div className="col-span-8">
            <span className="font-bold text-slate-900">Fecha y Hora de Emisión:</span>{' '}
            <span className="font-semibold text-slate-900">{formatParaguayDate(doc.fechaEmision, true)}</span>
          </div>
          <div className="col-span-4 text-right">
            <span className="font-bold text-slate-900">Condición de Venta:</span>{' '}
            <span
              className={`font-bold uppercase px-1 py-0.2 rounded text-[9px] ${
                ecoMode
                  ? 'border border-slate-400 bg-white text-slate-900'
                  : 'bg-slate-200 text-slate-900'
              }`}
            >
              {doc.condicionVenta}
            </span>
            {doc.condicionVentaDetalle && doc.condicionVenta === 'Crédito' && (
              <span className="text-[9px] text-slate-600 block">
                {doc.condicionVentaDetalle}
              </span>
            )}
          </div>

          <div className="col-span-8">
            <span className="font-bold text-slate-900">Nombre o Razón Social:</span>{' '}
            <span className="font-semibold text-slate-950 uppercase">
              {doc.receptor.razonSocial}
            </span>
          </div>
          <div className="col-span-4 text-right">
            <span className="font-bold text-slate-900">
              {doc.receptor.tipoDocumento || 'RUC'}:
            </span>{' '}
            <span className="font-mono font-bold text-slate-950">
              {doc.receptor.ruc}
              {doc.receptor.dv ? `-${doc.receptor.dv}` : ''}
            </span>
          </div>

          <div className="col-span-8">
            <span className="font-bold text-slate-900">Dirección:</span>{' '}
            <span className="text-slate-800">{doc.receptor.direccion || 'Sin especificar'}</span>
            {doc.receptor.ciudad ? `, ${doc.receptor.ciudad}` : ''}
          </div>
          <div className="col-span-4 text-right">
            <span className="font-bold text-slate-900">Moneda:</span>{' '}
            <span className="font-bold text-slate-900">
              {doc.totales.moneda} ({isGuarani ? 'Guaraníes' : 'Dólares'})
            </span>
            {doc.totales.tipoCambio && (
              <span className="text-[9px] text-slate-600 block">
                T/C: {doc.totales.tipoCambio.toLocaleString('es-PY')}
              </span>
            )}
          </div>

          {(doc.receptor.telefono || doc.receptor.email) && (
            <div className="col-span-12 flex gap-3 text-slate-600 text-[9px] pt-0.5 border-t border-slate-200">
              {doc.receptor.telefono && (
                <div>
                  <span className="font-semibold text-slate-800">Teléfono:</span>{' '}
                  {doc.receptor.telefono}
                </div>
              )}
              {doc.receptor.email && (
                <div>
                  <span className="font-semibold text-slate-800">Email:</span>{' '}
                  {doc.receptor.email}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. ITEMS TABLE */}
      <div className={`border border-slate-900 rounded-xs overflow-hidden ${compact ? 'mb-0.5' : 'mb-2'}`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr
              className={`${compact ? 'text-[7.5px] sm:text-[8px]' : 'text-[9.5px]'} font-bold uppercase tracking-wider ${
                ecoMode
                  ? 'bg-white text-slate-950 border-b-2 border-slate-900'
                  : 'bg-slate-900 text-white'
              }`}
            >
              <th className={`${compact ? 'py-0.2 px-0.5 w-10' : 'py-1.5 px-1.5 w-14'} ${ecoMode ? 'border-r border-slate-300' : 'border-r border-slate-700'}`}>Cód.</th>
              <th className={`${compact ? 'py-0.2 px-0.5 w-7' : 'py-1.5 px-1 w-10'} text-center ${ecoMode ? 'border-r border-slate-300' : 'border-r border-slate-700'}`}>Cant.</th>
              <th className={`${compact ? 'py-0.2 px-0.5 w-7' : 'py-1.5 px-1 w-9'} text-center ${ecoMode ? 'border-r border-slate-300' : 'border-r border-slate-700'}`}>U.M.</th>
              <th className={`${compact ? 'py-0.2 px-1' : 'py-1.5 px-2'} ${ecoMode ? 'border-r border-slate-300' : 'border-r border-slate-700'}`}>Descripción del Producto / Servicio</th>
              <th className={`${compact ? 'py-0.2 px-0.5 w-14' : 'py-1.5 px-1.5 w-20'} text-right ${ecoMode ? 'border-r border-slate-300' : 'border-r border-slate-700'}`}>P. Unitario</th>
              <th className={`${compact ? 'py-0.2 px-0.5 w-10' : 'py-1.5 px-1 w-16'} text-right ${ecoMode ? 'border-r border-slate-300' : 'border-r border-slate-700'}`}>Descuento</th>
              <th
                colSpan={3}
                className={`${compact ? 'py-0.2 px-0.5' : 'py-1 px-1'} text-center ${
                  ecoMode
                    ? 'border-b border-slate-300 bg-white text-slate-950'
                    : 'border-b border-slate-700 bg-slate-800 text-white'
                }`}
              >
                Valor de Ventas
              </th>
            </tr>
            <tr
              className={`${compact ? 'text-[7px] sm:text-[7.5px]' : 'text-[9px]'} font-bold uppercase text-center border-t ${
                ecoMode
                  ? 'bg-white text-slate-900 border-slate-300'
                  : 'bg-slate-800 text-white border-slate-700'
              }`}
            >
              <th colSpan={6} className="p-0"></th>
              <th className={`${compact ? 'py-0.2 px-0.5 w-12' : 'py-1 px-1 w-18'} text-right ${ecoMode ? 'border-r border-slate-300' : 'border-r border-slate-700'}`}>Exentas</th>
              <th className={`${compact ? 'py-0.2 px-0.5 w-12' : 'py-1 px-1 w-18'} text-right ${ecoMode ? 'border-r border-slate-300' : 'border-r border-slate-700'}`}>5%</th>
              <th className={`${compact ? 'py-0.2 px-0.5 w-14' : 'py-1 px-1 w-20'} text-right`}>10%</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-300 ${compact ? 'text-[8px] sm:text-[8.5px]' : 'text-[10px]'}`}>
            {displayItems.map((item, idx) => (
              <tr
                key={item.id || idx}
                className={ecoMode ? 'bg-white' : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}
              >
                <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1.5'} font-mono text-slate-700 border-r border-slate-300`}>
                  {item.codigo}
                </td>
                <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} font-semibold text-center text-slate-950 border-r border-slate-300`}>
                  {item.cantidad}
                </td>
                <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-center text-slate-600 border-r border-slate-300`}>
                  {item.unidadMedida}
                </td>
                <td className={`${compact ? 'py-0.2 px-1' : 'py-1.5 px-2'} text-slate-900 border-r border-slate-300`}>
                  <span className="font-medium">{item.descripcion}</span>
                </td>
                <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1.5'} text-right font-mono text-slate-800 border-r border-slate-300 whitespace-nowrap`}>
                  {formatMoney(item.precioUnitario)}
                </td>
                <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-right font-mono text-slate-600 border-r border-slate-300 whitespace-nowrap`}>
                  {item.descuento > 0 ? formatMoney(item.descuento) : '0'}
                </td>
                <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-right font-mono text-slate-800 border-r border-slate-300 whitespace-nowrap`}>
                  {item.valorExento > 0 ? formatMoney(item.valorExento) : '0'}
                </td>
                <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-right font-mono text-slate-800 border-r border-slate-300 whitespace-nowrap`}>
                  {item.valorIva5 > 0 ? formatMoney(item.valorIva5) : '0'}
                </td>
                <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-right font-mono font-semibold text-slate-950 whitespace-nowrap`}>
                  {item.valorIva10 > 0 ? formatMoney(item.valorIva10) : '0'}
                </td>
              </tr>
            ))}

            {/* Symmetrical padding rows to equalize heights and visual balance */}
            {emptyRowsCount > 0 &&
              Array.from({ length: emptyRowsCount }).map((_, i) => (
                <tr key={`pad-${i}`} className={compact ? 'h-4 bg-white' : 'h-6 bg-white'}>
                  <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1.5'} font-mono text-slate-300 border-r border-slate-300 text-center select-none`}>-</td>
                  <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-center text-slate-300 border-r border-slate-300 select-none`}>-</td>
                  <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-center text-slate-300 border-r border-slate-300 select-none`}>-</td>
                  <td className={`${compact ? 'py-0.2 px-1' : 'py-1.5 px-2'} text-slate-300 border-r border-slate-300 select-none`}>&nbsp;</td>
                  <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1.5'} text-right text-slate-300 border-r border-slate-300 select-none`}>-</td>
                  <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-right text-slate-300 border-r border-slate-300 select-none`}>-</td>
                  <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-right text-slate-300 border-r border-slate-300 select-none`}>-</td>
                  <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-right text-slate-300 border-r border-slate-300 select-none`}>-</td>
                  <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-right text-slate-300 select-none`}>-</td>
                </tr>
              ))}
          </tbody>

          {/* Subtotals Footer: solo en la última hoja (los montos son del
              total de la factura, no de los ítems visibles en esta hoja) */}
          {showFooter && (
            <tfoot>
              <tr
                className={`border-t-2 border-slate-900 font-bold ${compact ? 'text-[8px] sm:text-[8.5px]' : 'text-[10px]'} ${
                  ecoMode ? 'bg-white' : 'bg-slate-100'
                }`}
              >
                <td colSpan={6} className={`${compact ? 'py-0.2 px-1' : 'py-1.5 px-2'} text-right uppercase border-r border-slate-300`}>
                  Subtotales:
                </td>
                <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-right font-mono border-r border-slate-300 whitespace-nowrap`}>
                  {formatMoney(doc.totales.subtotalExento)}
                </td>
                <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-right font-mono border-r border-slate-300 whitespace-nowrap`}>
                  {formatMoney(doc.totales.subtotal5)}
                </td>
                <td className={`${compact ? 'py-0.2 px-0.5' : 'py-1.5 px-1'} text-right font-mono whitespace-nowrap`}>
                  {formatMoney(doc.totales.subtotal10)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Aviso de continuación: solo en hojas que NO son la última */}
      {!showFooter && (
        <div className={`text-center italic text-slate-500 ${compact ? 'text-[7px] mt-0.5' : 'text-[9px] mt-1'}`}>
          {pageLabel ? `${pageLabel} — Continúa en la página siguiente…` : 'Continúa en la página siguiente…'}
        </div>
      )}

      {showFooter && (
      <>
      {/* 5. TOTALES Y TOTAL A PAGAR */}
      <div className={`border border-slate-400 rounded-sm ${compact ? 'mb-0.5' : 'mb-2'} overflow-hidden`}>
        {/* Fila Principal: Letras y Total a Pagar */}
        <div className="grid grid-cols-12 bg-white">
          <div className={`col-span-8 ${compact ? 'p-1' : 'p-2'} border-r border-slate-400 flex flex-col justify-center`}>
            <span className={`${compact ? 'text-[7.5px]' : 'text-[9.5px]'} font-bold uppercase text-slate-500 block mb-0.2`}>
              Valor Total en Letras ({doc.totales.moneda}):
            </span>
            <p className={`font-bold ${compact ? 'text-[8.5px] line-clamp-2' : 'text-[10.5px]'} text-slate-900 leading-snug`}>
              {doc.totales.totalPagarLetras || 'CERO'}
            </p>
          </div>
          <div
            className={`col-span-4 ${compact ? 'p-1' : 'p-2'} flex flex-col justify-center text-right ${
              ecoMode
                ? 'bg-white text-slate-950 border-l-2 border-slate-900'
                : 'bg-slate-900 text-white'
            }`}
          >
            <span
              className={`${compact ? 'text-[7.5px]' : 'text-[9.5px]'} font-bold uppercase tracking-wide ${
                ecoMode ? 'text-slate-600' : 'text-slate-300'
              }`}
            >
              Total a Pagar
            </span>
            <span
              className={`font-mono font-black ${compact ? 'text-xs sm:text-sm' : 'text-base sm:text-lg'} tracking-tight ${
                ecoMode ? 'text-slate-950' : 'text-white'
              }`}
            >
              {currencySymbol} {formatMoney(doc.totales.totalPagar)}
            </span>
            {isUsd && (
              <span
                className={`${compact ? 'text-[7px]' : 'text-[8.5px]'} font-mono font-bold ${
                  ecoMode ? 'text-slate-700' : 'text-slate-200'
                } block mt-0.2`}
              >
                Equiv. DNIT:{' '}
                {(
                  doc.totales.totalGuaraniesEquivalente ||
                  Math.round(doc.totales.totalPagar * (doc.totales.tipoCambio || 1))
                ).toLocaleString('es-PY')}{' '}
                ₲
              </span>
            )}
          </div>
        </div>

        {/* Fila de Redondeo DNIT y Resumen Operativo */}
        <div
          className={`border-t border-slate-300 ${compact ? 'p-0.5 text-[7.5px]' : 'p-1.5 text-[9.5px]'} ${
            ecoMode ? 'bg-white' : 'bg-slate-50'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-1 text-slate-700">
            <div className="flex items-center gap-2.5 font-mono">
              <div>
                <span className="font-sans text-slate-500 mr-1">Total Operación:</span>
                <span className="font-semibold text-slate-900">
                  {currencySymbol} {formatMoney(doc.totales.totalOperacion)}
                </span>
              </div>

              <div>
                <span className="font-sans text-slate-500 mr-1">Redondeo (dRedon DNIT):</span>
                <span className="font-bold text-slate-900">
                  {isUsd
                    ? 'US$ 0.00'
                    : `${(doc.totales.redondeo || 0) > 0 ? '+' : ''}${formatMoney(doc.totales.redondeo || 0)} ₲`}
                </span>
              </div>

              {isUsd && doc.totales.tipoCambio && (
                <div>
                  <span className="font-sans text-slate-500 mr-1">T.C. Oficial (dTiCam):</span>
                  <span className="font-semibold text-slate-900">
                    1 USD = {doc.totales.tipoCambio.toLocaleString('es-PY')} ₲
                  </span>
                </div>
              )}
            </div>

            {/* Aclaración según normativa DNIT */}
            <div className="text-[7px] sm:text-[7.5px] italic text-slate-600">
              {isUsd ? (
                <span className="text-amber-800 font-medium">
                  * Aclaración DNIT: El redondeo tributario (Ley 4017/10) NO aplica en USD; se liquidan centavos exactos.
                </span>
              ) : (
                <span>{doc.totales.redondeoAclaracion || 'Ajuste de redondeo según Ley N° 4017/10 DNIT.'}</span>
              )}
            </div>
          </div>
        </div>

        {/* Liquidación del IVA */}
        <div
          className={`border-t border-slate-300 ${compact ? 'p-0.5 text-[8px]' : 'p-2 text-[10px]'} ${
            ecoMode ? 'bg-white' : 'bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <span className="font-bold uppercase text-slate-700 tracking-wider">
              Liquidación del IVA:
            </span>
            <div className="flex items-center gap-2.5 font-mono">
              <div>
                <span className="text-slate-600 mr-1 font-sans">IVA (5%):</span>
                <span className="font-bold text-slate-950">
                  {formatMoney(doc.totales.totalIva5)}
                </span>
              </div>
              <div>
                <span className="text-slate-600 mr-1 font-sans">IVA (10%):</span>
                <span className="font-bold text-slate-950">
                  {formatMoney(doc.totales.totalIva10)}
                </span>
              </div>
              <div className="pl-2 border-l border-slate-300">
                <span className="text-slate-700 mr-1 font-sans font-bold">Total IVA:</span>
                <span className="font-black text-slate-950">
                  {currencySymbol} {formatMoney(doc.totales.totalIva)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. BOTTOM LEGAL / SIFEN QR CODE SECTION */}
      <div
        className={`border border-slate-400 rounded-sm ${compact ? 'p-1' : 'p-2'} ${
          ecoMode ? 'bg-white' : 'bg-slate-50/70'
        }`}
      >
        <div className="flex items-center gap-2">
          {/* QR Code */}
          <div className="shrink-0 bg-white p-0.5 rounded border border-slate-300 shadow-2xs">
            <KudeQrCode url={doc.qrUrl} size={compact ? 48 : 105} />
          </div>

          {/* Legal Texts & QR Verification Link */}
          <div className={`flex-1 space-y-0.2 ${compact ? 'text-[7.5px]' : 'text-[9.5px]'} text-slate-700 leading-tight`}>
            <div className="flex items-center gap-1 font-bold text-slate-900 uppercase">
              <FileText className="w-2.5 h-2.5 text-slate-700 shrink-0" />
              <span>Representación Gráfica de Documento Tributario Electrónico</span>
            </div>

            {/* CDC (Código Digital de Control) */}
            <div className={`${compact ? 'my-0.2 p-0.5' : 'my-1 p-1.5'} bg-white border border-slate-300 rounded-sm`}>
              <div className="flex items-center justify-between gap-1 mb-0.2">
                <div className="flex items-center gap-1 text-[7px] sm:text-[7.5px] font-bold uppercase tracking-wider text-slate-700">
                  <ShieldCheck className="w-2 h-2 text-emerald-700 shrink-0" />
                  <span>Código Digital de Control (CDC - 44 dígitos)</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCdc}
                  className="no-print inline-flex items-center gap-0.5 px-1 py-0.2 text-[7.5px] font-medium text-slate-700 bg-slate-50 hover:bg-slate-200 border border-slate-300 rounded shadow-2xs transition-colors"
                  title="Copiar número CDC"
                >
                  {copiedCdc ? (
                    <>
                      <Check className="w-2 h-2 text-emerald-600" />
                      <span className="text-emerald-700 font-semibold">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-2 h-2" />
                      <span>Copiar CDC</span>
                    </>
                  )}
                </button>
              </div>

              <div
                className={`font-mono text-center font-bold ${compact ? 'text-[8px] py-0.2 tracking-tight' : 'text-[10px] py-1 tracking-wider'} text-slate-950 select-all rounded border ${
                  ecoMode ? 'bg-white border-slate-300' : 'bg-slate-50 border-slate-200'
                }`}
              >
                {doc.cdcFormatted || doc.cdc || '0000 0000 0000 0000 0000 0000 0000 0000 0000 0000'}
              </div>
            </div>

            <p className="line-clamp-1">
              Consulte validez con el CDC en:{' '}
              <a
                href={doc.qrUrl || 'https://ekuatia.set.gov.py/consultas'}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-700 hover:underline inline-flex items-center gap-0.5"
              >
                https://ekuatia.set.gov.py/consultas
                <ExternalLink className="w-2 h-2 inline no-print" />
              </a>
            </p>

            <div className="flex flex-wrap items-center justify-between gap-x-2 text-[7px] text-slate-500">
              <span>SIFEN • Validez tributaria certificada por la DNIT</span>
              {doc.fechaFirmaDigital && (
                <span className="font-mono">
                  Firma: {formatParaguayDate(doc.fechaFirmaDigital, true)}
                </span>
              )}
            </div>

            {compact ? (
              <div className="pt-0.2 border-t border-slate-200 text-slate-600 text-[7px] flex items-center justify-between min-h-[12px]">
                <span className="line-clamp-1">
                  {doc.observaciones
                    ? `Obs: ${doc.observaciones}`
                    : 'Documento emitido conforme al Sistema Integrado de Facturación Electrónica Nacional (SIFEN).'}
                </span>
              </div>
            ) : (
              doc.observaciones && (
                <div className="pt-0.2 border-t border-slate-200 text-slate-600 line-clamp-1">
                  <span className="font-semibold text-slate-800">Obs:</span>{' '}
                  {doc.observaciones}
                </div>
              )
            )}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
