// Motor de avances: lo que cuesta sacar plata en efectivo de la tarjeta.
//
// El avance es de los peores negocios que ofrece una tarjeta y el que menos se
// entiende. Sacar $500.000 en el cajero no es "usar tu cupo": es un préstamo
// que arranca a cobrar interés desde el segundo uno (sin el mes de gracia de
// las compras) MÁS una comisión fija por el solo hecho de sacarlo.
//
// La app ya contaba esos cargos en el costo de la deuda. Lo que no hacía era
// juntarlos y ponerles nombre: decirte que esos $38.700 fueron por UN retiro de
// $500.000 — un 7,7% que pagaste al instante, antes de que corriera un solo día
// de interés futuro. Ese número, junto al retiro que lo causó, es el punto.

import { POR_CLAVE } from '../datos/cargos.js';

/**
 * @param {object} interes  el resultado de analizarInteres (necesita .grupos)
 * @returns {object|null} null si no hubo avances
 */
export function analizarAvances(interes) {
  if (!interes?.grupos) return null;

  const g = (clave) => interes.grupos.find((x) => x.clave === clave) || null;

  const capital = g('avance');
  if (!capital || capital.total <= 0) return null;

  const comision = g('comision_avance');
  const interesAvance = g('interes_avance');

  const montoRetirado = capital.total;
  const comisionTotal = comision?.total || 0;
  const interesTotal = interesAvance?.total || 0;
  // Lo que el avance te costó ESTE mes: comisión (una vez) + el interés que ya
  // corrió. No incluye el interés de los meses que faltan — ese llega después.
  const costoEsteMes = comisionTotal + interesTotal;

  return {
    conteo: capital.conteo,
    montoRetirado,
    comisionTotal,
    interesTotal,
    costoEsteMes,
    // El golpe: qué fracción del retiro se te fue de una, solo en cargos.
    proporcionInstantanea: montoRetirado > 0 ? costoEsteMes / montoRetirado : 0,
    // Solo comisión, sin intereses: el peaje fijo por sacar la plata.
    proporcionComision: montoRetirado > 0 ? comisionTotal : 0,
    items: capital.items || [],
    ayudaComision: POR_CLAVE.comision_avance?.ayuda,
    ayudaInteres: POR_CLAVE.interes_avance?.ayuda,
  };
}
