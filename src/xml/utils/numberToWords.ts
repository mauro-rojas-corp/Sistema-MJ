/**
 * Utility to convert numbers to words in Spanish (Guaraníes and US Dollars)
 * for official KuDE representation.
 */

const UNIDADES = [
  '',
  'UN',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
];

const DECENAS_10 = [
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
];

const DECENAS = [
  '',
  'DIEZ',
  'VEINTE',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];

const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

function convertGroup(n: number): string {
  let output = '';
  if (n === 100) return 'CIEN';

  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;

  if (c > 0) output += CENTENAS[c] + ' ';

  if (d === 1) {
    output += DECENAS_10[u];
  } else if (d === 2) {
    if (u === 0) output += 'VEINTE';
    else output += 'VEINTI' + UNIDADES[u];
  } else if (d > 2) {
    output += DECENAS[d];
    if (u > 0) output += ' Y ' + UNIDADES[u];
  } else if (u > 0) {
    output += UNIDADES[u];
  }

  return output.trim();
}

export function numberToWordsSpanish(
  amount: number,
  currency: string = 'PYG'
): string {
  if (isNaN(amount) || amount === 0) {
    return currency === 'USD'
      ? 'CERO DÓLARES AMERICANOS'
      : 'CERO GUARANÍES';
  }

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const entero = Math.floor(absAmount);
  const decimales = Math.round((absAmount - entero) * 100);

  let resultado = '';

  if (entero === 0) {
    resultado = 'CERO';
  } else {
    // Billions (Millardos)
    const billones = Math.floor(entero / 1000000000000);
    const milesMillones = Math.floor((entero % 1000000000000) / 1000000000);
    const millones = Math.floor((entero % 1000000000) / 1000000);
    const miles = Math.floor((entero % 1000000) / 1000);
    const unidades = entero % 1000;

    const partes: string[] = [];

    if (billones > 0) {
      partes.push(
        billones === 1 ? 'UN BILLÓN' : `${convertGroup(billones)} BILLONES`
      );
    }

    if (milesMillones > 0) {
      partes.push(
        milesMillones === 1
          ? 'MIL MILLONES'
          : `${convertGroup(milesMillones)} MIL MILLONES`
      );
    }

    if (millones > 0) {
      partes.push(
        millones === 1 ? 'UN MILLÓN' : `${convertGroup(millones)} MILLONES`
      );
    }

    if (miles > 0) {
      partes.push(miles === 1 ? 'MIL' : `${convertGroup(miles)} MIL`);
    }

    if (unidades > 0) {
      partes.push(convertGroup(unidades));
    }

    resultado = partes.join(' ');
  }

  if (isNegative) {
    resultado = 'MENOS ' + resultado;
  }

  if (currency === 'USD') {
    const centavosStr = decimales.toString().padStart(2, '0');
    return `${resultado} DÓLARES AMERICANOS CON ${centavosStr}/100 USD`;
  }

  return `${resultado} GUARANÍES`;
}
