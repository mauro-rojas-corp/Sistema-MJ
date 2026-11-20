import { KudeDocumentData } from '../types/kude';

export type SingleSheetLayout = 'half-top' | 'full' | 'duplicate';
export type BatchDistributionMode = 'duo-auto' | 'separate' | 'duplicate';

export interface DuoPrintPage {
  id: string;
  pageIndex: number;
  type: 'duo' | 'single';
  docTop: KudeDocumentData;
  docBottom?: KudeDocumentData;
  singleLayout?: SingleSheetLayout;
  reason?: string;
  dateLabel?: string;
  fitnessScore?: number;
  copyTags?: {
    top?: string;
    bottom?: string;
  };
}

export interface PackingOptions {
  distributionMode?: BatchDistributionMode;
  groupBy?: 'affinity' | 'date' | 'sequence' | 'order';
  maxItemsForShort?: number;
  sortBy?: 'date' | 'number' | 'none';
  prioritizeSameDate?: boolean;
  duplicateMode?: boolean; // Retrocompatibilidad: equivale a distributionMode: 'duplicate'
  singleLayoutDefault?: SingleSheetLayout;
}

export interface PackingResult {
  pages: DuoPrintPage[];
  totalDocs: number;
  shortDocs: number;
  longDocs: number;
  normalPagesCount: number;
  optimizedPagesCount: number;
  savedSheetsCount: number;
}

/**
 * Determina si una factura es "corta" y apta para imprimirse en media hoja A4 (~135mm).
 * Criterio por defecto: 5 ítems o menos y observaciones no excesivamente largas.
 */
export function isKudeShort(doc: KudeDocumentData, maxItems = 5): boolean {
  if (!doc) return false;
  const itemCount = doc.items?.length || 0;
  const obsLength = doc.observaciones?.length || 0;
  return itemCount <= maxItems && obsLength < 160;
}

/**
 * Extrae timestamp numérico para ordenar cronológicamente por fecha de emisión.
 */
function getDocTimestamp(doc: KudeDocumentData): number {
  if (!doc.fechaEmision) return 0;
  const ddmmyyyy = doc.fechaEmision.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy, hh = '0', min = '0', ss = '0'] = ddmmyyyy;
    return new Date(+yyyy, +mm - 1, +dd, +hh, +min, +ss).getTime();
  }
  const t = new Date(doc.fechaEmision).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * Extrae clave de fecha solo (DD/MM/YYYY) para agrupar por mismo día.
 */
export function getDocDateOnly(doc: KudeDocumentData): string {
  if (!doc.fechaEmision) return 'Sin fecha';
  const ddmmyyyy = doc.fechaEmision.match(/^(\d{2}\/\d{2}\/\d{4})/);
  if (ddmmyyyy) return ddmmyyyy[1];
  const iso = doc.fechaEmision.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return doc.fechaEmision.slice(0, 10);
}

/**
 * Calcula el puntaje de afinidad y aptitud ("Fitness Score") entre dos facturas para emparejarse en media hoja.
 * Evalúa:
 * - Cantidad similar de ítems (tablas balanceadas con alturas idénticas).
 * - Mismo emisor o receptor (relación comercial idéntica).
 * - Misma fecha de emisión o numeración consecutiva.
 */
export function calculatePairingAffinity(
  docA: KudeDocumentData,
  docB: KudeDocumentData
): number {
  if (!docA || !docB) return 0;
  let score = 50; // Puntuación base por ser ambas elegibles

  // 1. Similitud en cantidad de ítems: mayor armonía visual
  const itemsA = docA.items?.length || 0;
  const itemsB = docB.items?.length || 0;
  const diffItems = Math.abs(itemsA - itemsB);
  if (diffItems === 0) {
    score += 35; // Altura exactamente igual
  } else if (diffItems === 1) {
    score += 25;
  } else if (diffItems === 2) {
    score += 15;
  } else {
    score += Math.max(0, 10 - diffItems * 2);
  }

  // Si ambas son de 1 o 2 ítems (como el caso típico de servicios), máxima aptitud
  if (itemsA <= 2 && itemsB <= 2) {
    score += 15;
  }

  // 2. Mismo Emisor (RUC)
  if (docA.emisor?.ruc && docB.emisor?.ruc && docA.emisor.ruc === docB.emisor.ruc) {
    score += 25;
  }

  // 3. Mismo Receptor / Cliente (RUC)
  if (docA.receptor?.ruc && docB.receptor?.ruc && docA.receptor.ruc === docB.receptor.ruc) {
    score += 25;
  }

  // 4. Misma Fecha de Emisión
  const dateA = getDocDateOnly(docA);
  const dateB = getDocDateOnly(docB);
  if (dateA && dateB && dateA === dateB && dateA !== 'Sin fecha') {
    score += 20;
  }

  // 5. Misma moneda y condición de venta
  if (docA.totales?.moneda && docA.totales.moneda === docB.totales?.moneda) {
    score += 10;
  }

  // 6. Números consecutivos
  if (docA.numeroDocumento && docB.numeroDocumento) {
    const numA = parseInt(docA.numeroDocumento, 10);
    const numB = parseInt(docB.numeroDocumento, 10);
    if (!isNaN(numA) && !isNaN(numB) && Math.abs(numA - numB) === 1) {
      score += 20;
    }
  }

  return score;
}

/**
 * Empaqueta una lista de documentos en páginas optimizadas de impresión.
 * Ofrece máxima flexibilidad:
 * - 'duo-auto': Asocia las 2 facturas más aptas por hoja; facturas restantes o largas van en hojas individuales.
 * - 'separate': Cada factura se imprime en su propia hoja independiente.
 * - 'duplicate': Cada factura se imprime con su Original + Duplicado en la misma hoja.
 */
export function packDocumentsForPrinting(
  docs: KudeDocumentData[],
  options: PackingOptions = {}
): PackingResult {
  if (!docs || docs.length === 0) {
    return {
      pages: [],
      totalDocs: 0,
      shortDocs: 0,
      longDocs: 0,
      normalPagesCount: 0,
      optimizedPagesCount: 0,
      savedSheetsCount: 0,
    };
  }

  const {
    distributionMode = options.duplicateMode ? 'duplicate' : 'duo-auto',
    groupBy = 'affinity',
    maxItemsForShort = 5,
    singleLayoutDefault = 'half-top',
  } = options;

  // 1. Deduplicación estricta para garantizar que ninguna factura se repita en el lote
  const uniqueDocs: KudeDocumentData[] = [];
  const seenKeys = new Set<string>();

  for (const d of docs) {
    const key =
      d.cdc && d.cdc.trim().length === 44
        ? `cdc:${d.cdc.trim()}`
        : d.timbradoNumero && d.numeroCompleto
        ? `num:${d.emisor?.ruc || ''}-${d.timbradoNumero}-${d.numeroCompleto}`
        : `id:${d.id}`;

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueDocs.push(d);
    }
  }

  const pages: DuoPrintPage[] = [];
  let pageNumber = 1;

  // MODO 1: HOJAS SEPARADAS (1 Factura por Hoja Completa / 100% Individual)
  if (distributionMode === 'separate') {
    for (const doc of uniqueDocs) {
      pages.push({
        id: `page-single-sep-${doc.id}`,
        pageIndex: pageNumber++,
        type: 'single',
        docTop: doc,
        singleLayout: singleLayoutDefault || 'full',
        reason: `Factura ${doc.numeroCompleto || ''} — Hoja Separada Individual`,
        dateLabel: getDocDateOnly(doc),
      });
    }

    return {
      pages,
      totalDocs: uniqueDocs.length,
      shortDocs: uniqueDocs.filter((d) => isKudeShort(d, maxItemsForShort)).length,
      longDocs: uniqueDocs.filter((d) => !isKudeShort(d, maxItemsForShort)).length,
      normalPagesCount: uniqueDocs.length,
      optimizedPagesCount: pages.length,
      savedSheetsCount: 0,
    };
  }

  // MODO 2: MODO DUPLICADO (Original + Duplicado por cada factura)
  if (distributionMode === 'duplicate') {
    for (const doc of uniqueDocs) {
      const isShort = isKudeShort(doc, maxItemsForShort);
      if (isShort) {
        pages.push({
          id: `page-duo-copy-${doc.id}`,
          pageIndex: pageNumber++,
          type: 'duo',
          docTop: doc,
          docBottom: doc,
          copyTags: {
            top: 'ORIGINAL',
            bottom: 'DUPLICADO',
          },
          dateLabel: getDocDateOnly(doc),
          reason: `Factura ${doc.numeroCompleto || ''} — Original (Superior) y Duplicado (Inferior) simétricos`,
        });
      } else {
        pages.push({
          id: `page-single-long-${doc.id}`,
          pageIndex: pageNumber++,
          type: 'single',
          docTop: doc,
          singleLayout: 'full',
          reason: `Factura extensa (${doc.items?.length || 0} ítems) — Hoja completa`,
          dateLabel: getDocDateOnly(doc),
        });
      }
    }

    return {
      pages,
      totalDocs: uniqueDocs.length,
      shortDocs: uniqueDocs.filter((d) => isKudeShort(d, maxItemsForShort)).length,
      longDocs: uniqueDocs.filter((d) => !isKudeShort(d, maxItemsForShort)).length,
      normalPagesCount: uniqueDocs.length,
      optimizedPagesCount: pages.length,
      savedSheetsCount: 0,
    };
  }

  // MODO 3: DÚO INTELIGENTE OPTIMIZADO (Asociar las 2 más aptas, el 3ro va solo)
  // Ordenar previamente según el criterio de base
  const sorted = [...uniqueDocs];
  if (groupBy === 'date') {
    sorted.sort((a, b) => getDocTimestamp(a) - getDocTimestamp(b));
  } else if (groupBy === 'sequence') {
    sorted.sort((a, b) => (a.numeroCompleto || '').localeCompare(b.numeroCompleto || ''));
  }

  // Separar en cortas y largas
  const longs: KudeDocumentData[] = [];
  const shorts: KudeDocumentData[] = [];

  for (const d of sorted) {
    if (isKudeShort(d, maxItemsForShort)) {
      shorts.push(d);
    } else {
      longs.push(d);
    }
  }

  const usedShortIds = new Set<string>();

  // Emparejamiento por Aptitud / Afinidad ("las más aptas")
  while (usedShortIds.size < shorts.length) {
    const available = shorts.filter((d) => !usedShortIds.has(d.id));
    if (available.length === 0) break;

    if (available.length === 1) {
      // Quedó 1 factura huérfana (ej: el 3ro de 3 facturas)
      const orphan = available[0];
      usedShortIds.add(orphan.id);

      pages.push({
        id: `page-single-short-${orphan.id}`,
        pageIndex: pageNumber++,
        type: 'single',
        docTop: orphan,
        singleLayout: singleLayoutDefault,
        reason: `Factura individual huérfana (${orphan.items?.length || 0} ${orphan.items?.length === 1 ? 'ítem' : 'ítems'})`,
        dateLabel: getDocDateOnly(orphan),
      });
      break;
    }

    // Hay 2 o más disponibles: buscar la pareja con mayor puntaje de aptitud (las más aptas)
    let bestPair: [KudeDocumentData, KudeDocumentData] | null = null;
    let maxAffinity = -1;

    for (let i = 0; i < available.length; i++) {
      for (let j = i + 1; j < available.length; j++) {
        const docA = available[i];
        const docB = available[j];
        const score = calculatePairingAffinity(docA, docB);

        if (score > maxAffinity) {
          maxAffinity = score;
          bestPair = [docA, docB];
        }
      }
    }

    if (bestPair) {
      const [docA, docB] = bestPair;
      usedShortIds.add(docA.id);
      usedShortIds.add(docB.id);

      const dateA = getDocDateOnly(docA);
      const dateB = getDocDateOnly(docB);
      const sameDate = dateA === dateB;

      pages.push({
        id: `page-duo-${docA.id}-${docB.id}`,
        pageIndex: pageNumber++,
        type: 'duo',
        docTop: docA,
        docBottom: docB,
        fitnessScore: maxAffinity,
        dateLabel: sameDate ? `Misma fecha: ${dateA}` : `${dateA} / ${dateB}`,
        reason: `2 facturas más aptas asociadas (Afinidad: ${maxAffinity} pts • ${docA.items.length} y ${docB.items.length} ítems)`,
      });
    } else {
      // Fallback de seguridad
      const fallbackDoc = available[0];
      usedShortIds.add(fallbackDoc.id);
      pages.push({
        id: `page-single-short-${fallbackDoc.id}`,
        pageIndex: pageNumber++,
        type: 'single',
        docTop: fallbackDoc,
        singleLayout: singleLayoutDefault,
        reason: 'Factura corta individual',
        dateLabel: getDocDateOnly(fallbackDoc),
      });
    }
  }

  // Agregar facturas largas (cada una en su propia hoja completa)
  for (const longDoc of longs) {
    pages.push({
      id: `page-single-long-${longDoc.id}`,
      pageIndex: pageNumber++,
      type: 'single',
      docTop: longDoc,
      singleLayout: 'full',
      reason: `Factura extensa (${longDoc.items?.length || 0} ítems) — Hoja completa`,
      dateLabel: getDocDateOnly(longDoc),
    });
  }

  const normalPagesCount = uniqueDocs.length;
  const optimizedPagesCount = pages.length;
  const savedSheetsCount = Math.max(0, normalPagesCount - optimizedPagesCount);

  return {
    pages,
    totalDocs: uniqueDocs.length,
    shortDocs: shorts.length,
    longDocs: longs.length,
    normalPagesCount,
    optimizedPagesCount,
    savedSheetsCount,
  };
}
