// Constantes tributarias y tarifas típicas de Colombia.
//
// Todas son EDITABLES desde la interfaz, porque cambian por banco y por año.
// Aquí solo viven los valores por defecto.

export const TARIFAS = {
  // IVA general en Colombia. Se aplica sobre comisiones y cuotas de manejo.
  iva: 0.19,

  // Gravamen a los Movimientos Financieros: $4 por cada $1.000 debitado.
  // Solo aplica a cuentas de ahorro/corriente que superen la exención,
  // no a las compras con tarjeta de crédito.
  gmf: 0.004,

  // Comisión típica por transacción internacional. Varía por banco
  // (aprox. 2%–3% + IVA). Es un valor por defecto, no una promesa.
  comisionInternacional: 0.03,

  // Spread estimado entre la TRM oficial y la tasa que aplica el banco/franquicia.
  // También varía. Sirve para estimar cuánto de más pagas por facturar en dólares.
  spreadTRM: 0.02,
};

// La tasa de usura la fija la Superfinanciera y cambia CADA MES.
// No la quemamos en el código porque quedaría desactualizada y mentiría.
// El usuario la escribe y le dejamos el link para verificarla.
export const USURA = {
  valor: null,
  fuente: 'https://www.superfinanciera.gov.co/publicaciones/60955/tasas-de-interes-bancario-corriente-60955/',
  nota: 'La Superfinanciera publica la tasa de usura cada mes. Consúltala y escríbela para comparar.',
};

export const SUPUESTOS_MINIMO = {
  // Porcentaje del saldo que suele pedir el pago mínimo en tarjetas colombianas.
  porcentajeMinimo: 0.05,
  // Piso en pesos: casi ninguna tarjeta pide menos de esto.
  pisoMinimo: 30000,
  // Corte de la simulación.
  maxMeses: 600,
};
