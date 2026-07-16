// Normalización de texto para hacer match de patrones.
// Los extractos vienen en MAYÚSCULAS, sin tildes, con espacios raros,
// y con basura pegada: "NETFLIX.COM      1234 SAO PAULO BR".

/**
 * Baja a minúsculas, quita tildes, colapsa espacios.
 * Se usa para nombres de columna.
 */
export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza una descripción de transacción para buscar comercios/cargos.
 * Deja MAYÚSCULAS y sin tildes, que es como matchean los patrones.
 */
export function normalizarDescripcion(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ¿La descripción contiene el patrón como palabra(s) completa(s)?
 * Evita que "IVA" matchee dentro de "PRIVADA" o "SEGURO" dentro de "ASEGURADORA".
 */
export function contienePatron(descripcionNorm, patron) {
  const p = normalizarDescripcion(patron);
  if (!p) return false;
  const escapado = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // \b no sirve con puntos ("NETFLIX.COM"), así que usamos límites laxos:
  // inicio/fin de cadena o cualquier cosa que no sea letra/dígito.
  // Los espacios del patrón matchean cualquier separador real del extracto:
  // "APPLE COM BILL" tiene que pegar con "APPLE.COM/BILL".
  const cuerpo = escapado.replace(/\s+/g, '[^A-Z0-9]+');
  const re = new RegExp(`(^|[^A-Z0-9])${cuerpo}([^A-Z0-9]|$)`);
  return re.test(descripcionNorm);
}

/**
 * Limpia una descripción para mostrarla: quita números de referencia largos,
 * ciudades/países pegados al final y relleno.
 */
export function descripcionBonita(s) {
  let d = normalizarDescripcion(s);
  d = d.replace(/\b\d{6,}\b/g, '').replace(/\s+/g, ' ').trim();
  return d || String(s ?? '').trim();
}
