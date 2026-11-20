import React from 'react';
import { DuoPrintPage, SingleSheetLayout } from '../utils/batchPacking';
import { KudeDocument } from './KudeDocument';
import { PaperSizeType, PAPER_SIZES } from '../types/paper';
import { Scissors, Copy, FileText, Split, ArrowUpDown } from 'lucide-react';

interface DuoPrintSheetProps {
  page: DuoPrintPage;
  ecoMode?: boolean;
  paperSize?: PaperSizeType;
  onSingleLayoutChange?: (pageId: string, layout: SingleSheetLayout) => void;
  onSplitPage?: (pageId: string) => void;
  onSwapPositions?: (pageId: string) => void;
}

/**
 * Calculates dynamic vertical metrics and remaining space distribution
 * for dual-invoice sheets based on paper format (A4, Oficio, Folio) and item density.
 */
function calculateDuoMetrics(paperSize: PaperSizeType, targetItemRows: number) {
  const config = PAPER_SIZES[paperSize] || PAPER_SIZES.oficio;
  const totalHeightMm = config.heightMm;
  const totalWidthMm = config.widthMm;

  // Printable margin: 2mm top + 2mm bottom for maximum safety on Oficio
  const pageMarginYMm = 2;
  // Colchón de seguridad adicional: los navegadores/impresoras no
  // renderizan mm de forma perfectamente exacta (variación de DPI,
  // redondeo interno, drivers de impresora). En vez de depender de que el
  // usuario ponga manualmente "Escala 98%" al imprimir, restamos ese
  // margen de antemano acá.
  const RENDER_SAFETY_FACTOR = 0.97;
  const printableHeightMm = (totalHeightMm - pageMarginYMm * 2) * RENDER_SAFETY_FACTOR;

  const dynamicPaddingYMm = Math.max(1, Math.min(3, printableHeightMm * 0.008));
  const dynamicGapMm = Math.max(2, Math.min(5, printableHeightMm * 0.012));
  const dividerHeightMm = 1.5;

  const reservedMm = dynamicPaddingYMm * 2 + dynamicGapMm * 2 + dividerHeightMm;
  const halfHeightMm = Math.max(20, (printableHeightMm - reservedMm) / 2);

  // Approximate height of compact KuDE invoice:
  // Base fixed elements (~96mm) + table rows (~4.6mm each), nunca más que
  // la mitad real disponible (antes el cap era un valor fijo de 138mm que
  // no se ajustaba a hojas más chicas ni dejaba margen de seguridad).
  const estimatedInvoiceHeightMm = Math.min(halfHeightMm, 96 + Math.max(targetItemRows, 1) * 4.6);

  // Remaining space inside each half, una vez descontada la factura estimada
  const remainingHalfMm = Math.max(2, halfHeightMm - estimatedInvoiceHeightMm);

  return {
    totalHeightMm,
    totalWidthMm,
    printableHeightMm,
    halfHeightMm,
    estimatedInvoiceHeightMm,
    remainingHalfMm,
    reservedMm: Number(reservedMm.toFixed(2)),
    dynamicPaddingYMm: Number(dynamicPaddingYMm.toFixed(2)),
    dynamicGapMm: Number(dynamicGapMm.toFixed(2)),
    aspectRatio: `${totalWidthMm} / ${totalHeightMm}`,
  };
}

/**
 * Pagina manualmente los ítems de una factura larga en modo "hoja
 * completa" en vez de dejar que el navegador decida los saltos de página
 * por su cuenta. Antes, el bloque de totales/QR (que no se puede partir a
 * la mitad) a veces no entraba en el resto de una página y saltaba ENTERO
 * a una hoja nueva, dejándola casi en blanco. Acá se calcula de antemano
 * cuántos ítems entran por hoja, dejando el pie (totales/QR) únicamente en
 * la última página, que se dimensiona con margen de sobra para que entre
 * siempre junto con sus ítems.
 */
function paginateFullInvoiceItems(
  totalItems: number,
  paperSize: PaperSizeType
): number[] {
  const config = PAPER_SIZES[paperSize] || PAPER_SIZES.oficio;
  const printableHeightMm = config.heightMm - 6; // ~3mm margen arriba/abajo
  // Estimación conservadora (modo "hoja completa", fuente más grande que el
  // modo compacto de las hojas dúo): overhead fijo de encabezado+receptor
  // antes de la tabla, alto por fila de ítem, y overhead del pie
  // (subtotales + total en letras + liquidación IVA + bloque QR/legal).
  const HEADER_OVERHEAD_MM = 62;
  const ROW_HEIGHT_MM = 6.3;
  const FOOTER_OVERHEAD_MM = 58;
  const SAFETY = 0.95; // colchón extra, igual que en las hojas dúo

  const usable = printableHeightMm * SAFETY;
  const rowsFullPage = Math.max(3, Math.floor((usable - HEADER_OVERHEAD_MM) / ROW_HEIGHT_MM));
  const rowsLastPage = Math.max(2, Math.floor((usable - HEADER_OVERHEAD_MM - FOOTER_OVERHEAD_MM) / ROW_HEIGHT_MM));

  if (totalItems <= rowsLastPage) {
    return [totalItems];
  }

  const pages: number[] = [];
  let remaining = totalItems;
  while (remaining > rowsLastPage) {
    pages.push(rowsFullPage);
    remaining -= rowsFullPage;
  }
  pages.push(remaining);
  return pages;
}

export const DuoPrintSheet: React.FC<DuoPrintSheetProps> = ({
  page,
  ecoMode = true,
  paperSize = 'a4',
  onSingleLayoutChange,
  onSplitPage,
  onSwapPositions,
}) => {
  const paperConfig = PAPER_SIZES[paperSize] || PAPER_SIZES.a4;

  // CASO 1: HOJA DÚO (2 Facturas distintas por hoja)
  if (page.type === 'duo' && page.docBottom) {
    const topItemCount = page.docTop?.items?.length || 0;
    const bottomItemCount = page.docBottom?.items?.length || 0;
    // Harmonize table rows so both invoices have the EXACT same height and vertical rhythm
    const targetItemRows = Math.max(topItemCount, bottomItemCount, 3);
    const metrics = calculateDuoMetrics(paperSize, targetItemRows);

    return (
      <div className="relative group/sheet">
        {/* Controles de Hoja Dúo (No-Print) */}
        {(onSplitPage || onSwapPositions) && (
          <div className="no-print mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 bg-slate-800 text-white rounded text-[10px] font-mono">
                HOJA {page.pageIndex}
              </span>
              <span>Dúo: {page.docTop.numeroCompleto} + {page.docBottom.numeroCompleto}</span>
              {page.fitnessScore !== undefined && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 border border-emerald-200 dark:border-emerald-800 rounded">
                  Afinidad: {page.fitnessScore} pts
                </span>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              {onSwapPositions && (
                <button
                  type="button"
                  onClick={() => onSwapPositions(page.id)}
                  className="px-2 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition-colors shadow-2xs"
                  title="Intercambiar orden: factura superior pasa abajo y viceversa"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span>Invertir (Arriba ⇄ Abajo)</span>
                </button>
              )}
              {onSplitPage && (
                <button
                  type="button"
                  onClick={() => onSplitPage(page.id)}
                  className="px-2 py-1 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 rounded border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition-colors shadow-2xs"
                  title="Desacoplar en 2 hojas separadas individuales"
                >
                  <Split className="w-3 h-3" />
                  <span>Separar en 2 hojas</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div
          id={page.id}
          className="duo-print-sheet bg-white border border-slate-300 dark:border-slate-700 shadow-xs mx-auto my-3 print:my-0 print:border-none print:shadow-none transition-all flex flex-col justify-between overflow-hidden"
          style={{
            width: '100%',
            maxWidth: '800px',
            boxSizing: 'border-box',
            overflow: 'hidden',
            pageBreakAfter: 'always',
            breakAfter: 'page',
            pageBreakInside: 'avoid',
            breakInside: 'avoid',
            aspectRatio: metrics.aspectRatio,
            minHeight: `calc(800px * (${metrics.totalHeightMm} / ${metrics.totalWidthMm}))`,
            paddingTop: `${metrics.dynamicPaddingYMm}mm`,
            paddingBottom: `${metrics.dynamicPaddingYMm}mm`,
            paddingLeft: '4px',
            paddingRight: '4px',
            gap: `${metrics.dynamicGapMm}mm`,
            // Dynamic CSS custom properties for print & pdf styling
            ['--duo-paper-height' as string]: `${metrics.totalHeightMm}mm`,
            ['--duo-paper-width' as string]: `${metrics.totalWidthMm}mm`,
            ['--duo-printable-height' as string]: `${metrics.printableHeightMm}mm`,
            ['--duo-half-height' as string]: `${metrics.halfHeightMm}mm`,
            ['--duo-dynamic-gap' as string]: `${metrics.dynamicGapMm}mm`,
            ['--duo-dynamic-padding-y' as string]: `${metrics.dynamicPaddingYMm}mm`,
            ['--duo-aspect-ratio' as string]: metrics.aspectRatio,
          }}
          data-papersize={paperConfig.id}
          data-rows={targetItemRows}
          data-remaining-half={`${metrics.remainingHalfMm.toFixed(1)}mm`}
        >
          {/* Factura Superior: Centrada verticalmente de forma simétrica en el primer 50% de la hoja */}
          <div
            className="duo-half duo-half-top duo-half--content flex-1 flex flex-col justify-start items-stretch min-h-0 overflow-hidden"
            style={{
              maxHeight: `${metrics.halfHeightMm}mm`,
              overflow: 'hidden',
            }}
          >
            <KudeDocument
              id={`${page.id}-top`}
              document={page.docTop}
              ecoMode={ecoMode}
              compact={true}
              targetItemRows={targetItemRows}
              maxHeightMm={metrics.halfHeightMm}
              copyTag={page.copyTags?.top}
            />
          </div>

          {/* Línea de corte central simétrica al 50% exacto de la página */}
          <div
            className="duo-cut-divider select-none relative flex items-center justify-center shrink-0 w-full"
            style={{
              margin: '0',
            }}
          >
            <div className="w-full border-t border-dashed border-slate-300 dark:border-slate-600 print:border-slate-400" />
          </div>

          {/* Factura Inferior: Centrada verticalmente de forma simétrica en el segundo 50% de la hoja */}
          <div
            className="duo-half duo-half-bottom duo-half--content flex-1 flex flex-col justify-start items-stretch min-h-0 overflow-hidden"
            style={{
              maxHeight: `${metrics.halfHeightMm}mm`,
              overflow: 'hidden',
            }}
          >
            <KudeDocument
              id={`${page.id}-bottom`}
              document={page.docBottom}
              ecoMode={ecoMode}
              compact={true}
              targetItemRows={targetItemRows}
              maxHeightMm={metrics.halfHeightMm}
              copyTag={page.copyTags?.bottom}
            />
          </div>
        </div>
      </div>
    );
  }

  // CASO 2: HOJA INDIVIDUAL (Factura huérfana, larga, o separada)
  const singleLayout = page.singleLayout || 'half-top';
  const topItemCount = page.docTop?.items?.length || 0;
  const targetItemRows = Math.max(topItemCount, 3);
  const metrics = calculateDuoMetrics(paperSize, targetItemRows);

  return (
    <div className="relative group/sheet">
      {/* Controles de Disposición de Hoja Individual (No-Print) */}
      <div className="no-print mb-2 flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1 gap-2">
        <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 bg-slate-800 text-white rounded text-[10px] font-mono">
            HOJA {page.pageIndex}
          </span>
          <span>Factura individual: {page.docTop.numeroCompleto}</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
            ({page.docTop.items.length} {page.docTop.items.length === 1 ? 'ítem' : 'ítems'})
          </span>
        </span>

        {onSingleLayoutChange && (
          <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mr-1 hidden sm:inline">
              Disposición:
            </span>
            <button
              type="button"
              onClick={() => onSingleLayoutChange(page.id, 'half-top')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                singleLayout === 'half-top'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              title="Media Hoja Superior: ocupa el 50% superior simétrico, dejando la mitad inferior libre para corte"
            >
              <Scissors className="w-3 h-3" />
              <span>Media Hoja (50%)</span>
            </button>
            <button
              type="button"
              onClick={() => onSingleLayoutChange(page.id, 'duplicate')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                singleLayout === 'duplicate'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              title="Duplicado Automático: Original arriba y Duplicado abajo para aprovechar el 100% de la hoja"
            >
              <Copy className="w-3 h-3" />
              <span>Original + Copia</span>
            </button>
            <button
              type="button"
              onClick={() => onSingleLayoutChange(page.id, 'full')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                singleLayout === 'full'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              title="Hoja Completa Estándar: formato KuDE tradicional centrado en toda la página"
            >
              <FileText className="w-3 h-3" />
              <span>Hoja Completa</span>
            </button>
          </div>
        )}
      </div>

      {/* RENDERIZADO SEGÚN LA DISPOSICIÓN ELEGIDA */}
      {singleLayout === 'half-top' && (
        <div
          id={page.id}
          className="duo-print-sheet bg-white border border-slate-300 dark:border-slate-700 shadow-xs mx-auto my-3 print:my-0 print:border-none print:shadow-none transition-all flex flex-col justify-between overflow-hidden"
          style={{
            width: '100%',
            maxWidth: '800px',
            boxSizing: 'border-box',
            overflow: 'hidden',
            pageBreakAfter: 'always',
            breakAfter: 'page',
            pageBreakInside: 'avoid',
            breakInside: 'avoid',
            aspectRatio: metrics.aspectRatio,
            minHeight: `calc(800px * (${metrics.totalHeightMm} / ${metrics.totalWidthMm}))`,
            paddingTop: `${metrics.dynamicPaddingYMm}mm`,
            paddingBottom: `${metrics.dynamicPaddingYMm}mm`,
            paddingLeft: '4px',
            paddingRight: '4px',
            gap: `${metrics.dynamicGapMm}mm`,
            ['--duo-paper-height' as string]: `${metrics.totalHeightMm}mm`,
            ['--duo-paper-width' as string]: `${metrics.totalWidthMm}mm`,
            ['--duo-printable-height' as string]: `${metrics.printableHeightMm}mm`,
            ['--duo-half-height' as string]: `${metrics.halfHeightMm}mm`,
            ['--duo-dynamic-gap' as string]: `${metrics.dynamicGapMm}mm`,
            ['--duo-dynamic-padding-y' as string]: `${metrics.dynamicPaddingYMm}mm`,
            ['--duo-aspect-ratio' as string]: metrics.aspectRatio,
          }}
          data-papersize={paperConfig.id}
        >
          {/* Factura Superior (50% de la hoja) */}
          <div
            className="duo-half duo-half-top duo-half--content flex-1 flex flex-col justify-start items-stretch min-h-0 overflow-hidden"
            style={{
              maxHeight: `${metrics.halfHeightMm}mm`,
              overflow: 'hidden',
            }}
          >
            <KudeDocument
              id={`${page.id}-top`}
              document={page.docTop}
              ecoMode={ecoMode}
              compact={true}
              targetItemRows={targetItemRows}
              maxHeightMm={metrics.halfHeightMm}
            />
          </div>

          {/* Línea de corte central para guillotina */}
          <div
            className="duo-cut-divider select-none relative flex items-center justify-center shrink-0 w-full"
            style={{
              margin: '0',
            }}
          >
            <div className="w-full border-t border-dashed border-slate-300 dark:border-slate-600 print:border-slate-400" />
          </div>

          {/* Mitad Inferior en Blanco */}
          <div
            className="duo-half duo-half-bottom flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden"
            style={{
              maxHeight: `${metrics.halfHeightMm}mm`,
              overflow: 'hidden',
            }}
          />
        </div>
      )}

      {singleLayout === 'duplicate' && (
        <div
          id={page.id}
          className="duo-print-sheet bg-white border border-slate-300 dark:border-slate-700 shadow-xs mx-auto my-3 print:my-0 print:border-none print:shadow-none transition-all flex flex-col justify-between overflow-hidden"
          style={{
            width: '100%',
            maxWidth: '800px',
            boxSizing: 'border-box',
            overflow: 'hidden',
            pageBreakAfter: 'always',
            breakAfter: 'page',
            pageBreakInside: 'avoid',
            breakInside: 'avoid',
            aspectRatio: metrics.aspectRatio,
            minHeight: `calc(800px * (${metrics.totalHeightMm} / ${metrics.totalWidthMm}))`,
            paddingTop: `${metrics.dynamicPaddingYMm}mm`,
            paddingBottom: `${metrics.dynamicPaddingYMm}mm`,
            paddingLeft: '4px',
            paddingRight: '4px',
            gap: `${metrics.dynamicGapMm}mm`,
            ['--duo-paper-height' as string]: `${metrics.totalHeightMm}mm`,
            ['--duo-paper-width' as string]: `${metrics.totalWidthMm}mm`,
            ['--duo-printable-height' as string]: `${metrics.printableHeightMm}mm`,
            ['--duo-half-height' as string]: `${metrics.halfHeightMm}mm`,
            ['--duo-dynamic-gap' as string]: `${metrics.dynamicGapMm}mm`,
            ['--duo-dynamic-padding-y' as string]: `${metrics.dynamicPaddingYMm}mm`,
            ['--duo-aspect-ratio' as string]: metrics.aspectRatio,
          }}
          data-papersize={paperConfig.id}
        >
          {/* Factura Superior: ORIGINAL */}
          <div
            className="duo-half duo-half-top duo-half--content flex-1 flex flex-col justify-start items-stretch min-h-0 overflow-hidden"
            style={{
              maxHeight: `${metrics.halfHeightMm}mm`,
              overflow: 'hidden',
            }}
          >
            <KudeDocument
              id={`${page.id}-top`}
              document={page.docTop}
              ecoMode={ecoMode}
              compact={true}
              targetItemRows={targetItemRows}
              maxHeightMm={metrics.halfHeightMm}
              copyTag="ORIGINAL"
            />
          </div>

          {/* Línea de corte central */}
          <div
            className="duo-cut-divider select-none relative flex items-center justify-center shrink-0 w-full"
            style={{
              margin: '0',
            }}
          >
            <div className="w-full border-t border-dashed border-slate-300 dark:border-slate-600 print:border-slate-400" />
          </div>

          {/* Factura Inferior: DUPLICADO */}
          <div
            className="duo-half duo-half-bottom duo-half--content flex-1 flex flex-col justify-start items-stretch min-h-0 overflow-hidden"
            style={{
              maxHeight: `${metrics.halfHeightMm}mm`,
              overflow: 'hidden',
            }}
          >
            <KudeDocument
              id={`${page.id}-bottom`}
              document={page.docTop}
              ecoMode={ecoMode}
              compact={true}
              targetItemRows={targetItemRows}
              maxHeightMm={metrics.halfHeightMm}
              copyTag="DUPLICADO"
            />
          </div>
        </div>
      )}

      {singleLayout === 'full' && (() => {
        const items = page.docTop.items || [];
        const pageSizes = paginateFullInvoiceItems(items.length, paperSize);
        let offset = 0;
        const chunks = pageSizes.map((size) => {
          const chunk = items.slice(offset, offset + size);
          offset += size;
          return chunk;
        });

        return chunks.map((chunkItems, idx) => {
          const isLast = idx === chunks.length - 1;
          return (
            <div
              key={`${page.id}-full-${idx}`}
              id={idx === 0 ? page.id : `${page.id}-full-${idx}`}
              className="single-print-sheet bg-white border border-slate-300 dark:border-slate-700 shadow-xs mx-auto my-3 print:my-0 print:border-none print:shadow-none transition-all flex flex-col justify-start"
              style={{
                width: '100%',
                maxWidth: '800px',
                boxSizing: 'border-box',
                pageBreakAfter: 'always',
                breakAfter: 'page',
                // Sin aspectRatio ni overflow:hidden ni breakInside:'avoid'
                // acá: cada hoja ya trae exactamente los ítems que le
                // corresponden (ver paginateFullInvoiceItems), así que no
                // debería necesitar desbordar — pero si algo se estima mal
                // preferimos que fluya en vez de recortar contenido.
                padding: '8px 12px',
                minHeight: `calc(800px * (${paperConfig.heightMm} / ${paperConfig.widthMm}))`,
                ['--duo-paper-height' as string]: `${paperConfig.heightMm}mm`,
                ['--duo-paper-width' as string]: `${paperConfig.widthMm}mm`,
              }}
              data-papersize={paperConfig.id}
            >
              <div className="w-full">
                <KudeDocument
                  id={`${page.id}-single-${idx}`}
                  document={page.docTop}
                  ecoMode={ecoMode}
                  compact={false}
                  itemsOverride={chunkItems}
                  showFooter={isLast}
                  pageLabel={chunks.length > 1 ? `Página ${idx + 1} de ${chunks.length}` : undefined}
                />
              </div>
            </div>
          );
        });
      })()}
    </div>
  );
};
