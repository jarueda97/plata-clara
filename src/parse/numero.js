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

  // Negativos: signo menos, o paréntesis contables "(1.500)".
  const enParentesis = /^\(.*\)$/.test(s);
  const conMenos = /-/.test(s);
  const marcaCredito = /\bCR\b/i.test(s); // algunos extractos marcan abonos con CR
  const negativo = enParentesis || conMenos || marcaCredito;

  // Fuera todo lo que no sea dígito o separador.
  s = s.replace(/[^\d.,]/g, '');
  if (!s || !/\d/.test(s)) return null;

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
