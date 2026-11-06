// ════════════════════════════════════════════════════════════════════════
// INSTALADOR DEL BACKEND DE PRUEBAS (sólo para el entorno de pruebas)
// ════════════════════════════════════════════════════════════════════════
// Ejecutar UNA vez la función instalarEntornoPruebas(). Crea en tu Google
// Drive dos planillas NUEVAS con datos ficticios y configura el proyecto:
//   - "PRUEBAS - Control Total (administración)": Usuarios, Planillas,
//     Historial (y las del IVA y Marcaciones, que se crean solas al usarlas).
//   - "PRUEBAS - Clientes 2026": hojas Septiembre, Octubre y Noviembre con
//     clientes inventados (RUC y Clave MH ficticios: Marangatu los rechaza).
// No lee ni toca ninguna planilla real.

const PRUEBAS_ANIO = '2026';
const PRUEBAS_MESES = ['Septiembre', 'Octubre', 'Noviembre'];
const PRUEBAS_PIN = '1234';
const PRUEBAS_USUARIOS = [
  ['Super Pruebas', 'SUPERUSUARIO'],
  ['Admin Pruebas', 'ADMINISTRADOR'],
  ['Usuario Pruebas', 'USUARIO'],
];
const PRUEBAS_CLIENTES_POR_MES = 25;
// Mismas columnas que la planilla real del estudio.
const PRUEBAS_ENCABEZADOS = [
  'Vencimiento', 'CLIENTE O RAZON SOCIAL', 'R.U.C.', 'D.V.', 'CLAVE MH', 'ZONA', 'Nº DE CASA', 'BARRIO',
  'CONTACTO', 'TELEFONO', 'ESTADO', 'OBSERVACIONES', 'VENTAS', 'Compras', 'Nota de Credito', 'Despacho ',
  'Fecha', 'Archivado por:', 'Encargado',
];

function instalarEntornoPruebas() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ADMIN_SPREADSHEET_ID')) {
    throw new Error(
      'El entorno de pruebas ya está instalado (existe ADMIN_SPREADSHEET_ID). ' +
      'Ejecutá mostrarDatosEntornoPruebas() para ver los datos.'
    );
  }

  // 1. Secretos propios de pruebas (distintos a los reales).
  props.setProperties({
    API_TOKEN: createRandomToken(),
    PIN_PEPPER: createRandomToken(),
    ALLOW_SELF_PIN_SETUP: 'false',
    ALLOW_PINLESS_LOGIN: 'false',
  });

  // 2. Planilla de clientes del año, con datos inventados.
  const anual = SpreadsheetApp.create('PRUEBAS - Clientes ' + PRUEBAS_ANIO);
  PRUEBAS_MESES.forEach(function (mes, i) {
    const hoja = i === 0 ? anual.getSheets()[0].setName(mes) : anual.insertSheet(mes);
    hoja.getRange(1, 1, 1, PRUEBAS_ENCABEZADOS.length).setValues([PRUEBAS_ENCABEZADOS]).setFontWeight('bold');
    hoja.getRange(2, 1, PRUEBAS_CLIENTES_POR_MES, PRUEBAS_ENCABEZADOS.length).setValues(clientesFicticios_(i));
    hoja.setFrozenRows(1);
    hoja.autoResizeColumns(1, PRUEBAS_ENCABEZADOS.length);
  });

  // 3. Planilla de administración.
  const admin = SpreadsheetApp.create('PRUEBAS - Control Total (administración)');
  props.setProperty('ADMIN_SPREADSHEET_ID', admin.getId());

  const usuarios = admin.getSheets()[0].setName(USERS_SHEET_NAME);
  usuarios.getRange(1, 1, 1, 4).setValues([['Nombre', 'Rol', PIN_HASH_HEADER, USER_STATUS_HEADER]]).setFontWeight('bold');
  usuarios.getRange(2, 1, PRUEBAS_USUARIOS.length, 4).setValues(
    PRUEBAS_USUARIOS.map(function (u) {
      return [u[0], u[1], computePinHash(u[0], PRUEBAS_PIN, false), 'ACTIVO'];
    })
  );

  const planillas = admin.insertSheet(PLANILLAS_SHEET_NAME);
  planillas.getRange(1, 1, 2, 3).setValues([
    ['Año', 'ID Planilla', 'Nombre'],
    [PRUEBAS_ANIO, anual.getId(), 'PRUEBAS - Clientes ' + PRUEBAS_ANIO],
  ]);
  planillas.getRange(1, 1, 1, 3).setFontWeight('bold');
  ensureHistorialSheet();

  mostrarDatosEntornoPruebas();
}

// Vuelve a mostrar lo que hay que copiar (token, planillas, usuarios).
function mostrarDatosEntornoPruebas() {
  const props = PropertiesService.getScriptProperties();
  const adminId = props.getProperty('ADMIN_SPREADSHEET_ID');
  if (!adminId) throw new Error('El entorno de pruebas no está instalado: ejecutá instalarEntornoPruebas().');
  const anual = getClientSpreadsheet(PRUEBAS_ANIO);
  Logger.log('════════ ENTORNO DE PRUEBAS LISTO ════════');
  Logger.log('Planilla de administración: https://docs.google.com/spreadsheets/d/' + adminId + '/edit');
  if (anual) Logger.log('Planilla de clientes ' + PRUEBAS_ANIO + ':  ' + anual.getUrl());
  Logger.log('VITE_API_TOKEN (para Vercel):  ' + props.getProperty('API_TOKEN'));
  Logger.log('Usuarios (PIN ' + PRUEBAS_PIN + ' para todos): ' +
    PRUEBAS_USUARIOS.map(function (u) { return u[0] + ' (' + u[1] + ')'; }).join(', '));
  Logger.log('Siguiente paso: Implementar → Nueva implementación → Aplicación web.');
}

function clientesFicticios_(mesIndex) {
  const nombres = ['Comercial', 'Ferretería', 'Distribuidora', 'Panadería', 'Transportes', 'Farmacia', 'Consultora', 'Librería'];
  const lugares = ['Sur', 'del Este', 'Ñandutí', 'Guaraní', 'Central', 'Paraná', 'Chaco', 'Ypacaraí'];
  const zonas = ['Centro', 'Norte', 'Sur', 'Este'];
  const barrios = ['San Vicente', 'Villa Morra', 'Recoleta', 'Sajonia', 'Trinidad'];
  const encargados = PRUEBAS_USUARIOS.map(function (u) { return u[0]; });
  const filas = [];
  for (let i = 0; i < PRUEBAS_CLIENTES_POR_MES; i++) {
    // Los meses anteriores al último quedan mayormente con documentación.
    const recibido = mesIndex < PRUEBAS_MESES.length - 1 ? i % 5 !== 0 : i % 3 === 0;
    const archivado = recibido && i % 4 === 0;
    const quien = encargados[i % encargados.length];
    filas.push([
      'Día ' + (((i * 3) % 25) + 1),
      'PRUEBA ' + nombres[i % nombres.length] + ' ' + lugares[(i * 3) % lugares.length] + ' ' + (i + 1) + ' S.A.',
      String(80000000 + i * 37),
      String(i % 10),
      i % 6 === 5 ? '' : 'CLAVE-FICTICIA-' + (i + 1),
      zonas[i % zonas.length],
      String(100 + i),
      barrios[i % barrios.length],
      'Contacto ' + (i + 1),
      '0981 ' + String(100000 + i * 13),
      'ACTIVO',
      i % 6 === 0 ? 'Cliente de prueba con IVA mensual' : '',
      recibido ? '\u2713' : '',
      recibido ? '\u2713 12 facturas' : '',
      '',
      recibido && i % 2 === 0 ? '\u2713' : '',
      '',
      archivado ? quien : '',
      i % 7 === 6 ? '' : quien,
    ]);
  }
  return filas;
}
