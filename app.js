// Plata Clara — interfaz.
// Todo el trabajo pasa aquí, en tu navegador. No hay red de por medio.

import { parseNumero, formatoCOP, formatoPct } from './src/parse/numero.js';
import { claveMes, nombreMes } from './src/parse/fecha.js';
import { parsearCSV, detectarEncabezados, filasATransacciones, sugiereInvertirSigno } from './src/parse/csv.js';
import { transaccionesDePDF } from './src/parse/pdf.js';
import { CARGOS, POR_CLAVE } from './src/datos/cargos.js';
import { TARIFAS } from './src/datos/tarifas.js';
import { iconoDe } from './src/datos/iconos.js';
import { dibujarAmortizacion, leyenda } from './src/vista/grafico.js';
import { analizarInteres, clasificarCargo, estimarEA, compararUsura } from './src/motor/interes.js';
import { analizarDiferidos, interesPorPagar } from './src/motor/diferidos.js';
import { tasaEADelExtracto } from './src/parse/bancolombia-visa.js';
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
  periodo: null,   // el que dice el extracto, no el rango de fechas de las filas
  banco: null,
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
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('on'); }));
['dragleave', 'drop'].forEach((ev) =>
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('on'); }));
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
      if (r.periodo) estado.periodo = r.periodo;
      if (r.banco) estado.banco = r.banco;
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

  // Ojo: `rango` son fechas de COMPRA. Si el extracto trae su periodo impreso,
  // ese manda — las cuotas conservan la fecha original y estirarían el rango.
  const p = estado.periodo?.fin ? nombreMes(claveMes(estado.periodo.fin)) : null;
  const diferidas = tx.filter((t) => t.cuotas).length;

  $('#resumen-lectura').textContent =
    `${tx.length} movimientos` +
    (p ? ` · extracto de ${p}` : ` · ${rango}`) +
    (diferidas
      ? ` · ${diferidas} son cuotas de compras anteriores, así que verás fechas viejas: es normal.`
      : meses.length === 1
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
    if (excluido) tr.classList.add('off');

    const cargo = estado.forzados.has(t.id)
      ? { clave: estado.forzados.get(t.id), etiqueta: POR_CLAVE[estado.forzados.get(t.id)].etiqueta }
      : clasificarCargo(t.descripcion);
    const comercio = cargo ? null : identificarComercio(t.descripcion);
    const sospecha = !cargo && !comercio && pareceRecurrente(t.descripcion);

    tr.innerHTML = `
      <td>${t.fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</td>
      <td class="cell-desc"><span title="${escapar(t.descripcion)}">${escapar(t.descripcion)}</span></td>
      <td class="r">${formatoCOP(t.valor)}</td>
      <td>${etiquetaDe(t, cargo, comercio, sospecha)}</td>
      <td style="text-align:center">
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
      cb.closest('tr').classList.toggle('off', !cb.checked);
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
  if (t.valor < 0) return '<span class="pill pill-mute">Abono (entra plata)</span>';

  if (cargo) {
    const def = POR_CLAVE[cargo.clave];
    const clase = def?.esInteres ? 'pill-int' : 'pill-fee';
    const alerta = def?.revisar ? ' <span class="ctl-note">¿seguro?</span>' : '';
    return `<span class="pill ${clase}">${escapar(cargo.etiqueta)}</span>${alerta}`;
  }
  if (comercio) {
    const usd = comercio.moneda === 'USD' ? ' <span class="pill pill-usd">USD</span>' : '';
    return `<span class="pill pill-sub">${escapar(comercio.nombre)}</span>${usd}`;
  }
  if (sospecha) {
    return '<span class="pill pill-sub">Posible suscripción</span>';
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

  // El interés que el extracto cobró de verdad. Manda sobre cualquier
  // estimación nuestra del costo de mantener el saldo.
  const interesCorriente = interes.grupos
    .filter((g) => g.esInteres)
    .reduce((a, g) => a + g.total, 0);

  const contadas = estado.transacciones.filter((t) => !estado.excluidos.has(t.id));
  const diferidos = analizarDiferidos(contadas, { interesDelMes: interesCorriente });

  estado.resultado = { interes, subs, diferidos, tarifas, esCuentaDebito };
  pintarResultados();
}

function pintarResultados() {
  const { interes, subs } = estado.resultado;

  $('#pantalla-revision').hidden = true;
  $('#pantalla-resultados').hidden = false;

  // El periodo lo manda el extracto, no las fechas de las filas.
  //
  // En un extracto diferido esas fechas son las de COMPRA: una cuota cobrada en
  // junio conserva la fecha de hace año y medio. Anunciar "esto te costó en 18
  // meses" sobre un extracto de un mes convierte el interés de un mes en el de
  // año y medio, que es exactamente el tipo de mentira que esta herramienta
  // existe para no decir.
  const meses = [...new Set(estado.transacciones.map((t) => claveMes(t.fecha)))].sort();
  $('#periodo-texto').textContent = estado.periodo?.fin
    ? `en ${nombreMes(claveMes(estado.periodo.fin))}`
    : (meses.length === 1 ? `en ${nombreMes(meses[0])}` : `en ${meses.length} meses`);

  const contadas = estado.transacciones.length - estado.excluidos.size;
  const dif = estado.resultado?.diferidos;
  $('#resumen-periodo').textContent =
    `${contadas} movimientos contados` +
    (estado.excluidos.size ? ` · ${estado.excluidos.size} que descartaste` : '') +
    (estado.banco ? ` · ${estado.banco}` : '') +
    (dif?.conteo
      ? ` · ${dif.conteo} son cuotas de compras viejas, por eso ves fechas de hace meses`
      : '');

  pintarInteres(interes);
  pintarSubs(subs);
  pintarGolpe(interes, subs);
  pintarOculto(subs);
  pintarCategorias(subs);
  pintarDiferidos(estado.resultado.diferidos);
  pintarDeuda(interes);
  prepararSimulador(interes, estado.resultado.diferidos);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Cuenta la cifra desde cero hasta el valor. Es el único adorno del proyecto
 * y se gana el puesto: el número no es un dato, es el golpe. Verlo subir hace
 * que llegue.
 * Respeta prefers-reduced-motion — ahí simplemente aparece.
 */
function contarHasta(el, valor, { ms = 900 } = {}) {
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // En pestaña oculta, requestAnimationFrame no corre. Sin esto la cifra se
  // queda congelada en $0 — que es justo la cifra que no queremos mostrar.
  if (quieto || !valor || document.hidden) { el.textContent = formatoCOP(valor); return; }

  const t0 = performance.now();
  let vivo = true;

  const paso = (ahora) => {
    if (!vivo) return;
    const p = Math.min((ahora - t0) / ms, 1);
    const e = 1 - (1 - p) ** 4;            // easeOutQuart
    el.textContent = formatoCOP(valor * e);
    if (p < 1) requestAnimationFrame(paso);
    else vivo = false;
  };
  requestAnimationFrame(paso);

  // Red de seguridad: pase lo que pase con los frames, la cifra correcta
  // aterriza. La animación es un adorno; el número no es negociable.
  setTimeout(() => { vivo = false; el.textContent = formatoCOP(valor); }, ms + 80);
}

function pintarInteres(r) {
  contarHasta($('#cifra-interes'), r.costoTotal);

  if (r.costoTotal === 0) {
    $('#pie-interes').textContent = 'No encontramos intereses ni cargos. O estás al día, o tu extracto los nombra distinto — revisa la tabla.';
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
    .map((g) => `<div class="bd-row"><span>${escapar(g.etiqueta)}</span><span>${formatoCOP(g.total)}</span></div>`)
    .join('');
}

function pintarSubs(r) {
  contarHasta($('#cifra-subs'), r.costoRealTotal);

  if (!r.comercios.length) {
    $('#pie-subs').textContent = 'No reconocimos ninguna suscripción. Si sabes que tienes, márcalas en la tabla y vuelve a analizar.';
    $('#desglose-subs').innerHTML = '';
    return;
  }

  $('#pie-subs').innerHTML = r.recargosTotal > 0
    ? `Los cargos suman ${formatoCOP(r.cobradoTotal)}, más <strong>${formatoCOP(r.recargosTotal)}</strong> en comisiones internacionales que el banco cobra aparte.`
    : `${r.comercios.length} suscripciones detectadas.`;

  $('#desglose-subs').innerHTML = [
    ...r.comercios.slice(0, 5).map((c) =>
      `<div class="bd-row"><span>${escapar(c.nombre)}</span><span>${formatoCOP(c.costoReal)}</span></div>`),
    `<div class="bd-row tot"><span>Proyección a 12 meses</span><span>${formatoCOP(r.anualTotal)}</span></div>`,
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
    (eq ? ` — unos ${eq.cantidad} ${eq.nombre}` : '') +
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
        ${c.recargos.estimado ? '<div class="ctl-note">comisión estimada</div>' : '<div class="ctl-note">comisión real del extracto</div>'}
      </td>
      <td class="r">${formatoCOP(c.cobrado)}</td>
      <td class="r">+${formatoCOP(c.recargos.comisionIntl + c.recargos.ivaComision)}</td>
      <td class="r"><span class="strong">${formatoCOP(c.costoReal)}</span></td>
      <td class="r">${formatoCOP(c.recargos.spreadIncluido)}</td>
      <td class="r">${formatoCOP(c.anual)}</td>
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
    <div class="cat">
      <div class="cat-hd">
        <span class="cat-ic">${iconoDe(cat.clave)}</span>
        <span class="cat-nm">${escapar(cat.etiqueta)}</span>
        <span class="cat-ct">${cat.comercios.length}</span>
        <span class="cat-tot">${formatoCOP(cat.total)}</span>
      </div>
      <div class="cat-items">
        ${cat.comercios.map((c) => `
          <div class="item">
            <span class="item-nm">${escapar(c.nombre)}</span>
            ${c.enDolares ? '<span class="pill pill-usd">USD</span>' : ''}
            ${c.recurrenciaConfirmada
              ? `<span class="pill pill-mute">${c.periodo} confirmado</span>`
              : '<span class="pill pill-mute">supuesto mensual</span>'}
            <span class="item-amt">
              <span class="item-real">${formatoCOP(c.costoReal)}</span>
              <span class="item-yr">${formatoCOP(c.anual)} al año</span>
            </span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  const nota = $('#nota-supuesto');
  if (r.sinConfirmar.length) {
    nota.hidden = false;
    nota.textContent = `${r.sinConfirmar.length} de estas no las pudimos confirmar como recurrentes porque solo aparecen una vez en lo que subiste. Asumimos que son mensuales para proyectar el año. Si subes dos o tres meses, lo confirmamos de verdad.`;
  } else {
    nota.hidden = true;
  }
}

function pintarDiferidos(d) {
  const bloque = $('#bloque-diferidos');
  if (!d || !d.conteo) { bloque.hidden = true; return; }
  bloque.hidden = false;

  // El peor apilado manda el titular: es el que explica todo el bloque.
  const peor = d.seApilan[0];
  $('#dif-titular').innerHTML = peor
    ? `Tienes <span style="color:var(--cyan)">${peor.cuotasVivas} cuotas de ${escapar(peor.nombre)}</span> corriendo a la vez.`
    : `Estás financiando <span style="color:var(--cyan)">${d.conteo} compras</span> a cuotas.`;

  $('#dif-meta').innerHTML = peor
    ? `${d.conteo} compras diferidas, pero de solo ${d.apiladas.length} comercios. ` +
      `Cada vez que te cobran, el banco lo difiere otra vez — y las cuotas se apilan.`
    : `${d.conteo} compras diferidas. El extracto solo te muestra la cuota, que se ve chiquita. ` +
      `Lo que no te muestra es el saldo que se acumuló detrás.`;

  contarHasta($('#dif-saldo'), d.saldoPendiente);
  $('#dif-saldo-cap').innerHTML =
    `Compraste <b>${formatoCOP(d.comprado)}</b> en total y pagas <b>${formatoCOP(d.cuotaMensual)}</b> al mes de capital. ` +
    `La última cuota cae en ${d.colaMeses} meses.`;

  contarHasta($('#dif-costo'), d.costoMensualDelSaldo);
  $('#dif-costo-cap').innerHTML = d.tasaEA
    ? `Es el interés del mes sobre ese saldo, al <b>${formatoPct(d.tasaEA)} E.A.</b> No sale de la cuota: se cobra aparte.`
    : `Es el interés del mes sobre ese saldo. No sale de la cuota: se cobra aparte.`;

  // El golpe: cuánto interés falta si dejas correr las cuotas tal cual.
  const proy = interesPorPagar(d.items, d.tasaEA);
  const g = $('#dif-golpe');
  if (proy && proy.interesTotal > 0) {
    g.hidden = false;
    g.innerHTML =
      `Si no compras nada más y dejas correr las cuotas, te faltan <span class="hit">${formatoCOP(proy.interesTotal)}</span> ` +
      `de intereses en los próximos ${proy.meses} meses — solo por haber diferido.`;
  } else {
    g.hidden = true;
  }

  // La tabla va POR COMERCIO, no por cuota suelta: 20 filas de "Claude" no
  // dicen nada; una fila que diga "Claude, 20 cuotas vivas" lo dice todo.
  $('#tabla-diferidos tbody').innerHTML = d.apiladas.map((a) => `
    <tr>
      <td>
        <span class="strong">${escapar(a.nombre)}</span>
        ${a.esSuscripcion ? '<span class="pill pill-sub">suscripción</span>' : ''}
        ${a.cuotasVivas >= 5 ? `<span class="pill pill-int">se apila</span>` : ''}
      </td>
      <td class="r">${a.cuotasVivas}</td>
      <td class="r">${formatoCOP(a.cuotaMensual)}</td>
      <td class="r">${formatoCOP(a.comprado)}</td>
      <td class="r"><span class="strong">${formatoCOP(a.saldoPendiente)}</span></td>
      <td class="r">${a.restantesMax} meses</td>
    </tr>
  `).join('');

  const subs = d.suscripcionesDiferidas;
  const saldoSubs = subs.reduce((a, i) => a + i.saldoPendiente, 0);
  const nota = $('#dif-nota');
  nota.innerHTML =
    (subs.length
      ? `<b>${subs.length} de esas cuotas son de suscripciones</b> — ${d.comerciosSuscripcion} servicios, ${formatoCOP(saldoSubs)} de saldo. ` +
        `Una suscripción se cobra todos los meses; si el banco difiere cada cobro a 36 cuotas, nunca terminas de pagar el mes 1 antes de que llegue el 21. `
      : '') +
    `La cuota es capital puro (${d.mayor ? `${escapar(d.mayor.nombre)}: ${formatoCOP(d.mayor.valorMovimiento)} entre ${d.mayor.cuotaTotal}` : ''}); ` +
    `el interés se cobra aparte sobre el saldo total. Por eso la cuota se ve inofensiva y el saldo te cobra todos los meses.`;
}

function pintarDeuda(r) {
  const bloque = $('#bloque-deuda');
  const grupos = r.grupos.filter((g) => !g.esPrincipal);
  if (!grupos.length) { bloque.hidden = true; return; }
  bloque.hidden = false;

  $('#tabla-deuda tbody').innerHTML = grupos.map((g) => `
    <tr>
      <td>
        <span class="pill ${g.esInteres ? 'pill-int' : 'pill-fee'}">${escapar(g.etiqueta)}</span>
        <div class="ctl-note">${escapar(g.ayuda || '')}</div>
      </td>
      <td class="r">${g.conteo}</td>
      <td class="r">${formatoCOP(g.total)}</td>
      <td class="r">${formatoPct(r.costoTotal ? g.total / r.costoTotal : 0, { decimales: 0 })}</td>
    </tr>
  `).join('');
}

// --- Simulador ------------------------------------------------------------

function prepararSimulador(interes, diferidos) {
  // El saldo: si hay diferidos, el saldo pendiente es el número real y sale
  // del extracto. Si no, caemos al último saldo de la columna.
  const conSaldo = estado.transacciones.filter((t) => t.saldo != null);
  const ultimoSaldo = diferidos?.saldoPendiente
    || (conSaldo.length ? Math.abs(conSaldo[conSaldo.length - 1].saldo) : null);
  if (ultimoSaldo && !$('#sim-saldo').value) {
    $('#sim-saldo').value = new Intl.NumberFormat('es-CO').format(Math.round(ultimoSaldo));
  }

  // La tasa: si el extracto la trae impresa, la usamos. Esto NO es lo mismo
  // que nuestra estimación — es el dato del banco, ponderado por saldo. Por eso
  // sí lo rellenamos: la razón para no hacerlo era que estimar infla el número,
  // y aquí no estamos estimando nada.
  const eaReal = tasaEADelExtracto(estado.transacciones);
  if (eaReal && !$('#sim-ea').value) {
    $('#sim-ea').value = (eaReal * 100).toFixed(2);
    $('#nota-ea-estimada').innerHTML =
      `Leída de tu extracto: <b>${formatoPct(eaReal)} E.A.</b>, ponderada por saldo. No es una estimación nuestra.`;
    correrSimulacion();
    return;
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
    ? `Cópiala de tu extracto — sale impresa. Para que te ubiques: por lo que
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
  const tarjetaChart = $('#chart-card');
  if (!saldo || saldo <= 0 || !Number.isFinite(ea) || ea <= 0) {
    salida.hidden = true;
    tarjetaChart.hidden = true;
    return;
  }
  salida.hidden = false;

  const min = simularMinimo(saldo, ea);
  if (!min) { salida.hidden = true; tarjetaChart.hidden = true; return; }

  if (min.nuncaTermina) {
    salida.className = 'sim-out bad';
    salida.innerHTML = `
      <p class="sim-t">Pagando el mínimo, esa deuda no se acaba nunca.</p>
      <p style="color:var(--fog-2)">El interés del mes se come el pago mínimo completo, así que el saldo
      crece en vez de bajar. Esto se llama estar atrapado, y solo se sale
      pagando por encima del mínimo.</p>`;
    tarjetaChart.hidden = true;
    return;
  }

  const anios = Math.floor(min.meses / 12);
  const meses = min.meses % 12;
  const plazo = anios ? `${anios} año${anios > 1 ? 's' : ''}${meses ? ` y ${meses} mes${meses > 1 ? 'es' : ''}` : ''}` : `${min.meses} meses`;

  let html = `
    <p class="sim-t">Pagando solo el mínimo (5% del saldo):</p>
    <div class="sim-row"><span>Tardarías</span><span>${plazo}</span></div>
    <div class="sim-row"><span>Pagarías en total</span><span>${formatoCOP(min.totalPagado)}</span></div>
    <div class="sim-row"><span>De eso, intereses</span><span>${formatoCOP(min.totalIntereses)}</span></div>
    <div class="sim-row"><span>O sea, por cada $100 prestados devuelves</span><span>${formatoCOP(100 * min.totalPagado / saldo, { decimales: 0 })}</span></div>
  `;

  let fijaOK = null;
  if (cuota && cuota > 0) {
    const fija = simularCuotaFija(saldo, ea, cuota);
    if (fija && !fija.nuncaTermina) {
      fijaOK = fija;
      const ahorro = min.totalIntereses - fija.totalIntereses;
      html += `
        <hr class="sim-split">
        <p class="sim-t">Pagando ${formatoCOP(cuota)} fijos cada mes:</p>
        <div class="sim-row"><span>Tardarías</span><span>${fija.meses} meses</span></div>
        <div class="sim-row hi"><span>Te ahorrarías</span><span>${formatoCOP(ahorro)}</span></div>
        <div class="sim-row hi"><span>Saldrías antes</span><span>${min.meses - fija.meses} meses</span></div>`;
    } else if (fija && fija.nuncaTermina) {
      html += `<p class="note">Con ${formatoCOP(cuota)} al mes no alcanzas ni a cubrir el interés. Sube la cuota.</p>`;
    }
  }

  salida.className = 'sim-out';
  salida.innerHTML = html;

  dibujarCurva(min, fijaOK, cuota);
}

// La curva del saldo. Los datos ya existían (simularMinimo devuelve `curva`);
// lo que faltaba era mostrarlos. Un número dice "8 años"; la curva muestra
// por qué: los primeros años casi no baja.
function dibujarCurva(min, fija, cuota) {
  const tarjeta = $('#chart-card');
  const r = dibujarAmortizacion($('#chart'), min, fija);
  if (!r) { tarjeta.hidden = true; return; }

  tarjeta.hidden = false;
  $('#chart-legend').innerHTML = r.series.length > 1 ? leyenda(r.series) : '';
  $('#chart-sub').textContent = fija
    ? `pagando el mínimo tardas ${min.meses} meses; con ${formatoCOP(cuota)} fijos, ${fija.meses}`
    : `escribe una cuota fija arriba para comparar las dos curvas`;
}

function pintarUsura(ea, usura) {
  const el = $('#usura-salida');
  const cmp = compararUsura(Number.isFinite(ea) ? ea : null, Number.isFinite(usura) ? usura : null);
  if (!cmp) { el.hidden = true; return; }
  el.hidden = false;

  if (cmp.excede) {
    el.className = 'usura-out over';
    el.innerHTML = `
      <p class="sim-t">La tasa que escribiste está por encima del techo de usura.</p>
      <p>Escribiste ${formatoPct(cmp.ea)} E.A. y la usura del mes que pusiste es ${formatoPct(cmp.usura)}.
      Antes de sacar conclusiones: revisa que ambos números estén bien copiados
      del extracto y de la resolución del mes correcto, y que los dos sean
      efectivos anuales (E.A.) y no nominales — mezclar las dos cosas es el
      error más común y hace que una tasa normal parezca ilegal.</p>
      <p>Si después de verificar el número se sostiene, ahí sí tiene sentido
      preguntarle a tu banco y, si no cuadra, poner una queja en la
      <a href="https://www.superfinanciera.gov.co/" target="_blank" rel="noopener">Superfinanciera</a>.
      Nosotros no verificamos nada de esto: solo comparamos los dos números que escribiste.</p>`;
  } else {
    el.className = 'usura-out ok';
    el.innerHTML = `
      <p class="sim-t">Tu tasa está dentro de lo legal — que no es lo mismo que barata.</p>
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
    mostrarError(`No pudimos cargar el ejemplo (${err.message}). Si abriste el index.html con doble clic, necesitas un servidor: corre "python3 -m http.server" en la carpeta del proyecto.`);
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
