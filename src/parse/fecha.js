// Parseo de fechas de extractos colombianos.
// Los bancos usan DD/MM/YYYY, pero también aparecen "15 ENE 2026", "15-ene-26"
// y a veces ISO. Ojo: DD/MM es la convención local, no MM/DD.

const MESES = {
  ene: 0, enero: 0, jan: 0, january: 0,
  feb: 1, febrero: 1, february: 1,
  mar: 2, marzo: 2, march: 2,
  abr: 3, abril: 3, apr: 3, april: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5, june: 5,
  jul: 6, julio: 6, july: 6,
  ago: 7, agosto: 7, aug: 7, august: 7,
  sep: 8, sept: 8, septiembre: 8, september: 8,
  oct: 9, octubre: 9, october: 9,
  nov: 10, noviembre: 10, november: 10,
  dic: 11, diciembre: 11, dec: 11, december: 11,
};

/**
 * Convierte texto a Date. Devuelve null si no se puede.
 * @param {string} bruto
 * @returns {Date|null}
 */
export function parseFecha(bruto) {
  if (bruto == null) return null;
  if (bruto instanceof Date) return Number.isNaN(bruto.getTime()) ? null : bruto;

  const s = String(bruto).trim();
  if (!s) return null;

  // ISO: 2026-01-15 (también 2026/01/15)
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return armar(+m[1], +m[2] - 1, +m[3]);

  // DD/MM/YYYY o DD-MM-YY
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const dia = +m[1];
    const mes = +m[2];
    // Si el primero no puede ser día pero el segundo sí, está en MM/DD.
    if (dia > 12 && mes <= 12) return armar(normAnio(+m[3]), mes - 1, dia);
    if (mes > 12 && dia <= 12) return armar(normAnio(+m[3]), dia - 1, mes);
    return armar(normAnio(+m[3]), mes - 1, dia); // ambiguo -> DD/MM (Colombia)
  }

  // 15 ENE 2026 / 15-ene-26 / 15 de enero de 2026
  m = s.match(/^(\d{1,2})\s*(?:de\s+)?[-\s/]?\s*([a-záéíóúñ]{3,10})\.?\s*(?:de\s+)?[-\s/]?\s*(\d{2,4})/i);
  if (m) {
    const mes = MESES[quitarTildes(m[2]).toLowerCase()];
    if (mes !== undefined) return armar(normAnio(+m[3]), mes, +m[1]);
  }

  // ENE 15 2026
  m = s.match(/^([a-záéíóúñ]{3,10})\.?\s+(\d{1,2}),?\s+(\d{2,4})/i);
  if (m) {
    const mes = MESES[quitarTildes(m[1]).toLowerCase()];
    if (mes !== undefined) return armar(normAnio(+m[3]), mes, +m[2]);
  }

  // DD/MM sin año (común en extractos de tarjeta): lo dejamos sin año,
  // quien llame decide con el periodo del extracto.
  return null;
}

function armar(anio, mes, dia) {
  if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null;
  const d = new Date(anio, mes, dia);
  // Rechaza 31/02 y compañía.
  if (d.getFullYear() !== anio || d.getMonth() !== mes || d.getDate() !== dia) return null;
  return d;
}

function normAnio(a) {
  if (a >= 100) return a;
  return a <= 70 ? 2000 + a : 1900 + a;
}

export function quitarTildes(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Clave "2026-01" para agrupar por mes. */
export function claveMes(fecha) {
  if (!fecha) return null;
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

/** Días entre dos fechas. */
export function diasEntre(a, b) {
  return Math.round((b - a) / 86400000);
}

export function nombreMes(clave) {
  const [a, m] = clave.split('-');
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${nombres[+m - 1]} ${a}`;
}
