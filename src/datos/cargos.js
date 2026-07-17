// Patrones de cargos financieros en extractos colombianos.
//
// El orden IMPORTA: se evalúa de arriba hacia abajo y gana el primero que
// matchee. Por eso "INTERES DE MORA" va antes que "INTERES" a secas, y
// "COMISION AVANCE" antes que "COMISION".
//
// `esInteres: true`  -> es costo puro de tener deuda.
// `esCargo: true`    -> es una tarifa/impuesto que igual te descuenta plata.
//
// ¿Falta el cargo de tu banco? Agrégalo aquí y manda un PR. Ver CONTRIBUTING.md

export const CARGOS = [
  {
    clave: 'interes_mora',
    etiqueta: 'Intereses de mora',
    esInteres: true,
    ayuda: 'Te los cobran por pagar tarde. Es la tasa más cara que existe.',
    patrones: [
      'INTERESES DE MORA', 'INTERES DE MORA', 'INTERESES MORA', 'INTERES MORA',
      'INT MORA', 'INTERES MORATORIO', 'INTERESES MORATORIOS', 'INT MORATORIO',
    ],
  },
  {
    clave: 'interes_avance',
    etiqueta: 'Intereses de avances',
    esInteres: true,
    ayuda: 'Los avances generan interés desde el día uno. No tienen periodo de gracia.',
    patrones: [
      'INTERESES DE AVANCE', 'INTERES DE AVANCE', 'INTERESES AVANCES', 'INTERES AVANCE',
      'INT AVANCE', 'INTERES POR AVANCE', 'INTERESES AVANCE',
    ],
  },
  {
    clave: 'interes_corriente',
    etiqueta: 'Intereses corrientes',
    esInteres: true,
    ayuda: 'El interés por no pagar el total de la tarjeta. Se calcula sobre el saldo que quedó debiendo.',
    patrones: [
      'INTERESES CORRIENTES', 'INTERES CORRIENTE', 'INTERES CTE', 'INT CORRIENTE', 'INT CTE',
      'INTERESES DE FINANCIACION', 'INTERES DE FINANCIACION', 'INTERES FINANCIACION',
      'INTERESES FINANCIACION', 'INTERES ROTATIVO', 'INTERESES ROTATIVO',
      'INTERESES DE COMPRAS', 'INTERES COMPRAS', 'INTERESES CREDITO',
      'INTERES CORRIENTE COMPRAS', 'CAUSACION INTERESES', 'INTERESES CAUSADOS',
    ],
  },
  {
    clave: 'interes_sobregiro',
    etiqueta: 'Intereses de sobregiro',
    esInteres: true,
    ayuda: 'Gastaste más de lo que tenías en la cuenta y el banco te prestó — carísimo.',
    patrones: ['INTERES SOBREGIRO', 'INTERESES SOBREGIRO', 'INTERES DE SOBREGIRO', 'SOBREGIRO'],
  },
  {
    clave: 'mora_penalidad',
    etiqueta: 'Cargos por mora y cobranza',
    esCargo: true,
    ayuda: 'Multas y honorarios por atraso, aparte de los intereses de mora.',
    patrones: [
      'CARGO POR MORA', 'PAGO TARDIO', 'SANCION POR MORA', 'GASTOS DE COBRANZA',
      'HONORARIOS DE COBRANZA', 'HONORARIOS COBRANZA', 'GASTOS COBRANZA', 'CUOTA POR MORA',
    ],
  },
  {
    clave: 'comision_avance',
    etiqueta: 'Comisión por avances',
    esCargo: true,
    ayuda: 'La tarifa fija por sacar plata en efectivo de la tarjeta de crédito.',
    patrones: [
      'COMISION POR AVANCE', 'COMISION AVANCE', 'COMISION DE AVANCE',
      'AVANCE CAJERO', 'AVANCE EN CAJERO', 'CUOTA AVANCE', 'TARIFA AVANCE',
    ],
  },
  {
    clave: 'comision_internacional',
    etiqueta: 'Comisión por compras internacionales',
    esCargo: true,
    esFX: true,
    ayuda: 'Lo que te cobra el banco por cada compra en dólares. Encarece tus suscripciones gringas.',
    patrones: [
      'COMISION TRANSACCION INTERNACIONAL', 'COMISION COMPRA INTERNACIONAL',
      'COMISION POR TRANSACCION INTERNACIONAL', 'COMISION INTERNACIONAL',
      'TARIFA INTERNACIONAL', 'COMISION DIVISA', 'COMISION POR CAMBIO',
      'CARGO INTERNACIONAL', 'FEE INTERNACIONAL', 'COMISION EXTERIOR',
    ],
  },
  {
    clave: 'cuota_manejo',
    etiqueta: 'Cuota de manejo',
    esCargo: true,
    ayuda: 'Lo que pagas solo por tener el plástico, uses la tarjeta o no.',
    patrones: [
      'CUOTA DE MANEJO TARJETA', 'CUOTA DE MANEJO', 'CUOTA MANEJO', 'MANEJO TARJETA',
      'TARIFA DE MANEJO', 'CUOTA DE ADMINISTRACION', 'CUOTA ADMINISTRACION',
      'CUOTA MENSUAL TARJETA', 'CUOTA DE MANEJO CUENTA',
    ],
  },
  {
    clave: 'seguro_deuda',
    etiqueta: 'Seguros asociados',
    esCargo: true,
    revisar: true, // suele dar falsos positivos: puede ser un seguro que sí quieres
    ayuda: 'Seguro de vida deudores y pólizas pegadas al crédito. Muchas veces ni sabías que las tenías.',
    patrones: [
      'SEGURO DE VIDA DEUDORES', 'VIDA DEUDORES', 'SEGURO DEUDORES', 'SEGURO VIDA DEUDOR',
      'PRIMA SEGURO', 'POLIZA', 'AMPARO', 'SEGURO DE FRAUDE', 'SEGURO TARJETA',
      'ASISTENCIA TARJETA', 'PLAN DE PROTECCION', 'PROTECCION DE COMPRAS',
    ],
  },
  {
    clave: 'gmf',
    etiqueta: '4x1000 (GMF)',
    esCargo: true,
    esGMF: true, // si el extracto lo trae, no lo estimamos otra vez (ver separarGMF)
    ayuda: 'El impuesto a los movimientos financieros: $4 por cada $1.000 que sacas.',
    patrones: [
      'GRAVAMEN A LOS MOVIMIENTOS FINANCIEROS', 'GRAVAMEN MOVIMIENTOS FINANCIEROS',
      'GRAVAMEN MOVIMIENTOS', 'IMPUESTO 4X1000', 'IMPUESTO 4 X 1000',
      'GRAVAMEN FINANCIERO', '4X1000', '4 X 1000', 'GMF',
    ],
  },
  {
    clave: 'iva',
    etiqueta: 'IVA sobre cargos',
    esCargo: true,
    ayuda: 'El 19% que se le suma a las comisiones y cuotas de manejo.',
    patrones: ['IVA', 'I V A', 'IMPUESTO AL VALOR AGREGADO', 'IMPUESTO SOBRE VENTAS', 'IVA COMISION'],
  },
  {
    clave: 'comision_cajero',
    etiqueta: 'Comisiones de cajero',
    esCargo: true,
    ayuda: 'Retiros en cajeros de otra red. Plata regalada por afán.',
    patrones: [
      'COMISION CAJERO', 'COMISION POR RETIRO', 'RETIRO OTRO BANCO', 'RETIRO OTRAS REDES',
      'CUOTA RETIRO', 'TARIFA RETIRO', 'COMISION RED', 'USO CAJERO',
    ],
  },
  {
    clave: 'comision_otra',
    etiqueta: 'Otras comisiones y tarifas',
    esCargo: true,
    ayuda: 'Comisiones sueltas: transferencias, chequeras, certificaciones, consultas.',
    patrones: [
      'COMISION POR TRANSFERENCIA', 'COMISION TRANSFERENCIA', 'CUOTA DE TRANSFERENCIA',
      'CARGO POR SERVICIO', 'TARIFA SERVICIO', 'COMISIONES', 'COMISION', 'TARIFA',
      'CUOTA DE SERVICIO', 'CARGO ADMINISTRATIVO',
    ],
  },
  {
    clave: 'avance',
    etiqueta: 'Avances en efectivo',
    esPrincipal: true, // no es un cargo: es el capital que te prestaste
    ayuda: 'El monto que sacaste en efectivo. No es un cargo, pero es lo que dispara los intereses de avance.',
    patrones: ['AVANCE EN EFECTIVO', 'AVANCE DE EFECTIVO', 'DISPOSICION DE EFECTIVO', 'AVANCE'],
  },
];

/** Cargos que cuentan como "costo de la deuda". */
export const CLAVES_COSTO = CARGOS.filter((c) => c.esInteres || c.esCargo).map((c) => c.clave);

export const POR_CLAVE = Object.fromEntries(CARGOS.map((c) => [c.clave, c]));
