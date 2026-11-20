export interface KudeItem {
  id: string;
  codigo: string;
  descripcion: string;
  unidadMedida: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  tasaIva: 0 | 5 | 10;
  // Computed values
  totalItem: number;
  valorExento: number;
  valorIva5: number;
  valorIva10: number;
  baseGravada5: number;
  baseGravada10: number;
  liquidacionIva5: number;
  liquidacionIva10: number;
}

export interface KudeEmisor {
  ruc: string;
  dv: string;
  razonSocial: string;
  nombreFantasia?: string;
  direccion: string;
  numeroCasa?: string;
  ciudad: string;
  departamento?: string;
  telefono?: string;
  email?: string;
  actividadEconomica?: string;
  codigoActividad?: string;
}

export interface KudeReceptor {
  ruc: string;
  dv?: string;
  tipoDocumento: string; // '1' RUC, '2' Cédula, '3' Pasaporte, '4' Innominado
  numeroDocumento?: string;
  razonSocial: string;
  nombreFantasia?: string;
  direccion?: string;
  ciudad?: string;
  telefono?: string;
  email?: string;
}

export interface KudeTotales {
  subtotalExento: number;
  subtotal5: number;
  subtotal10: number;
  totalOperacion: number;
  totalDescuento: number;
  redondeo: number; // dRedon según Ley 4017/10 de la DNIT (0.00 en USD)
  redondeoAclaracion: string; // Explicación oficial DNIT para USD o PYG
  baseGravada5: number;
  baseGravada10: number;
  totalBaseGravada: number;
  totalIva5: number;
  totalIva10: number;
  totalIva: number;
  totalPagar: number; // Total a pagar en la moneda del comprobante (USD o PYG)
  totalGuaraniesEquivalente?: number; // dTotalGs: Total liquidado en Guaraníes al tipo de cambio para operaciones en USD
  totalPagarLetras: string;
  moneda: string; // 'PYG' | 'USD'
  monedaDescripcion?: string; // 'Dólares Americanos' | 'Guaraníes'
  tipoCambio?: number; // dTiCam
}

export interface KudeDocumentData {
  id: string; // File ID or unique key
  fileName: string;
  xmlRaw: string;
  parseErrors?: string[];
  
  // SIFEN Timbrado & Document info
  tipoDocumentoNombre: string; // Factura Electrónica, Nota de Crédito, etc.
  tipoDocumentoCodigo: string; // '1', '4', '5', '6', '7'
  timbradoNumero: string;
  timbradoFechaInicio: string;
  establecimiento: string;
  puntoExpedicion: string;
  numeroDocumento: string;
  numeroCompleto: string; // 001-001-0000123
  fechaEmision: string; // YYYY-MM-DD HH:mm:ss
  condicionVenta: 'Contado' | 'Crédito';
  condicionVentaDetalle?: string;
  
  // CDC (44 characters)
  cdc: string;
  cdcFormatted: string; // 4-digit separated
  
  // QR Code URL or string
  qrUrl: string;
  
  // Actor info
  emisor: KudeEmisor;
  receptor: KudeReceptor;
  
  // Details & Totals
  items: KudeItem[];
  totales: KudeTotales;
  
  // Observaciones & Informaciones adicionales
  observaciones?: string;
  fechaFirmaDigital?: string;
}
