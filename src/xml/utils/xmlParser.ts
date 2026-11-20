import {
  KudeDocumentData,
  KudeItem,
  KudeEmisor,
  KudeReceptor,
  KudeTotales,
} from '../types/kude';
import { numberToWordsSpanish } from './numberToWords';
import { formatParaguayDate } from './dateFormatter';

/**
 * Safely find an element within an XML parent node, ignoring namespaces (e.g. sifen:dNomEmi).
 */
export function findElement(
  parent: Element | Document,
  tagName: string
): Element | null {
  if (!parent) return null;

  // 1. Try getElementsByTagNameNS with wildcard namespace
  try {
    const nsEls = parent.getElementsByTagNameNS('*', tagName);
    if (nsEls && nsEls.length > 0) return nsEls[0];
  } catch {
    // Ignore environments where getElementsByTagNameNS is not supported
  }

  // 2. Try direct getElementsByTagName
  try {
    const directEls = parent.getElementsByTagName(tagName);
    if (directEls && directEls.length > 0) return directEls[0];
  } catch {
    // Ignore
  }

  // 3. Fallback: traverse all child elements by matching localName or nodeName without prefix
  const all = parent.getElementsByTagName('*');
  const targetLower = tagName.toLowerCase();
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const local = el.localName || '';
    if (local.toLowerCase() === targetLower) return el;

    const nodeName = el.nodeName || '';
    const colonIdx = nodeName.indexOf(':');
    const stripped = colonIdx >= 0 ? nodeName.slice(colonIdx + 1) : nodeName;
    if (stripped.toLowerCase() === targetLower) return el;
  }

  return null;
}

/**
 * Safely find all matching elements within an XML parent node, ignoring namespaces.
 */
export function findElements(
  parent: Element | Document,
  tagName: string
): Element[] {
  if (!parent) return [];

  // 1. Try getElementsByTagNameNS with wildcard namespace
  try {
    const nsList = parent.getElementsByTagNameNS('*', tagName);
    if (nsList && nsList.length > 0) return Array.from(nsList);
  } catch {
    // Ignore
  }

  // 2. Try direct getElementsByTagName
  try {
    const directEls = parent.getElementsByTagName(tagName);
    if (directEls && directEls.length > 0) return Array.from(directEls);
  } catch {
    // Ignore
  }

  // 3. Fallback: traverse all elements
  const all = parent.getElementsByTagName('*');
  const targetLower = tagName.toLowerCase();
  const results: Element[] = [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const local = el.localName || '';
    if (local.toLowerCase() === targetLower) {
      results.push(el);
      continue;
    }

    const nodeName = el.nodeName || '';
    const colonIdx = nodeName.indexOf(':');
    const stripped = colonIdx >= 0 ? nodeName.slice(colonIdx + 1) : nodeName;
    if (stripped.toLowerCase() === targetLower) {
      results.push(el);
    }
  }

  return results;
}

// Helper to get text content from element safely
export function getTagText(parent: Element | Document, tagName: string): string {
  const el = findElement(parent, tagName);
  return el?.textContent?.trim() || '';
}

export function getTagNumber(
  parent: Element | Document,
  tagName: string,
  fallback = 0
): number {
  const val = getTagText(parent, tagName);
  if (!val) return fallback;
  const clean = val.replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? fallback : num;
}

// Format 44-digit CDC in groups of 4: "0180 0123 4560 ..."
export function formatCdc(cdc: string): string {
  if (!cdc) return '';
  const clean = cdc.replace(/\D/g, '');
  return clean.match(/.{1,4}/g)?.join(' ') || cdc;
}

// SIFEN Document Type mapper
export function getTipoDocumentoNombre(code: string): string {
  switch (code) {
    case '1':
      return 'FACTURA ELECTRÓNICA';
    case '4':
      return 'AUTOFACTURA ELECTRÓNICA';
    case '5':
      return 'NOTA DE CRÉDITO ELECTRÓNICA';
    case '6':
      return 'NOTA DE DÉBITO ELECTRÓNICA';
    case '7':
      return 'NOTA DE REMISIÓN ELECTRÓNICA';
    default:
      return 'DOCUMENTO TRIBUTARIO ELECTRÓNICO (KuDE)';
  }
}

export function parseXmlToKude(
  xmlString: string,
  fileName: string = 'documento.xml'
): KudeDocumentData {
  const cleanXml = (xmlString || '').replace(/^\uFEFF/, '').trim();
  const parser = new DOMParser();
  let doc = parser.parseFromString(cleanXml, 'text/xml');

  // Check XML parser errors, try fallback if failed
  let parseErrors = doc.getElementsByTagName('parsererror');
  const errors: string[] = [];
  if (parseErrors && parseErrors.length > 0) {
    try {
      doc = parser.parseFromString(cleanXml, 'application/xml');
      parseErrors = doc.getElementsByTagName('parsererror');
    } catch {
      // Ignore
    }
  }

  if (parseErrors && parseErrors.length > 0) {
    errors.push(`Error de sintaxis XML: ${parseErrors[0].textContent?.slice(0, 120)}`);
  }

  // Check if it is SIFEN Paraguay XML
  const rDE = findElement(doc, 'rDE');
  const deElement = findElement(doc, 'DE');

  if (deElement || rDE) {
    return parseSifenXml(doc, cleanXml, fileName, errors);
  }

  // Check CFDI (Mexico)
  const cfdi = findElement(doc, 'Comprobante');
  if (cfdi) {
    return parseCfdiXml(doc, cleanXml, fileName, errors);
  }

  // Check UBL (Colombia / Perú / OASIS)
  const ublInvoice = findElement(doc, 'Invoice');
  if (ublInvoice) {
    return parseUblXml(doc, cleanXml, fileName, errors);
  }

  // Generic fallback
  return parseGenericXml(doc, cleanXml, fileName, errors);
}

/**
 * Parses an XML string that may contain either a single invoice or a batch/lote
 * of multiple invoices (e.g. <rLoteDE> containing multiple <rDE> or multiple <DE>).
 */
export function parseXmlToKudeMultiple(
  xmlString: string,
  fileName: string = 'documento.xml'
): KudeDocumentData[] {
  let cleanXml = (xmlString || '').replace(/^\uFEFF/, '').trim();

  // If the input contains multiple root elements concatenated (e.g. </rDE><rDE> or </DE><DE>),
  // wrap it with a single root <batchContainer> tag so the DOMParser can parse all children.
  const hasMultipleRoots =
    /<\/rDE>\s*<rDE/i.test(cleanXml) ||
    /<\/DE>\s*<DE/i.test(cleanXml) ||
    /<\/Comprobante>\s*<Comprobante/i.test(cleanXml);

  if (hasMultipleRoots && !cleanXml.startsWith('<batchContainer>')) {
    cleanXml = `<batchContainer>${cleanXml}</batchContainer>`;
  }

  const parser = new DOMParser();
  let doc = parser.parseFromString(cleanXml, 'text/xml');

  let parseErrors = doc.getElementsByTagName('parsererror');
  const errors: string[] = [];
  if (parseErrors && parseErrors.length > 0) {
    try {
      doc = parser.parseFromString(cleanXml, 'application/xml');
      parseErrors = doc.getElementsByTagName('parsererror');
    } catch {
      // Ignore
    }
  }

  if (parseErrors && parseErrors.length > 0) {
    errors.push(`Error de sintaxis XML: ${parseErrors[0].textContent?.slice(0, 120)}`);
  }

  // 1. Check if SIFEN batch has multiple <rDE>
  const rDEList = findElements(doc, 'rDE');
  if (rDEList.length > 1) {
    const serializer = new XMLSerializer();
    return rDEList.map((rde, idx) => {
      const subXml = serializer.serializeToString(rde);
      return parseSifenXml(rde, subXml, `${fileName} [${idx + 1}]`, errors);
    });
  }

  // 2. Check if SIFEN has multiple <DE>
  const deList = findElements(doc, 'DE');
  if (deList.length > 1) {
    const serializer = new XMLSerializer();
    return deList.map((de, idx) => {
      const subXml = serializer.serializeToString(de);
      return parseSifenXml(de, subXml, `${fileName} [${idx + 1}]`, errors);
    });
  }

  // 3. Check CFDI with multiple <Comprobante>
  const cfdiList = findElements(doc, 'Comprobante');
  if (cfdiList.length > 1) {
    const serializer = new XMLSerializer();
    return cfdiList.map((cfdi, idx) => {
      const subXml = serializer.serializeToString(cfdi);
      return parseCfdiXml(cfdi as any, subXml, `${fileName} [${idx + 1}]`, errors);
    });
  }

  // 4. Default: single invoice
  return [parseXmlToKude(cleanXml, fileName)];
}

function parseSifenXml(
  doc: Document | Element,
  xmlRaw: string,
  fileName: string,
  errors: string[]
): KudeDocumentData {
  let deNode: Element | null = null;
  if ('tagName' in doc && (doc as Element).tagName?.toLowerCase().endsWith('de') && !(doc as Element).tagName?.toLowerCase().includes('lote')) {
    deNode = doc as Element;
  }
  if (!deNode) {
    deNode = findElement(doc, 'DE') || (doc as Element);
  }

  // CDC ID from <DE Id="...">
  let cdc = deNode?.getAttribute?.('Id') || '';
  if (!cdc) {
    // Try dCarQR or URL
    const qrRaw = getTagText(doc, 'dCarQR') || getTagText(doc, 'dCarQr');
    const matchCdc = qrRaw.match(/Id=([0-9]{44})/i);
    if (matchCdc) cdc = matchCdc[1];
  }

  // Timbrado info
  const tipoDocCod = getTagText(doc, 'iTiDE') || '1';
  const tipoDocDesc =
    getTagText(doc, 'dDesTiDE') || getTipoDocumentoNombre(tipoDocCod);
  const timbradoNum = getTagText(doc, 'dNumTim') || '12345678';
  const rawTimbradoFecIni = getTagText(doc, 'dFeIniT') || '2024-01-01';
  const timbradoFecIni = formatParaguayDate(rawTimbradoFecIni, false);
  const est = getTagText(doc, 'dEst') || '001';
  const punExp = getTagText(doc, 'dPunExp') || '001';
  const numDoc = getTagText(doc, 'dNumDoc') || '0000001';
  const numCompleto = `${est.padStart(3, '0')}-${punExp.padStart(3, '0')}-${numDoc.padStart(7, '0')}`;

  // Date in Paraguay format (DD/MM/YYYY HH:mm:ss)
  const rawDate =
    getTagText(doc, 'dFeEmiDE') ||
    getTagText(doc, 'dFecEmi') ||
    new Date().toISOString();
  const fechaEmision = formatParaguayDate(rawDate, true);

  // Condicion
  const condOpeCod = getTagText(doc, 'iCondOpe') || '1';
  const condicionVenta: 'Contado' | 'Crédito' =
    condOpeCod === '2' ? 'Crédito' : 'Contado';
  const condDetalle =
    getTagText(doc, 'dDesCondOpe') ||
    (condicionVenta === 'Crédito' ? 'Plazo / Cuotas' : 'Contado');

  // Emisor
  const emisor: KudeEmisor = {
    ruc: getTagText(doc, 'dRucEm') || '80000000',
    dv: getTagText(doc, 'dDVEmi') || '1',
    razonSocial: getTagText(doc, 'dNomEmi') || 'EMPRESA EMISORA S.A.',
    nombreFantasia: getTagText(doc, 'dNomFanEmi'),
    direccion: getTagText(doc, 'dDirEmi') || 'Avda. Principal N° 123',
    numeroCasa: getTagText(doc, 'dNumCas') || '123',
    ciudad: getTagText(doc, 'dDesCiuEmi') || getTagText(doc, 'dCiuEmi') || 'Asunción',
    departamento: getTagText(doc, 'dDesDepEmi') || 'Capital',
    telefono: getTagText(doc, 'dTelEmi') || '(021) 123-456',
    email: getTagText(doc, 'dEmailE') || 'facturacion@empresa.com.py',
    actividadEconomica:
      getTagText(doc, 'dDesActEco') || 'VENTA AL POR MAYOR Y MENOR',
    codigoActividad: getTagText(doc, 'cActEco') || '47190',
  };

  // Receptor
  const rucRec = getTagText(doc, 'dRucRec');
  const dvRec = getTagText(doc, 'dDVRec');
  const numIdRec = getTagText(doc, 'dNumIDRec');
  const nomRec =
    getTagText(doc, 'dNomRec') ||
    getTagText(doc, 'dRazSocRec') ||
    'CLIENTE FINAL';

  const receptor: KudeReceptor = {
    ruc: rucRec || (numIdRec ? numIdRec : '44444401'),
    dv: dvRec || (rucRec ? '7' : undefined),
    tipoDocumento: rucRec ? 'RUC' : numIdRec ? 'C.I.' : 'Innominado',
    numeroDocumento: numIdRec || rucRec,
    razonSocial: nomRec,
    nombreFantasia: getTagText(doc, 'dNomFanRec'),
    direccion: getTagText(doc, 'dDirRec') || 'Sin dirección especificada',
    ciudad: getTagText(doc, 'dDesCiuRec') || 'Asunción',
    telefono: getTagText(doc, 'dTelRec'),
    email: getTagText(doc, 'dEmailRec'),
  };

  // Moneda y Tipo de Cambio (extraídos antes de ítems para cálculos fiscales)
  const rawMoneda = getTagText(doc, 'cMoneOpe') || 'PYG';
  const moneda = rawMoneda.toUpperCase().trim() === 'USD' ? 'USD' : 'PYG';
  const isUsd = moneda === 'USD';
  const monedaDescripcion =
    getTagText(doc, 'dDesMoneOpe') || (isUsd ? 'Dólares Americanos' : 'Guaraníes');
  const tipoCambio = getTagNumber(doc, 'dTiCam', 1);

  // Items
  const itemsNodes = findElements(doc, 'gCamItem');
  const items: KudeItem[] = [];

  itemsNodes.forEach((node, idx) => {
    const cod =
      getTagText(node, 'dCodInt') ||
      getTagText(node, 'dCodPart') ||
      `ITM-${idx + 1}`;
    const desc =
      getTagText(node, 'dDesProSer') || `Producto / Servicio ${idx + 1}`;
    const uni =
      getTagText(node, 'cUniMed') || getTagText(node, 'dDesUniMed') || 'UNI';
    const cant = getTagNumber(node, 'dCantCodInt', 1);
    const precio = getTagNumber(node, 'dPUniProSer', 0);
    const descItem = getTagNumber(node, 'dDescItem', 0);

    // IVA info
    const afecIva = getTagText(node, 'iAfecIVA'); // 1 Gravado, 2 Exonerado, 3 Exento
    let tasaIvaRaw = getTagNumber(node, 'dTasaIVA', 10);
    if (afecIva === '3' || afecIva === '2') {
      tasaIvaRaw = 0;
    }
    const tasaIva = (tasaIvaRaw === 5 ? 5 : tasaIvaRaw === 0 ? 0 : 10) as
      | 0
      | 5
      | 10;

    let totalItem = Math.max(0, cant * precio - descItem);
    if (isUsd) {
      totalItem = Math.round(totalItem * 100) / 100;
    }

    // Distribution by tax
    const valorExento = tasaIva === 0 ? totalItem : 0;
    const valorIva5 = tasaIva === 5 ? totalItem : 0;
    const valorIva10 = tasaIva === 10 ? totalItem : 0;

    // Liquidacion IVA (En USD se calculan centavos con 2 decimales; en PYG enteros según DNIT)
    const liquidacionIva5 = tasaIva === 5
      ? (isUsd ? Math.round((valorIva5 / 21) * 100) / 100 : Math.round(valorIva5 / 21))
      : 0;
    const liquidacionIva10 = tasaIva === 10
      ? (isUsd ? Math.round((valorIva10 / 11) * 100) / 100 : Math.round(valorIva10 / 11))
      : 0;
    const baseGravada5 = isUsd
      ? Math.round((valorIva5 - liquidacionIva5) * 100) / 100
      : valorIva5 - liquidacionIva5;
    const baseGravada10 = isUsd
      ? Math.round((valorIva10 - liquidacionIva10) * 100) / 100
      : valorIva10 - liquidacionIva10;

    items.push({
      id: `item-${idx + 1}-${Date.now()}`,
      codigo: cod,
      descripcion: desc,
      unidadMedida: uni,
      cantidad: cant,
      precioUnitario: precio,
      descuento: descItem,
      tasaIva,
      totalItem,
      valorExento,
      valorIva5,
      valorIva10,
      baseGravada5,
      baseGravada10,
      liquidacionIva5,
      liquidacionIva10,
    });
  });

  // If no items extracted, make fallback
  if (items.length === 0) {
    const totOpe = getTagNumber(doc, 'dTotOpe', isUsd ? 100 : 100000);
    const liq10 = isUsd ? Math.round((totOpe / 11) * 100) / 100 : Math.round(totOpe / 11);
    items.push({
      id: 'item-1',
      codigo: 'SERV-01',
      descripcion: 'Servicio / Mercadería General',
      unidadMedida: 'UNI',
      cantidad: 1,
      precioUnitario: totOpe,
      descuento: 0,
      tasaIva: 10,
      totalItem: totOpe,
      valorExento: 0,
      valorIva5: 0,
      valorIva10: totOpe,
      baseGravada5: 0,
      baseGravada10: isUsd ? Math.round((totOpe - liq10) * 100) / 100 : Math.round(totOpe - totOpe / 11),
      liquidacionIva5: 0,
      liquidacionIva10: liq10,
    });
  }

  // Calculate totals from items or from XML
  const subtotalExento =
    getTagNumber(doc, 'dSubExe', 0) ||
    items.reduce((acc, it) => acc + it.valorExento, 0);
  const subtotal5 =
    getTagNumber(doc, 'dSub5', 0) ||
    items.reduce((acc, it) => acc + it.valorIva5, 0);
  const subtotal10 =
    getTagNumber(doc, 'dSub10', 0) ||
    items.reduce((acc, it) => acc + it.valorIva10, 0);
  const totalDescuento =
    getTagNumber(doc, 'dTotDesc', 0) ||
    items.reduce((acc, it) => acc + it.descuento, 0);

  const dTotGralOpe = getTagNumber(doc, 'dTotGralOpe', 0);
  const dTotOpe = getTagNumber(doc, 'dTotOpe', 0);
  const dTotalGs = getTagNumber(doc, 'dTotalGs', 0);
  const dRedonRaw = getTagNumber(doc, 'dRedon', 0);

  let totalOperacion = dTotOpe || (subtotalExento + subtotal5 + subtotal10);
  if (isUsd) {
    totalOperacion = Math.round(totalOperacion * 100) / 100;
  }

  const totalIva5 =
    getTagNumber(doc, 'dIVA5', 0) ||
    items.reduce((acc, it) => acc + it.liquidacionIva5, 0);
  const totalIva10 =
    getTagNumber(doc, 'dIVA10', 0) ||
    items.reduce((acc, it) => acc + it.liquidacionIva10, 0);
  const totalIva =
    getTagNumber(doc, 'dTotIVA', 0) || (isUsd ? Math.round((totalIva5 + totalIva10) * 100) / 100 : totalIva5 + totalIva10);

  const baseGravada5 =
    getTagNumber(doc, 'dBaseGrav5', 0) || (isUsd ? Math.round((subtotal5 - totalIva5) * 100) / 100 : subtotal5 - totalIva5);
  const baseGravada10 =
    getTagNumber(doc, 'dBaseGrav10', 0) || (isUsd ? Math.round((subtotal10 - totalIva10) * 100) / 100 : subtotal10 - totalIva10);
  const totalBaseGravada = isUsd
    ? Math.round((baseGravada5 + baseGravada10) * 100) / 100
    : baseGravada5 + baseGravada10;

  // Lógica de Redondeo y Total a Pagar según normativa DNIT (Dirección Nacional de Ingresos Tributarios)
  let redondeo = 0;
  let redondeoAclaracion = '';
  let totalPagar = 0;
  let totalGuaraniesEquivalente: number | undefined = undefined;

  if (isUsd) {
    // EN DÓLARES (USD):
    // La DNIT establece taxativamente que el redondeo de la Ley 4017/10 NO APLICA a moneda extranjera.
    // El redondeo tributario es 0.00 y el total en USD mantiene sus centavos exactos (2 decimales).
    redondeo = 0;
    redondeoAclaracion =
      'Redondeo DNIT: 0.00 (No aplica en USD). La regla de redondeo (Ley N° 4017/10) rige exclusivamente para Guaraníes.';
    totalPagar = dTotGralOpe > 0 ? dTotGralOpe : totalOperacion;
    totalPagar = Math.round(totalPagar * 100) / 100;

    // Liquidación equivalente en Guaraníes obligatoria por la DNIT (dTotalGs):
    // dTotalGs = dTotGralOpe * dTiCam, redondeado a Guaraníes enteros sin decimales
    if (dTotalGs > 0) {
      totalGuaraniesEquivalente = Math.round(dTotalGs);
    } else if (tipoCambio > 1) {
      totalGuaraniesEquivalente = Math.round(totalPagar * tipoCambio);
    }
  } else {
    // EN GUARANÍES (PYG):
    // Aplica la regla de redondeo de la Ley 4017/10 DNIT (múltiplos de 50 Gs o entero).
    redondeo = dRedonRaw;
    if (dTotGralOpe > 0) {
      totalPagar = Math.round(dTotGralOpe);
    } else if (dTotalGs > 0) {
      totalPagar = Math.round(dTotalGs);
    } else {
      totalPagar = Math.round(totalOperacion + redondeo);
    }

    if (redondeo !== 0) {
      redondeoAclaracion = `Ajuste por redondeo según Ley N° 4017/10 DNIT (${redondeo > 0 ? '+' : ''}${redondeo.toLocaleString('es-PY')} ₲).`;
    } else {
      redondeoAclaracion = 'Sin diferencia por redondeo (Ley N° 4017/10 DNIT).';
    }
  }

  const totalPagarLetras = numberToWordsSpanish(totalPagar, moneda);

  const totales: KudeTotales = {
    subtotalExento,
    subtotal5,
    subtotal10,
    totalOperacion,
    totalDescuento,
    redondeo,
    redondeoAclaracion,
    baseGravada5,
    baseGravada10,
    totalBaseGravada,
    totalIva5,
    totalIva10,
    totalIva,
    totalPagar,
    totalGuaraniesEquivalente,
    totalPagarLetras,
    moneda,
    monedaDescripcion,
    tipoCambio: tipoCambio !== 1 ? tipoCambio : undefined,
  };

  // QR URL
  let qrUrl = getTagText(doc, 'dCarQR') || getTagText(doc, 'dCarQr');
  if (!qrUrl) {
    // Generate valid SIFEN format QR URL
    qrUrl = `https://ekuatia.set.gov.py/consultas/qr?nVersion=150&Id=${cdc || '01800000001001001000000112024010112345678901'}&dFeEmiDE=${encodeURIComponent(rawDate)}&dRucRec=${receptor.ruc}&dTotGralOpe=${totalPagar}&dTotIVA=${totalIva}&cHashQR=a1b2c3d4e5f6`;
  }

  // Observaciones & firma
  const observaciones =
    getTagText(doc, 'dInfAdic') || getTagText(doc, 'dObs');
  const fechaFirma = getTagText(doc, 'dFecFirma');

  return {
    id: `kude-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    fileName,
    xmlRaw,
    parseErrors: errors.length > 0 ? errors : undefined,
    tipoDocumentoNombre: tipoDocDesc,
    tipoDocumentoCodigo: tipoDocCod,
    timbradoNumero: timbradoNum,
    timbradoFechaInicio: timbradoFecIni,
    establecimiento: est,
    puntoExpedicion: punExp,
    numeroDocumento: numDoc,
    numeroCompleto: numCompleto,
    fechaEmision,
    condicionVenta,
    condicionVentaDetalle: condDetalle,
    cdc,
    cdcFormatted: formatCdc(cdc),
    qrUrl,
    emisor,
    receptor,
    items,
    totales,
    observaciones: observaciones || undefined,
    fechaFirmaDigital: fechaFirma || undefined,
  };
}

// Fallback for CFDI (Mexico)
function parseCfdiXml(
  doc: Document,
  xmlRaw: string,
  fileName: string,
  errors: string[]
): KudeDocumentData {
  const comp = findElement(doc, 'Comprobante');
  const emisorNode = findElement(doc, 'Emisor');
  const receptorNode = findElement(doc, 'Receptor');

  const folio = comp?.getAttribute('Folio') || '1';
  const serie = comp?.getAttribute('Serie') || 'A';
  const fecha = comp?.getAttribute('Fecha') || new Date().toISOString();
  const subTotal = parseFloat(comp?.getAttribute('SubTotal') || '0');
  const total = parseFloat(comp?.getAttribute('Total') || '0');
  const moneda = comp?.getAttribute('Moneda') || 'USD';

  const emisor: KudeEmisor = {
    ruc: emisorNode?.getAttribute('Rfc') || 'AAA010101AAA',
    dv: '0',
    razonSocial:
      emisorNode?.getAttribute('Nombre') || 'EMISOR INTERNACIONAL S.A.',
    direccion: 'Sede Principal',
    ciudad: 'Ciudad',
    actividadEconomica: 'COMERCIO Y SERVICIOS',
  };

  const receptor: KudeReceptor = {
    ruc: receptorNode?.getAttribute('Rfc') || 'XAXX010101000',
    tipoDocumento: 'RFC/ID',
    razonSocial: receptorNode?.getAttribute('Nombre') || 'CLIENTE RECEPTOR',
  };

  const conceptos = findElements(doc, 'Concepto');
  const items: KudeItem[] = conceptos.map((c, i) => {
    const cant = parseFloat(c.getAttribute('Cantidad') || '1');
    const desc = c.getAttribute('Descripcion') || `Concepto ${i + 1}`;
    const pu = parseFloat(c.getAttribute('ValorUnitario') || '0');
    const imp = parseFloat(c.getAttribute('Importe') || `${cant * pu}`);
    return {
      id: `cfdi-${i}`,
      codigo: c.getAttribute('ClaveProdServ') || `C-${i + 1}`,
      descripcion: desc,
      unidadMedida: c.getAttribute('ClaveUnidad') || 'UNI',
      cantidad: cant,
      precioUnitario: pu,
      descuento: parseFloat(c.getAttribute('Descuento') || '0'),
      tasaIva: 10,
      totalItem: imp,
      valorExento: 0,
      valorIva5: 0,
      valorIva10: imp,
      baseGravada5: 0,
      baseGravada10: Math.round(imp - imp / 11),
      liquidacionIva5: 0,
      liquidacionIva10: Math.round(imp / 11),
    };
  });

  const cdc = `01${emisor.ruc.padEnd(11, '0')}001001${folio.padStart(7, '0')}22024041512345678901`;

  const isUsd = moneda === 'USD';
  const totales: KudeTotales = {
    subtotalExento: 0,
    subtotal5: 0,
    subtotal10: subTotal || total,
    totalOperacion: total,
    totalDescuento: 0,
    redondeo: 0,
    redondeoAclaracion: isUsd
      ? 'Redondeo DNIT: 0.00 (No aplica en USD). Ley N° 4017/10 rige exclusivamente para Guaraníes.'
      : 'Sin diferencia por redondeo (Ley N° 4017/10 DNIT).',
    baseGravada5: 0,
    baseGravada10: subTotal,
    totalBaseGravada: subTotal,
    totalIva5: 0,
    totalIva10: total - subTotal,
    totalIva: total - subTotal,
    totalPagar: total,
    totalPagarLetras: numberToWordsSpanish(total, moneda),
    moneda,
    monedaDescripcion: isUsd ? 'Dólares Americanos' : 'Pesos / Moneda Extranjera',
  };

  return {
    id: `cfdi-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    fileName,
    xmlRaw,
    parseErrors: errors.length > 0 ? errors : undefined,
    tipoDocumentoNombre: 'FACTURA ELECTRÓNICA (CFDI)',
    tipoDocumentoCodigo: '1',
    timbradoNumero: '98765432',
    timbradoFechaInicio: '01/01/2024',
    establecimiento: serie || '001',
    puntoExpedicion: '001',
    numeroDocumento: folio.padStart(7, '0'),
    numeroCompleto: `${serie}-${folio}`,
    fechaEmision: formatParaguayDate(fecha, true),
    condicionVenta: 'Contado',
    cdc,
    cdcFormatted: formatCdc(cdc),
    qrUrl: `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${cdc}`,
    emisor,
    receptor,
    items,
    totales,
  };
}

// Fallback for UBL (Peru, Colombia, OASIS)
function parseUblXml(
  doc: Document,
  xmlRaw: string,
  fileName: string,
  errors: string[]
): KudeDocumentData {
  const id = getTagText(doc, 'ID') || 'INV-001';
  const issueDate = getTagText(doc, 'IssueDate') || new Date().toISOString();
  const payableNode = findElement(doc, 'PayableAmount');
  const moneda = payableNode?.getAttribute('currencyID') || 'USD';

  const emisor: KudeEmisor = {
    ruc: getTagText(doc, 'CompanyID') || '20100000001',
    dv: '1',
    razonSocial:
      getTagText(doc, 'RegistrationName') || 'PROVEEDOR UBL INTERNACIONAL',
    direccion: getTagText(doc, 'StreetName') || 'Av. Central 456',
    ciudad: getTagText(doc, 'CityName') || 'Ciudad',
  };

  const receptor: KudeReceptor = {
    ruc: '10203040506',
    tipoDocumento: 'RUC/ID',
    razonSocial: 'CLIENTE UBL INTERNACIONAL',
  };

  const lines = findElements(doc, 'InvoiceLine');
  const items: KudeItem[] = lines.map((l, i) => {
    const cant = getTagNumber(l, 'InvoicedQuantity', 1);
    const desc = getTagText(l, 'Description') || `Ítem UBL ${i + 1}`;
    const pu = getTagNumber(l, 'PriceAmount', 0);
    const lineTotal = getTagNumber(l, 'LineExtensionAmount', cant * pu);
    return {
      id: `ubl-${i}`,
      codigo: getTagText(l, 'ID') || `U-${i + 1}`,
      descripcion: desc,
      unidadMedida: 'UNI',
      cantidad: cant,
      precioUnitario: pu,
      descuento: 0,
      tasaIva: 10,
      totalItem: lineTotal,
      valorExento: 0,
      valorIva5: 0,
      valorIva10: lineTotal,
      baseGravada5: 0,
      baseGravada10: Math.round(lineTotal - lineTotal / 11),
      liquidacionIva5: 0,
      liquidacionIva10: Math.round(lineTotal / 11),
    };
  });

  const total = getTagNumber(doc, 'PayableAmount', 1000);
  const cdc = `0120100000001001001000000122024041512345678901`;

  const isUsd = moneda === 'USD';
  const totales: KudeTotales = {
    subtotalExento: 0,
    subtotal5: 0,
    subtotal10: total,
    totalOperacion: total,
    totalDescuento: 0,
    redondeo: 0,
    redondeoAclaracion: isUsd
      ? 'Redondeo DNIT: 0.00 (No aplica en USD). Ley N° 4017/10 rige exclusivamente para Guaraníes.'
      : 'Sin diferencia por redondeo (Ley N° 4017/10 DNIT).',
    baseGravada5: 0,
    baseGravada10: Math.round(total / 1.1),
    totalBaseGravada: Math.round(total / 1.1),
    totalIva5: 0,
    totalIva10: Math.round(total - total / 1.1),
    totalIva: Math.round(total - total / 1.1),
    totalPagar: total,
    totalPagarLetras: numberToWordsSpanish(total, moneda),
    moneda,
    monedaDescripcion: isUsd ? 'Dólares Americanos' : 'Moneda Extranjera',
  };

  return {
    id: `ubl-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    fileName,
    xmlRaw,
    parseErrors: errors.length > 0 ? errors : undefined,
    tipoDocumentoNombre: 'FACTURA ELECTRÓNICA UBL',
    tipoDocumentoCodigo: '1',
    timbradoNumero: '11223344',
    timbradoFechaInicio: '01/01/2024',
    establecimiento: '001',
    puntoExpedicion: '001',
    numeroDocumento: '0000001',
    numeroCompleto: id,
    fechaEmision: formatParaguayDate(issueDate, true),
    condicionVenta: 'Contado',
    cdc,
    cdcFormatted: formatCdc(cdc),
    qrUrl: `https://consulta.ubl.org?id=${id}`,
    emisor,
    receptor,
    items,
    totales,
  };
}

// Generic XML fallback
function parseGenericXml(
  doc: Document,
  xmlRaw: string,
  fileName: string,
  errors: string[]
): KudeDocumentData {
  const root = doc.documentElement;
  const rootName = root ? root.tagName : 'Documento';

  // Try finding any price or total elements
  let total = 0;
  const possibleTotals = ['total', 'montoTotal', 'totalPagar', 'importe', 'amount'];
  for (const t of possibleTotals) {
    const val = getTagNumber(doc, t, 0);
    if (val > 0) {
      total = val;
      break;
    }
  }
  if (total === 0) total = 500000;

  const emisor: KudeEmisor = {
    ruc: getTagText(doc, 'rucEmisor') || '80012345',
    dv: '2',
    razonSocial:
      getTagText(doc, 'emisor') ||
      getTagText(doc, 'nombreEmisor') ||
      'EMISOR COMERCIAL S.A.',
    direccion: 'Dirección Central',
    ciudad: 'Asunción',
  };

  const receptor: KudeReceptor = {
    ruc: getTagText(doc, 'rucReceptor') || '4567890',
    dv: '1',
    tipoDocumento: 'RUC',
    razonSocial:
      getTagText(doc, 'receptor') ||
      getTagText(doc, 'cliente') ||
      'CLIENTE REGISTRADO',
  };

  const item: KudeItem = {
    id: 'gen-1',
    codigo: 'ITEM-01',
    descripcion: `Concepto parseado desde ${rootName}`,
    unidadMedida: 'UNI',
    cantidad: 1,
    precioUnitario: total,
    descuento: 0,
    tasaIva: 10,
    totalItem: total,
    valorExento: 0,
    valorIva5: 0,
    valorIva10: total,
    baseGravada5: 0,
    baseGravada10: Math.round(total - total / 11),
    liquidacionIva5: 0,
    liquidacionIva10: Math.round(total / 11),
  };

  const cdc =
    '018001234520010010000001120240101' +
    Math.floor(10000000000 + Math.random() * 90000000000).toString().slice(0, 11);

  return {
    id: `gen-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    fileName,
    xmlRaw,
    parseErrors:
      errors.length > 0
        ? errors
        : ['Formato no estricto SIFEN detectado; estructurado automáticamente en formato KuDE.'],
    tipoDocumentoNombre: 'DOCUMENTO ELECTRÓNICO (KuDE)',
    tipoDocumentoCodigo: '1',
    timbradoNumero: '12345678',
    timbradoFechaInicio: '01/01/2024',
    establecimiento: '001',
    puntoExpedicion: '001',
    numeroDocumento: '0000001',
    numeroCompleto: '001-001-0000001',
    fechaEmision: formatParaguayDate(new Date(), true),
    condicionVenta: 'Contado',
    cdc,
    cdcFormatted: formatCdc(cdc),
    qrUrl: `https://ekuatia.set.gov.py/consultas/qr?nVersion=150&Id=${cdc}`,
    emisor,
    receptor,
    items: [item],
    totales: {
      subtotalExento: 0,
      subtotal5: 0,
      subtotal10: total,
      totalOperacion: total,
      totalDescuento: 0,
      redondeo: 0,
      redondeoAclaracion: 'Sin diferencia por redondeo (Ley N° 4017/10 DNIT).',
      baseGravada5: 0,
      baseGravada10: Math.round(total - total / 11),
      totalBaseGravada: Math.round(total - total / 11),
      totalIva5: 0,
      totalIva10: Math.round(total / 11),
      totalIva: Math.round(total / 11),
      totalPagar: total,
      totalPagarLetras: numberToWordsSpanish(total, 'PYG'),
      moneda: 'PYG',
      monedaDescripcion: 'Guaraníes',
    },
  };
}

// Function to recalculate KuDE totals when an item is modified in real time
export function recalculateKude(doc: KudeDocumentData): KudeDocumentData {
  const isUsd = doc.totales.moneda === 'USD';
  let subtotalExento = 0;
  let subtotal5 = 0;
  let subtotal10 = 0;
  let totalDescuento = 0;
  let totalIva5 = 0;
  let totalIva10 = 0;

  const updatedItems = doc.items.map((it) => {
    const rawTotal = it.cantidad * it.precioUnitario;
    const desc = Math.min(it.descuento || 0, rawTotal);
    let itemTotal = Math.max(0, rawTotal - desc);
    if (isUsd) {
      itemTotal = Math.round(itemTotal * 100) / 100;
    }
    totalDescuento += desc;

    let vEx = 0;
    let v5 = 0;
    let v10 = 0;
    let liq5 = 0;
    let liq10 = 0;

    if (it.tasaIva === 0) {
      vEx = itemTotal;
      subtotalExento += vEx;
    } else if (it.tasaIva === 5) {
      v5 = itemTotal;
      liq5 = isUsd ? Math.round((v5 / 21) * 100) / 100 : Math.round(v5 / 21);
      subtotal5 += v5;
      totalIva5 += liq5;
    } else {
      v10 = itemTotal;
      liq10 = isUsd ? Math.round((v10 / 11) * 100) / 100 : Math.round(v10 / 11);
      subtotal10 += v10;
      totalIva10 += liq10;
    }

    const baseGravada5 = isUsd ? Math.round((v5 - liq5) * 100) / 100 : v5 - liq5;
    const baseGravada10 = isUsd ? Math.round((v10 - liq10) * 100) / 100 : v10 - liq10;

    return {
      ...it,
      descuento: desc,
      totalItem: itemTotal,
      valorExento: vEx,
      valorIva5: v5,
      valorIva10: v10,
      baseGravada5,
      baseGravada10,
      liquidacionIva5: liq5,
      liquidacionIva10: liq10,
    };
  });

  let totalOperacion = subtotalExento + subtotal5 + subtotal10;
  if (isUsd) {
    totalOperacion = Math.round(totalOperacion * 100) / 100;
  }

  const baseGravada5 = isUsd ? Math.round((subtotal5 - totalIva5) * 100) / 100 : subtotal5 - totalIva5;
  const baseGravada10 = isUsd ? Math.round((subtotal10 - totalIva10) * 100) / 100 : subtotal10 - totalIva10;
  const totalBaseGravada = isUsd ? Math.round((baseGravada5 + baseGravada10) * 100) / 100 : baseGravada5 + baseGravada10;
  const totalIva = isUsd ? Math.round((totalIva5 + totalIva10) * 100) / 100 : totalIva5 + totalIva10;

  let redondeo = 0;
  let redondeoAclaracion = '';
  let totalPagar = 0;
  let totalGuaraniesEquivalente: number | undefined = undefined;

  if (isUsd) {
    redondeo = 0;
    redondeoAclaracion =
      'Redondeo DNIT: 0.00 (No aplica en USD). La regla de redondeo (Ley N° 4017/10) rige exclusivamente para Guaraníes.';
    totalPagar = Math.round(totalOperacion * 100) / 100;
    if (doc.totales.tipoCambio && doc.totales.tipoCambio > 1) {
      totalGuaraniesEquivalente = Math.round(totalPagar * doc.totales.tipoCambio);
    }
  } else {
    redondeo = doc.totales.redondeo || 0;
    totalPagar = Math.round(totalOperacion + redondeo);
    if (redondeo !== 0) {
      redondeoAclaracion = `Ajuste por redondeo según Ley N° 4017/10 DNIT (${redondeo > 0 ? '+' : ''}${redondeo.toLocaleString('es-PY')} ₲).`;
    } else {
      redondeoAclaracion = 'Sin diferencia por redondeo (Ley N° 4017/10 DNIT).';
    }
  }

  const totalPagarLetras = numberToWordsSpanish(totalPagar, doc.totales.moneda);

  return {
    ...doc,
    items: updatedItems,
    totales: {
      ...doc.totales,
      subtotalExento,
      subtotal5,
      subtotal10,
      totalOperacion,
      totalDescuento,
      redondeo,
      redondeoAclaracion,
      baseGravada5,
      baseGravada10,
      totalBaseGravada,
      totalIva5,
      totalIva10,
      totalIva,
      totalPagar,
      totalGuaraniesEquivalente,
      totalPagarLetras,
    },
  };
}
