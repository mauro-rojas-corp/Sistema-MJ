/**
 * MÓDULO LECTURA DE DOCUMENTOS (IA) - archivo aparte del backend.
 *
 * Lee facturas, notas de crédito, recibos y planillas de cualquier formato
 * (PDF, fotos, Excel/CSV convertido a texto en la app) con Claude y devuelve
 * los datos ordenados. NO guarda nada: la app muestra lo leído para que una
 * persona lo revise y recién ahí lo guarda en el registro de comprobantes.
 *
 * Instalación en el proyecto de Apps Script:
 *   1. Archivo nuevo (+ > Secuencia de comandos) llamado "Lectura" y pegar
 *      este contenido completo.
 *   2. Pegar también el AppsScript-Avisos.gs nuevo (deriva las acciones
 *      lectura* a este archivo).
 *   3. Necesita el archivo "Agente" (AppsScript-Agente.gs): usa su clave
 *      ANTHROPIC_API_KEY, su límite diario y su hoja "Agente Uso".
 *   4. Opcional, en Propiedades del script:
 *        LECTURA_MODELO   modelo para leer documentos. Por defecto el mismo
 *                         del asistente (AGENTE_MODELO o claude-haiku-5-5).
 *                         Para fotos difíciles se puede usar
 *                         claude-sonnet-5-5 (más preciso y más caro).
 *   5. Implementar > Administrar implementaciones > editar > Nueva versión.
 *
 * Usa funciones de Code.gs (jsonResponse, errorResponse) y de Agente.gs
 * (agenteConfig, agenteProp, reservarConsulta, registrarUsoAgente,
 * AGENTE_API_URL, AGENTE_API_VERSION).
 */

const LECTURA_MAX_TOKENS = 16000;
// Base64 de un archivo de ~15 MB. La app achica las fotos antes de enviarlas.
const LECTURA_MAX_BASE64 = 20000000;
const LECTURA_MAX_TEXTO = 200000;
const LECTURA_TIPOS = {
  'application/pdf': 'document',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image'
};

const LECTURA_INSTRUCCIONES = [
  'Sos un asistente contable de un estudio de Paraguay. Vas a leer un documento (factura, nota de crédito, nota de débito,',
  'autofactura, recibo de dinero, ticket, o una planilla/listado con varios comprobantes) y extraer TODOS los comprobantes que contenga.',
  '',
  'Reglas:',
  '- Una entrada en "documentos" por cada comprobante. Si es una planilla, una entrada por fila de comprobante (sin totales ni subtotales).',
  '- Fechas en formato AAAA-MM-DD. Si no se ve, cadena vacía.',
  '- Montos como números, sin separadores de miles. Guaraníes sin decimales.',
  '- gravado10 y gravado5 son los montos gravados CON el IVA incluido (como figuran en la columna de la factura). exento es lo exento.',
  '  Si la factura muestra sólo la base sin IVA, sumale el IVA para que gravado10/gravado5 queden con IVA incluido.',
  '- iva10 e iva5: el IVA liquidado que figura en el documento (0 si no figura).',
  '- numero: el número completo del comprobante, por ejemplo 001-001-0000123. timbrado: 8 dígitos. cdc: los 44 dígitos si es electrónico.',
  '- emisor = quien emite el comprobante (el vendedor, o quien firma el recibo). receptor = el cliente/comprador (o quien paga en un recibo).',
  '- RUC con su dígito verificador si figura (por ejemplo 80012345-6). Si es cédula sin DV, sólo el número.',
  '- clase: factura, nota_credito, nota_debito, autofactura, recibo, ticket u otro.',
  '- En un recibo: monto es el total recibido, concepto es "en concepto de", facturas son las facturas que cancela, forma_pago lo que diga.',
  '- comprobante_asociado: en una nota de crédito, la factura que corrige.',
  '- confianza: alta si todo se lee claro; media si algún dato es dudoso; baja si la imagen es mala o faltan datos importantes.',
  '- observaciones: cualquier duda (por ejemplo "el total no coincide con la suma", "número parcialmente ilegible").',
  '- NO inventes datos. Si algo no se ve, dejalo vacío o en 0 y decilo en observaciones.',
  '- Si el documento no es un comprobante (por ejemplo una foto cualquiera), devolvé documentos vacío y explicalo en "nota".'
].join('\n');

const LECTURA_ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['documentos', 'nota'],
  properties: {
    nota: { type: 'string' },
    documentos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'clase', 'fecha', 'numero', 'timbrado', 'cdc', 'condicion', 'moneda', 'cambio',
          'emisor_ruc', 'emisor_nombre', 'receptor_ruc', 'receptor_nombre',
          'gravado10', 'gravado5', 'exento', 'iva10', 'iva5', 'total', 'monto',
          'concepto', 'facturas', 'forma_pago', 'comprobante_asociado', 'confianza', 'observaciones'
        ],
        properties: {
          clase: { type: 'string', enum: ['factura', 'nota_credito', 'nota_debito', 'autofactura', 'recibo', 'ticket', 'otro'] },
          fecha: { type: 'string' },
          numero: { type: 'string' },
          timbrado: { type: 'string' },
          cdc: { type: 'string' },
          condicion: { type: 'string', enum: ['contado', 'credito', ''] },
          moneda: { type: 'string', enum: ['PYG', 'USD', 'otra'] },
          cambio: { type: 'number' },
          emisor_ruc: { type: 'string' },
          emisor_nombre: { type: 'string' },
          receptor_ruc: { type: 'string' },
          receptor_nombre: { type: 'string' },
          gravado10: { type: 'number' },
          gravado5: { type: 'number' },
          exento: { type: 'number' },
          iva10: { type: 'number' },
          iva5: { type: 'number' },
          total: { type: 'number' },
          monto: { type: 'number' },
          concepto: { type: 'string' },
          facturas: { type: 'string' },
          forma_pago: { type: 'string' },
          comprobante_asociado: { type: 'string' },
          confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
          observaciones: { type: 'string' }
        }
      }
    }
  }
};

// body: { nombre, tipo (mime), base64 } o { nombre, texto }; contexto opcional
// (ej. nombre y RUC del cliente elegido) para orientar la lectura.
function handleLecturaDocumento(body, sessionUser) {
  if (typeof agenteConfig !== 'function') {
    return errorResponse('Falta el archivo Agente en el Apps Script (la lectura usa su configuración).', 'LECTURA_SIN_AGENTE');
  }
  const cfg = agenteConfig();
  if (!cfg.apiKey) {
    return errorResponse('La lectura con IA no está configurada: falta ANTHROPIC_API_KEY en las propiedades del Apps Script.', 'AGENTE_SIN_CLAVE');
  }
  const modelo = agenteProp('LECTURA_MODELO') || cfg.modelo;
  const nombre = String(body.nombre || 'documento').slice(0, 200);
  const contenido = [];

  if (typeof body.texto === 'string' && body.texto) {
    contenido.push({ type: 'text', text: 'Contenido del archivo «' + nombre + '» (convertido a texto):\n\n' + body.texto.slice(0, LECTURA_MAX_TEXTO) });
  } else {
    const tipo = String(body.tipo || '').toLowerCase();
    const bloque = LECTURA_TIPOS[tipo];
    const datos = String(body.base64 || '');
    if (!bloque || !datos) return errorResponse('Ese tipo de archivo no se puede leer (' + (tipo || 'desconocido') + ').', 'LECTURA_TIPO');
    if (datos.length > LECTURA_MAX_BASE64) return errorResponse('El archivo es demasiado grande para leerlo de una vez.', 'LECTURA_MUY_GRANDE');
    if (!/^[A-Za-z0-9+/=]+$/.test(datos)) return errorResponse('El archivo llegó dañado.', 'LECTURA_DATOS');
    contenido.push({ type: bloque, source: { type: 'base64', media_type: tipo, data: datos } });
    contenido.push({ type: 'text', text: 'Archivo: «' + nombre + '».' });
  }
  const ctx = String(body.contexto || '').slice(0, 2000);
  contenido.push({ type: 'text', text: 'Extraé los comprobantes según las reglas.' + (ctx ? '\nContexto: ' + ctx : '') });

  if (!reservarConsulta(sessionUser, cfg.limiteDiario)) {
    return errorResponse('Llegaste al límite de ' + cfg.limiteDiario + ' consultas a la IA por hoy. Mañana se renueva.', 'AGENTE_LIMITE');
  }

  const payload = {
    model: modelo,
    max_tokens: LECTURA_MAX_TOKENS,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: LECTURA_ESQUEMA } },
    system: LECTURA_INSTRUCCIONES,
    messages: [{ role: 'user', content: contenido }]
  };
  const resp = UrlFetchApp.fetch(AGENTE_API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': AGENTE_API_VERSION },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const status = resp.getResponseCode();
  let data = null;
  try { data = JSON.parse(resp.getContentText()); } catch (err) { data = null; }

  if (status < 200 || status >= 300 || !data) {
    const detalle = data && data.error && data.error.message ? data.error.message : ('HTTP ' + status);
    registrarUsoAgente(sessionUser, modelo, null, 'Lectura (error): ' + detalle);
    const mensaje = status === 429 || status === 529
      ? 'El servicio de IA está saturado en este momento. Probá de nuevo en un minuto.'
      : status === 401
        ? 'La clave de la IA no es válida. Avisale al administrador.'
        : (status === 400 && /credit|balance/i.test(detalle))
          ? 'La cuenta de la IA se quedó sin saldo. Avisale al administrador.'
          : 'No se pudo leer el documento (' + detalle + ').';
    return errorResponse(mensaje, 'LECTURA_API_ERROR');
  }

  registrarUsoAgente(sessionUser, modelo, data.usage, 'Lectura: ' + nombre);
  if (data.stop_reason === 'refusal') return errorResponse('La IA no quiso leer este documento.', 'LECTURA_RECHAZADA');
  const texto = (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  let resultado = null;
  try { resultado = JSON.parse(texto); } catch (err) { resultado = null; }
  if (!resultado || !Array.isArray(resultado.documentos)) {
    const corto = data.stop_reason === 'max_tokens' ? ' El archivo tiene demasiados comprobantes: dividilo en partes.' : '';
    return errorResponse('No se pudo interpretar lo que leyó la IA.' + corto, 'LECTURA_FORMATO');
  }
  return jsonResponse({ ok: true, documentos: resultado.documentos, nota: resultado.nota || '', modelo: modelo });
}

function handleLecturaAction(action, body, sessionUser, sessionRole) {
  if (action !== 'lecturaDocumento') return null;
  try {
    return handleLecturaDocumento(body, sessionUser);
  } catch (err) {
    return errorResponse(err.message, 'LECTURA_ERROR');
  }
}
