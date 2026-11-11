// Ambientaciones por época del año (decoración opcional de cada usuario).
// Sólo cambian acentos y adornos: los colores de vencimiento, los estados y
// los datos se ven siempre igual.
//
// Fechas de Paraguay (hemisferio sur). En "Automática" las fechas especiales
// tienen prioridad sobre la estación del año.

export const AMBIENTE_NINGUNA = 'ninguna';
export const AMBIENTE_AUTOMATICA = 'automatica';

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano).
export function domingoDePascua(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const md = (fecha) => (fecha.getMonth() + 1) * 100 + fecha.getDate(); // 1225 = 25/12
const entre = (fecha, desde, hasta) => {
  const v = md(fecha);
  return desde <= hasta ? v >= desde && v <= hasta : v >= desde || v <= hasta;
};
function enSemanaSanta(fecha) {
  const pascua = domingoDePascua(fecha.getFullYear());
  const ramos = new Date(pascua);
  ramos.setDate(pascua.getDate() - 7);
  const dia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  return dia >= ramos && dia <= pascua;
}

// particula: lo que cae (o sube) unos segundos al ingresar.
export const AMBIENTES = [
  {
    id: 'navidad',
    nombre: 'Navidad',
    grupo: 'fecha',
    emoji: '🎄',
    periodo: '1 al 26 de diciembre',
    saludo: '¡Felices fiestas',
    particula: { simbolos: ['❄', '❄', '✦'], direccion: 'cae' },
    activa: (f) => entre(f, 1201, 1226),
  },
  {
    id: 'anio-nuevo',
    nombre: 'Año Nuevo',
    grupo: 'fecha',
    emoji: '🥂',
    periodo: '27 de diciembre al 2 de enero',
    saludo: '¡Feliz Año Nuevo',
    particula: { confeti: ['#d4a72c', '#c0c4cc', '#e8c766', '#8a6d1d'], direccion: 'cae' },
    activa: (f) => entre(f, 1227, 102),
  },
  {
    id: 'semana-santa',
    nombre: 'Semana Santa',
    grupo: 'fecha',
    emoji: '🕊️',
    periodo: 'Domingo de Ramos a Pascua',
    saludo: '¡Felices Pascuas',
    particula: { simbolos: ['🕊️'], direccion: 'flota', cantidad: 6 },
    activa: enSemanaSanta,
  },
  {
    id: 'independencia',
    nombre: 'Independencia',
    grupo: 'fecha',
    emoji: '⭐',
    periodo: '10 al 15 de mayo',
    saludo: '¡Felices fiestas patrias',
    particula: { confeti: ['#d52b1e', '#ffffff', '#0038a8'], direccion: 'cae' },
    activa: (f) => entre(f, 510, 515),
  },
  {
    id: 'san-juan',
    nombre: 'San Juan',
    grupo: 'fecha',
    emoji: '🔥',
    periodo: '16 al 30 de junio',
    saludo: '¡Feliz San Juan',
    particula: { brasas: ['#ff8a1f', '#ffb347', '#e8541c'], direccion: 'sube' },
    activa: (f) => entre(f, 616, 630),
  },
  {
    id: 'verano',
    nombre: 'Verano',
    grupo: 'estacion',
    emoji: '☀️',
    periodo: '21 de diciembre al 20 de marzo',
    saludo: '¡Feliz verano',
    particula: { brasas: ['#ffd25c', '#ffe9a3', '#ffb800'], direccion: 'sube' },
    activa: (f) => entre(f, 1221, 320),
  },
  {
    id: 'otono',
    nombre: 'Otoño',
    grupo: 'estacion',
    emoji: '🍂',
    periodo: '21 de marzo al 20 de junio',
    saludo: '¡Feliz otoño',
    particula: { simbolos: ['🍂', '🍁', '🍂'], direccion: 'cae' },
    activa: (f) => entre(f, 321, 620),
  },
  {
    id: 'invierno',
    nombre: 'Invierno',
    grupo: 'estacion',
    emoji: '❄️',
    periodo: '21 de junio al 20 de septiembre',
    saludo: '¡Feliz invierno',
    particula: { simbolos: ['❄', '❄', '❅'], direccion: 'cae' },
    activa: (f) => entre(f, 621, 920),
  },
  {
    id: 'primavera',
    nombre: 'Primavera',
    grupo: 'estacion',
    emoji: '🌸',
    periodo: '21 de septiembre al 20 de diciembre',
    saludo: '¡Feliz primavera',
    particula: { simbolos: ['🌸', '🌼', '🌸'], direccion: 'cae' },
    activa: (f) => entre(f, 921, 1220),
  },
];

export const AMBIENTE_POR_ID = Object.fromEntries(AMBIENTES.map((a) => [a.id, a]));
export const IDS_VALIDOS = [AMBIENTE_NINGUNA, AMBIENTE_AUTOMATICA, ...AMBIENTES.map((a) => a.id)];

// Ambientación que toca hoy en modo automático: primero las fechas
// especiales, después la estación.
export function ambienteDeFecha(fecha = new Date()) {
  return (
    AMBIENTES.find((a) => a.grupo === 'fecha' && a.activa(fecha)) ||
    AMBIENTES.find((a) => a.grupo === 'estacion' && a.activa(fecha)) ||
    null
  );
}

// Lo que el usuario eligió → ambientación a mostrar (o null).
export function resolverAmbiente(eleccion, fecha = new Date()) {
  if (eleccion === AMBIENTE_AUTOMATICA) return ambienteDeFecha(fecha);
  return AMBIENTE_POR_ID[eleccion] || null;
}
