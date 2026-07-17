// Parseo de montos en formato colombiano y anglosajón.
//
// El problema: "$1.234.567,89" (Colombia) y "$1,234,567.89" (US) usan los
// mismos dos símbolos con significados opuestos. Y "45.000" son cuarenta y
// cinco mil pesos, no cuarenta y cinco.

/**
 * Convierte un monto de texto a número.
 * Devuelve null si no hay nada parseable.
 *
 * @param {string|number} bruto
 * @returns {number|null}
 */
export function parseNumero(bruto) {
  if (bruto == null) return null;
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null;

  let s = String(bruto).trim();
  if (!s) return null;

  // "CR" marca abono en algunos extractos. Quitamos tildes primero: sin eso,
  // la É de "CRÉDITO" contaba como frontera de palabra y \bCR\b matcheaba,
  // volviendo negativo un cargo que decía "CREDITO".
  const plano = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const marcaCredito = /\bCR\b/.test(plano);

  // Fuera moneda, marcas y espacios. Lo que quede TIENE que ser el número.
  s = s.replace(/\bCOP\b|\bUSD\b|\bCR\b|\$/gi, '').replace(/\s/g, '');

  // Paréntesis contables. Antes se exigía que fueran el primer y último
  // carácter de la celda, así que "$(1.500)" y "(45.000) COP" perdían el signo.
  const enParentesis = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '');

  // El menos solo cuenta pegado al número, adelante o atrás. Antes se buscaba
  // en TODA la celda cruda: "NETFLIX-SUSCRIP 26.900" salía -26.900, o sea un
  // gasto convertido en abono por un guion del texto.
  const menosAdelante = s.startsWith('-');
  const menosAtras = s.endsWith('-');
  s = s.replace(/^-|-$/g, '');

  // Lo que sobra debe ser SOLO dígitos y separadores. Si queda cualquier otra
  // cosa, la celda no es un monto y devolvemos null en vez de adivinar: antes
  // se concatenaban todos los dígitos y "15-01 1.500" salía -15.011.500, un
  // número que no existe en ninguna parte.
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const negativo = enParentesis || menosAdelante || menosAtras || marcaCredito;

  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  let decimal = null;

  if (ultimaComa > -1 && ultimoPunto > -1) {
    // Están los dos: el que va de último es el decimal.
    decimal = ultimaComa > ultimoPunto ? ',' : '.';
  } else if (ultimaComa > -1) {
    decimal = esSeparadorDecimal(s, ',') ? ',' : null;
  } else if (ultimoPunto > -1) {
    decimal = esSeparadorDecimal(s, '.') ? '.' : null;
  }

  let limpio;
  if (decimal === ',') {
    limpio = s.replace(/\./g, '').replace(',', '.');
  } else if (decimal === '.') {
    limpio = s.replace(/,/g, '');
  } else {
    // Sin decimales: todo separador es de miles.
    limpio = s.replace(/[.,]/g, '');
  }

  const n = Number.parseFloat(limpio);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

// Un separador es decimal si aparece una sola vez y deja 1 o 2 dígitos detrás.
// "45.000" -> 3 dígitos detrás -> separador de miles.
// "45,00"  -> 2 dígitos detrás y único -> decimal.
// "1.234.567" -> aparece 2 veces -> miles.
function esSeparadorDecimal(s, sep) {
  const veces = s.split(sep).length - 1;
  if (veces !== 1) return false;
  const detras = s.length - s.lastIndexOf(sep) - 1;
  return detras >= 1 && detras <= 2;
}

/**
 * Parsea una TASA, que no se lee igual que la plata.
 *
 * `parseNumero` asume que una coma con más de 2 dígitos detrás es separador de
 * miles, porque en plata eso es cierto: "45.000" son cuarenta y cinco mil. Pero
 * los extractos imprimen las tasas con 4 decimales — "28,7548 %" — y esa regla
 * las destroza: 28,7548 se volvía 287.548.
 *
 * Aquí el último separador SIEMPRE es decimal: una tasa nunca pasa de tres
 * dígitos enteros, así que no hay miles que separar.
 *
 * @param {string|number} bruto
 * @returns {number|null} fracción (28,7548 % -> 0.287548)
 */
export function parseTasa(bruto) {
  if (bruto == null) return null;
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto / 100 : null;

  let s = String(bruto).trim().replace(/%/g, '').trim();
  s = s.replace(/[^\d.,-]/g, '');
  if (!s || !/\d/.test(s)) return null;

  const ultimo = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (ultimo > -1) {
    s = s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + s.slice(ultimo + 1);
  }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

/** Formatea un número como pesos colombianos. */
export function formatoCOP(n, { decimales = 0 } = {}) {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);
}

/** Formatea una fracción (0.2534) como porcentaje ("25,34%"). */
export function formatoPct(f, { decimales = 2 } = {}) {
  if (f == null || !Number.isFinite(f)) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'percent',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(f);
}
