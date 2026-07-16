// Plata Clara — interfaz.
// Todo el trabajo pasa acá, en tu navegador. No hay red de por medio.

import { parseNumero, formatoCOP, formatoPct } from './src/parse/numero.js';
import { claveMes, nombreMes } from './src/parse/fecha.js';
import { parsearCSV, detectarEncabezados, filasATransacciones, sugiereInvertirSigno } from './src/parse/csv.js';
import { transaccionesDePDF } from './src/parse/pdf.js';
import { CARGOS, POR_CLAVE } from './src/datos/cargos.js';
import { TARIFAS } from './src/datos/tarifas.js';
import { analizarInteres, clasificarCargo, estimarEA, compararUsura } from './src/motor/interes.js';
import { analizarSuscripciones, identificarComercio, pareceRecurrente } from './src/motor/suscripciones.js';
import { simularMinimo, simularCuotaFija, equivalencia } from './src/motor/minimo.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// --- Estado ---------------------------------------------------------------
const estado = {
  transacciones: [],
  excluidos: new Set(),   // el usuario dijo "esto no cuenta"
  extras: new Set(),      // el usuario dijo "esto sí es suscripción"
  forzados: new Map(),    // id -> clave de cargo corregida a mano
  invertido: false,
  resultado: null,
};

// --- Carga de archivos ----------------------------------------------------

const zona = $('#zona');
const inputArchivo = $('#input-archivo');

zona.addEventListener('click', () => inputArchivo.click());
zona.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputArchivo.click(); }
});
$('#btn-elegir').addEventListener('click', (e) => { e.stopPropagation(); inputArchivo.click(); });
inputArchivo.addEventListener('change', (e) => cargarArchivos([...e.target.files]));

['dragenter', 'dragover'].forEach((ev) =>
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('activa'); }));
['dragleave', 'drop'].forEach((ev) =>
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('activa'); }));
zona.addEventListener('drop', (e) => cargarArchivos([...e.dataTransfer.files]));

async function cargarArchivos(archivos) {
  if (!archivos.length) return;
  limpiarErrores();

  const todas = [];
  const problemas = [];

  for (const f of archivos) {
    try {
      const esPDF = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      const r = esPDF ? await transaccionesDePDF(f) : await leerCSV(f);
      if (!r.transacciones.length) {
        problemas.push(`${f.name}: no encontramos movimientos que podamos leer.`);
      } else {
        todas.push(...r.transacciones);
      }
    } catch (err) {
      problemas.push(`${f.name}: ${err.message}`);
    }
  }

  if (!todas.length) {
    mostrarError(problemas.length
      ? problemas.join(' ')
      : 'No pudimos leer nada. ¿Seguro que es el extracto?');
    return;
  }
  if (problemas.length) mostrarError(problemas.join(' '));

  estado.transacciones = todas.sort((a, b) => a.fecha - b.fecha);
  estado.excluidos = new Set();
  estado.extras = new Set();
  estado.forzados = new Map();
  estado.invertido = false;

  mostrarRevision();
}

async function leerCSV(file) {
  const texto = await file.text();
  const { filas } = parsearCSV(texto);
  const enc = detectarEncabezados(filas);
  if (!enc) {
    throw new Error('no reconocimos las columnas. Necesitamos al menos una de fecha y una de valor.');
  }
  return filasATransacciones(filas, enc.mapa, { filaEncabezado: enc.fila, origen: file.name });
}

// --- Pantalla de revisión -------------------------------------------------

function mostrarRevision() {
  $('#pantalla-entrada').hidden = true;
  $('#pantalla-resultados').hidden = true;
  $('#pantalla-revision').hidden = false;

  const tx = estado.transacciones;
  const meses = [...new Set(tx.map((t) => claveMes(t.fecha)))].sort();
  const rango = meses.length === 1
    ? nombreMes(meses[0])
    : `${nombreMes(meses[0])} a ${nombreMes(meses[meses.length - 1])}`;

  $('#resumen-lectura').textContent =
    `${tx.length} movimientos · ${rango}` +
    (meses.length === 1
      ? ' · con un solo mes detectamos suscripciones por nombre de comercio; con dos o más también por repetición.'
      : ` · ${meses.length} meses, suficiente para detectar cobros que se repiten.`);

  $('#aviso-signo').hidden = !sugiereInvertirSigno(tx);

  pintarTablaRevision();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function pintarTablaRevision() {
  const tbody = $('#tabla-revision tbody');
  tbody.innerHTML = '';

  for (const t of estado.transacciones) {
    const tr = document.createElement('tr');
    const excluido = estado.excluidos.has(t.id);
    if (excluido) tr.classList.add('apagada');

    const cargo = estado.forzados.has(t.id)
      ? { clave: estado.forzados.get(t.id), etiqueta: POR_CLAVE[estado.forzados.get(t.id)].etiqueta }
      : clasificarCargo(t.descripcion);
    const comercio = cargo ? null : identificarComercio(t.descripcion);
    const sospecha = !cargo && !comercio && pareceRecurrente(t.descripcion);

    tr.innerHTML = `
      <td>${t.fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</td>
      <td class="celda-desc"><span class="desc-texto" title="${escapar(t.descripcion)}">${escapar(t.descripcion)}</span></td>
      <td class="num">${formatoCOP(t.valor)}</td>
      <td>${etiquetaDe(t, cargo, comercio, sospecha)}</td>
      <td class="centro">
        <input type="checkbox" ${excluido ? '' : 'checked'} data-id="${t.id}"
               aria-label="Contar este movimiento">
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.id;
      if (cb.checked) estado.excluidos.delete(id); else estado.excluidos.add(id);
      cb.closest('tr').classList.toggle('apagada', !cb.checked);
    });
  });

  tbody.querySelectorAll('select[data-forzar]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const id = sel.dataset.forzar;
      if (sel.value === '') { estado.forzados.delete(id); estado.extras.delete(id); }
      else if (sel.value === '__sub') { estado.forzados.delete(id); estado.extras.add(id); }
      else { estado.forzados.set(id, sel.value); estado.extras.delete(id); }
    });
  });
}

function etiquetaDe(t, cargo, comercio, sospecha) {
  if (t.valor < 0) return '<span class="pastilla pastilla-neutra">Abono (entra plata)</span>';

  if (cargo) {
    const def = POR_CLAVE[cargo.clave];
    const clase = def?.esInteres ? 'pastilla-interes' : 'pastilla-cargo';
    const alerta = def?.revisar ? ' <span class="control-nota">¿seguro?</span>' : '';
    return `<span class="pastilla ${clase}">${escapar(cargo.etiqueta)}</span>${alerta}`;
  }
  if (comercio) {
    const usd = comercio.moneda === 'USD' ? ' <span class="pastilla pastilla-usd">USD</span>' : '';
    return `<span class="pastilla pastilla-sub">${escapar(comercio.nombre)}</span>${usd}`;
  }
  if (sospecha) {
    return '<span class="pastilla pastilla-sub">Posible suscripción</span>';
  }
  // Compra normal: le damos al usuario la opción de reclasificarla.
  return selectorReclasificar(t.id);
}

function selectorReclasificar(id) {
  const opciones = CARGOS
    .filter((c) => c.esInteres || c.esCargo)
    .map((c) => `<option value="${c.clave}">${escapar(c.etiqueta)}</option>`)
    .join('');
  return `<select data-forzar="${id}" class="selector-mini">
    <option value="">Compra normal</option>
    <option value="__sub">Es una suscripción</option>
    ${opciones}
  </select>`;
}

$('#btn-invertir').addEventListener('click', () => {
  estado.invertido = !estado.invertido;
  estado.transacciones = estado.transacciones.map((t) => ({ ...t, valor: -t.valor }));
  $('#aviso-signo').hidden = true;
  pintarTablaRevision();
});

$('#btn-reiniciar').addEventListener('click', reiniciar);
$('#btn-otro').addEventListener('click', reiniciar);
$('#btn-volver').addEventListener('click', mostrarRevision);

function reiniciar() {
  estado.transacciones = [];
  estado.resultado = null;
  inputArchivo.value = '';
  $('#pantalla-revision').hidden = true;
  $('#pantalla-resultados').hidden = true;
  $('#pantalla-entrada').hidden = false;
  limpiarErrores();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Análisis -------------------------------------------------------------

$('#btn-analizar').addEventListener('click', analizar);

function tarifasActuales() {
  return {
    ...TARIFAS,
    comisionInternacional: (parseFloat($('#comision-intl').value) || 0) / 100,
    spreadTRM: (parseFloat($('#spread-trm').value) || 0) / 100,
  };
}

function analizar() {
  const esCuentaDebito = $('#tipo-cuenta').value === 'debito';
  const tarifas = tarifasActuales();

  // separarFX saca las comisiones internacionales del costo de la deuda y se
  // las pasa a suscripciones, que es donde pertenecen. Si no, esas comisiones
  // se contarían dos veces: una en cada tarjeta.
  const interes = analizarInteres(estado.transacciones, {
    excluidos: estado.excluidos,
    forzados: estado.forzados,
    separarFX: true,
  });
  const subs = analizarSuscripciones(estado.transacciones, {
    excluidos: estado.excluidos,
    extras: estado.extras,
    comisionesFX: interes.cargosFX,
    tarifas,
    esCuentaDebito,
  });

  estado.resultado = { interes, subs, tarifas, esCuentaDebito };
  pintarResultados();
}

function pintarResultados() {
  const { interes, subs } = estado.resultado;

  $('#pantalla-revision').hidden = true;
  $('#pantalla-resultados').hidden = false;

  const meses = [...new Set(estado.transacciones.map((t) => claveMes(t.fecha)))].sort();
  $('#periodo-texto').textContent = meses.length === 1 ? `en ${nombreMes(meses[0])}` : `en ${meses.length} meses`;
  $('#resumen-periodo').textContent =
    `${estado.transacciones.length - estado.excluidos.size} movimientos contados` +
    (estado.excluidos.size ? ` · ${estado.excluidos.size} que descartaste` : '');

  pintarInteres(interes);
  pintarSubs(subs);
  pintarGolpe(interes, subs);
  pintarOculto(subs);
  pintarCategorias(subs);
  pintarDeuda(interes);
  prepararSimulador(interes);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function pintarInteres(r) {
  $('#cifra-interes').textContent = formatoCOP(r.costoTotal);

  if (r.costoTotal === 0) {
    $('#pie-interes').textContent = 'No encontramos intereses ni cargos. O estás al día, o tu extracto los nombra distinto — revisá la tabla.';
    $('#desglose-interes').innerHTML = '';
    return;
  }

  const pctOculto = Math.round(r.proporcionOculta * 100);
  $('#pie-interes').innerHTML = r.totalCargos > 0
    ? `Solo <strong>${formatoCOP(r.totalIntereses)}</strong> son "intereses". El otro ${pctOculto}% son cuotas, seguros e impuestos.`
    : 'Todo son intereses puros.';

  $('#desglose-interes').innerHTML = r.grupos
    .filter((g) => !g.esPrincipal)
    .slice(0, 6)
    .map((g) => `<div class="desglose-fila"><span>${escapar(g.etiqueta)}</span><span>${formatoCOP(g.total)}</span></div>`)
    .join('');
}

function pintarSubs(r) {
  $('#cifra-subs').textContent = formatoCOP(r.costoRealTotal);

  if (!r.comercios.length) {
    $('#pie-subs').textContent = 'No reconocimos ninguna suscripción. Si sabés que tenés, marcalas en la tabla y volvé a analizar.';
    $('#desglose-subs').innerHTML = '';
    return;
  }

  $('#pie-subs').innerHTML = r.recargosTotal > 0
    ? `Los cargos suman ${formatoCOP(r.cobradoTotal)}, más <strong>${formatoCOP(r.recargosTotal)}</strong> en comisiones internacionales que el banco cobra aparte.`
    : `${r.comercios.length} suscripciones detectadas.`;

  $('#desglose-subs').innerHTML = [
    ...r.comercios.slice(0, 5).map((c) =>
      `<div class="desglose-fila"><span>${escapar(c.nombre)}</span><span>${formatoCOP(c.costoReal)}</span></div>`),
    `<div class="desglose-fila fuerte"><span>Proyección a 12 meses</span><span>${formatoCOP(r.anualTotal)}</span></div>`,
  ].join('');
}

function pintarGolpe(interes, subs) {
  const total = interes.costoTotal + subs.costoRealTotal;
  const el = $('#golpe');
  if (total <= 0) { el.hidden = true; return; }

  const eq = equivalencia(total);
  const anual = interes.costoTotal * 12 + subs.anualTotal;

  el.hidden = false;
  el.innerHTML =
    `Entre intereses y suscripciones se te fueron <strong>${formatoCOP(total)}</strong>` +
    (eq ? ` — unos ${eq.cantidad} ${eq.nombre} ${eq.emoji}` : '') +
    `. Si el mes se repite igual, son <strong>${formatoCOP(anual)}</strong> al año.`;
}

function pintarOculto(r) {
  const bloque = $('#bloque-oculto');
  const enUSD = r.enDolares.filter((c) => c.recargos.total > 0);
  if (!enUSD.length) { bloque.hidden = true; return; }
  bloque.hidden = false;

  $('#tabla-oculto tbody').innerHTML = enUSD.map((c) => `
    <tr>
      <td>
        ${escapar(c.nombre)}
        ${c.recargos.estimado ? '<div class="control-nota">comisión estimada</div>' : '<div class="control-nota">comisión real del extracto</div>'}
      </td>
      <td class="num">${formatoCOP(c.cobrado)}</td>
      <td class="num">+${formatoCOP(c.recargos.comisionIntl + c.recargos.ivaComision)}</td>
      <td class="num"><strong>${formatoCOP(c.costoReal)}</strong></td>
      <td class="num">${formatoCOP(c.recargos.spreadIncluido)}</td>
      <td class="num">${formatoCOP(c.anual)}</td>
    </tr>
  `).join('');

  // El spread va aparte y con otras palabras a propósito: no es plata que se
  // suma, es plata que ya pagaste sin verla.
  const nota = $('#nota-oculto');
  nota.innerHTML = r.spreadIncluidoTotal > 0
    ? `Además, de lo que ya pagaste, calculamos que unos <strong>${formatoCOP(r.spreadIncluidoTotal)}</strong>
       fueron el margen de cambio del banco: la diferencia entre la TRM oficial y la tasa que te aplicó.
       Eso no se suma a la cuenta de arriba — ya está adentro, y por eso no lo ves en ninguna línea del extracto.`
    : '';

  const sinAtribuir = r.comisionesSinAtribuir || [];
  const aviso = $('#aviso-comisiones');
  if (sinAtribuir.length) {
    const total = sinAtribuir.reduce((a, c) => a + c.valor, 0);
    aviso.hidden = false;
    aviso.textContent = `Hay ${sinAtribuir.length} comisión(es) internacional(es) por ${formatoCOP(total)} que no pudimos amarrar a ninguna suscripción. Probablemente son de compras sueltas en el exterior, así que las dejamos en el costo de la deuda.`;
  } else {
    aviso.hidden = true;
  }
}

function pintarCategorias(r) {
  const bloque = $('#bloque-subs');
  if (!r.comercios.length) { bloque.hidden = true; return; }
  bloque.hidden = false;

  $('#categorias').innerHTML = r.porCategoria.map((cat) => `
    <div class="categoria">
      <div class="categoria-tope">
        <span class="categoria-emoji">${cat.emoji}</span>
        <span class="categoria-nombre">${escapar(cat.etiqueta)}</span>
        <span class="categoria-conteo">${cat.comercios.length}</span>
        <span class="categoria-total">${formatoCOP(cat.total)}</span>
      </div>
      <div class="categoria-items">
        ${cat.comercios.map((c) => `
          <div class="item">
            <span class="item-nombre">${escapar(c.nombre)}</span>
            ${c.enDolares ? '<span class="pastilla pastilla-usd">USD</span>' : ''}
            ${c.recurrenciaConfirmada
              ? `<span class="pastilla pastilla-neutra">${c.periodo} confirmado</span>`
              : '<span class="pastilla pastilla-neutra">supuesto mensual</span>'}
            <span class="item-montos">
              <span class="item-real">${formatoCOP(c.costoReal)}</span>
              <span class="item-anual">${formatoCOP(c.anual)} al año</span>
            </span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  const nota = $('#nota-supuesto');
  if (r.sinConfirmar.length) {
    nota.hidden = false;
    nota.textContent = `${r.sinConfirmar.length} de estas no las pudimos confirmar como recurrentes porque solo aparecen una vez en lo que subiste. Asumimos que son mensuales para proyectar el año. Si subís dos o tres meses, lo confirmamos de verdad.`;
  } else {
    nota.hidden = true;
  }
}

function pintarDeuda(r) {
  const bloque = $('#bloque-deuda');
  const grupos = r.grupos.filter((g) => !g.esPrincipal);
  if (!grupos.length) { bloque.hidden = true; return; }
  bloque.hidden = false;

  $('#tabla-deuda tbody').innerHTML = grupos.map((g) => `
    <tr>
      <td>
        <span class="pastilla ${g.esInteres ? 'pastilla-interes' : 'pastilla-cargo'}">${escapar(g.etiqueta)}</span>
        <div class="control-nota">${escapar(g.ayuda || '')}</div>
      </td>
      <td class="num">${g.conteo}</td>
      <td class="num">${formatoCOP(g.total)}</td>
      <td class="num">${formatoPct(r.costoTotal ? g.total / r.costoTotal : 0, { decimales: 0 })}</td>
    </tr>
  `).join('');
}

// --- Simulador ------------------------------------------------------------

function prepararSimulador(interes) {
  // Si el extracto trae saldo, lo proponemos como punto de partida.
  const conSaldo = estado.transacciones.filter((t) => t.saldo != null);
  const ultimoSaldo = conSaldo.length ? Math.abs(conSaldo[conSaldo.length - 1].saldo) : null;
  if (ultimoSaldo && !$('#sim-saldo').value) {
    $('#sim-saldo').value = new Intl.NumberFormat('es-CO').format(Math.round(ultimoSaldo));
  }

  // Podemos estimar la tasa, pero NO la rellenamos sola. La estimación divide
  // el interés del mes por el saldo de cierre, y el interés real se liquida
  // sobre el saldo promedio diario — que casi siempre es menor. O sea, la
  // estimación tira para arriba por construcción.
  //
  // Eso importa porque este campo alimenta la comparación con la usura. Un
  // número inflado acusaría a un banco de un delito por culpa de nuestra
  // aritmética. Tu extracto trae la tasa impresa: es más fácil y más cierto
  // copiarla que adivinarla.
  const nota = $('#nota-ea-estimada');
  const ea = ultimoSaldo && interes.totalIntereses > 0
    ? estimarEA(interes.totalIntereses, ultimoSaldo)
    : null;

  nota.innerHTML = ea
    ? `Copiala de tu extracto — sale impresa. Para que te ubiques: por lo que
       cobraron este mes, andaría cerca del ${formatoPct(ea)} E.A., pero es una
       cuenta gruesa que suele quedar por encima de la real. No la usamos hasta
       que la escribas.`
    : 'Sale impresa en tu extracto, junto al saldo.';

  correrSimulacion();
}

['#sim-saldo', '#sim-ea', '#sim-cuota', '#sim-usura'].forEach((sel) =>
  $(sel).addEventListener('input', correrSimulacion));

function correrSimulacion() {
  const saldo = parseNumero($('#sim-saldo').value);
  const ea = parseFloat($('#sim-ea').value) / 100;
  const cuota = parseNumero($('#sim-cuota').value);
  const usura = parseFloat($('#sim-usura').value) / 100;

  pintarUsura(ea, usura);

  const salida = $('#sim-salida');
  if (!saldo || saldo <= 0 || !Number.isFinite(ea) || ea <= 0) {
    salida.hidden = true;
    return;
  }
  salida.hidden = false;

  const min = simularMinimo(saldo, ea);
  if (!min) { salida.hidden = true; return; }

  if (min.nuncaTermina) {
    salida.className = 'sim-salida malo';
    salida.innerHTML = `
      <p class="sim-titulo">Pagando el mínimo, esa deuda no se acaba nunca.</p>
      <p>El interés del mes se come el pago mínimo completo, así que el saldo
      crece en vez de bajar. Esto se llama estar atrapado, y solo se sale
      pagando por encima del mínimo.</p>`;
    return;
  }

  const anios = Math.floor(min.meses / 12);
  const meses = min.meses % 12;
  const plazo = anios ? `${anios} año${anios > 1 ? 's' : ''}${meses ? ` y ${meses} mes${meses > 1 ? 'es' : ''}` : ''}` : `${min.meses} meses`;

  let html = `
    <p class="sim-titulo">Pagando solo el mínimo (5% del saldo):</p>
    <div class="sim-linea"><span>Tardarías</span><span>${plazo}</span></div>
    <div class="sim-linea"><span>Pagarías en total</span><span>${formatoCOP(min.totalPagado)}</span></div>
    <div class="sim-linea"><span>De eso, intereses</span><span>${formatoCOP(min.totalIntereses)}</span></div>
    <div class="sim-linea"><span>O sea, por cada $100 prestados devolvés</span><span>${formatoCOP(100 * min.totalPagado / saldo, { decimales: 0 })}</span></div>
  `;

  if (cuota && cuota > 0) {
    const fija = simularCuotaFija(saldo, ea, cuota);
    if (fija && !fija.nuncaTermina) {
      const ahorro = min.totalIntereses - fija.totalIntereses;
      html += `
        <hr style="border:none;border-top:1px solid var(--linea);margin:14px 0">
        <p class="sim-titulo">Pagando ${formatoCOP(cuota)} fijos cada mes:</p>
        <div class="sim-linea"><span>Tardarías</span><span>${fija.meses} meses</span></div>
        <div class="sim-linea"><span>Te ahorrarías</span><span>${formatoCOP(ahorro)}</span></div>
        <div class="sim-linea"><span>Saldrías antes</span><span>${min.meses - fija.meses} meses</span></div>`;
    } else if (fija && fija.nuncaTermina) {
      html += `<p class="nota">Con ${formatoCOP(cuota)} al mes no alcanzás ni a cubrir el interés. Subí la cuota.</p>`;
    }
  }

  salida.className = 'sim-salida';
  salida.innerHTML = html;
}

function pintarUsura(ea, usura) {
  const el = $('#usura-salida');
  const cmp = compararUsura(Number.isFinite(ea) ? ea : null, Number.isFinite(usura) ? usura : null);
  if (!cmp) { el.hidden = true; return; }
  el.hidden = false;

  if (cmp.excede) {
    el.className = 'usura-salida excede';
    el.innerHTML = `
      <p class="sim-titulo">La tasa que escribiste está por encima del techo de usura.</p>
      <p>Escribiste ${formatoPct(cmp.ea)} E.A. y la usura del mes que pusiste es ${formatoPct(cmp.usura)}.
      Antes de sacar conclusiones: revisá que ambos números estén bien copiados
      del extracto y de la resolución del mes correcto, y que los dos sean
      efectivos anuales (E.A.) y no nominales — mezclar las dos cosas es el
      error más común y hace que una tasa normal parezca ilegal.</p>
      <p>Si después de verificar el número se sostiene, ahí sí tiene sentido
      preguntarle a tu banco y, si no cuadra, poner una queja en la
      <a href="https://www.superfinanciera.gov.co/" target="_blank" rel="noopener">Superfinanciera</a>.
      Nosotros no verificamos nada de esto: solo comparamos los dos números que escribiste.</p>`;
  } else {
    el.className = 'usura-salida ok';
    el.innerHTML = `
      <p class="sim-titulo">Tu tasa está dentro de lo legal — que no es lo mismo que barata.</p>
      <p>Estás en ${formatoPct(cmp.ea)} E.A., o sea al ${formatoPct(cmp.proporcion, { decimales: 0 })}
      del techo de usura (${formatoPct(cmp.usura)}). El banco te puede cobrar
      hasta ahí y sigue siendo legal.</p>`;
  }
}

// --- Exportar -------------------------------------------------------------

$('#btn-exportar').addEventListener('click', () => {
  if (!estado.resultado) return;
  const { interes, subs, tarifas, esCuentaDebito } = estado.resultado;

  const datos = {
    generado: new Date().toISOString(),
    herramienta: 'Plata Clara',
    supuestos: { ...tarifas, esCuentaDebito },
    movimientos: estado.transacciones.length,
    descartados: estado.excluidos.size,
    interes: {
      totalIntereses: interes.totalIntereses,
      totalCargos: interes.totalCargos,
      costoTotal: interes.costoTotal,
      detalle: interes.grupos.map((g) => ({ concepto: g.etiqueta, veces: g.conteo, total: g.total })),
    },
    suscripciones: {
      cobradoEnExtracto: subs.cobradoTotal,
      recargosDelBanco: subs.recargosTotal,
      costoReal: subs.costoRealTotal,
      proyeccionAnual: subs.anualTotal,
      detalle: subs.comercios.map((c) => ({
        nombre: c.nombre,
        categoria: c.categoria,
        enDolares: c.enDolares,
        periodo: c.periodo,
        confirmado: c.recurrenciaConfirmada,
        cobrado: c.cobrado,
        recargos: c.recargos.total,
        costoReal: c.costoReal,
        anual: c.anual,
      })),
    },
  };

  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `plata-clara-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// --- Demo -----------------------------------------------------------------

$('#btn-demo').addEventListener('click', async () => {
  limpiarErrores();
  try {
    const resp = await fetch('ejemplos/ejemplo-extracto.csv');
    if (!resp.ok) throw new Error('no se encontró el archivo de ejemplo');
    const texto = await resp.text();
    const file = new File([texto], 'ejemplo-extracto.csv', { type: 'text/csv' });
    await cargarArchivos([file]);
  } catch (err) {
    mostrarError(`No pudimos cargar el ejemplo (${err.message}). Si abriste el index.html con doble clic, necesitás un servidor: corré "python3 -m http.server" en la carpeta del proyecto.`);
  }
});

// --- Utilidades -----------------------------------------------------------

function mostrarError(msg) {
  const el = $('#errores');
  el.hidden = false;
  el.textContent = msg;
}
function limpiarErrores() {
  const el = $('#errores');
  el.hidden = true;
  el.textContent = '';
}
function escapar(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
