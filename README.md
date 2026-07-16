# Plata Clara

**Sube el extracto de tu banco y mira cuánto te costó de verdad.** Cuánto pagaste
en intereses y cargos, y cuánto en suscripciones — incluyendo lo que el banco le
monta encima y no aparece en el precio de lista.

Hecho para Colombia. Todo pasa en tu navegador: no hay servidor, no hay cuenta,
no hay base de datos.

```
┌──────────────────────┐
│  extracto.csv / .pdf │
└──────────┬───────────┘
           ↓  (nunca sale de tu máquina)
   parseo → clasificación → dos cifras
           ↓
┌──────────────────┬──────────────────┐
│ Intereses y      │ Suscripciones    │
│ cargos           │                  │
│ $162.124         │ $571.715         │
└──────────────────┴──────────────────┘
```

## Por qué existe

Tu banco te muestra una línea que dice "intereses". Esa línea miente por
omisión: el costo real de deber plata es intereses **más** cuota de manejo,
**más** seguro de vida deudores, **más** comisión de avance, **más** el IVA de
todo eso. En el extracto de ejemplo, solo el 59% del costo se llama "intereses".
El otro 41% son cargos que nadie suma.

Y del otro lado: tus suscripciones en dólares no cuestan lo que dice la página
de Netflix o de OpenAI. Cuestan eso más la comisión internacional, más el IVA de
esa comisión, más el margen que el banco se queda en la tasa de cambio.

Plata Clara pone esos dos números al lado, en pesos, en una pantalla.

## Cómo se usa

**→ [plata-clara en vivo](https://jarueda97.github.io/plata-clara/)**

Arrastra tu extracto, revisa que esté bien leído, y mira el daño. Nada se sube:
la página se descarga una vez y el análisis corre en tu máquina. También puedes
[correrla local](#correlo-local).

**Un consejo:** si puedes, suelta dos o tres meses de una. Con un solo mes no
podemos detectar recurrencia por repetición (nada se repite todavía), así que
reconocemos las suscripciones por nombre de comercio contra un diccionario. Eso
encuentra a Netflix y a ChatGPT, pero no al gimnasio de tu barrio. Con dos meses
o más, además detectamos cualquier cobro que se repita cada ~30 días.

## Privacidad

Tu extracto no sale de tu navegador. No es una promesa de marketing, es
arquitectura: **no hay backend al cual mandarlo.**

Verifícalo tú mismo:

1. Abre las herramientas de desarrollo (F12) → pestaña **Red**.
2. Sube tu extracto.
3. No vas a ver ninguna petición saliendo con tus datos.

O más fácil: desconecta el wifi y usalo igual. Funciona.

**Cero terceros.** Las fuentes están servidas desde el propio repo, no desde
Google. No es purismo: pedirle las fuentes a Google le cuenta a Google tu IP y
que estás usando una herramienta para auditar a tu banco. Un proyecto que se
para en "tu extracto no sale de tu navegador" no puede filtrar eso de una.

> La única petición externa que existe es la de `pdf.js` desde un CDN, y solo si
> abres un PDF. Después queda en caché. Si eso te molesta, usa CSV y no sale ni
> una — literalmente cero peticiones a otro dominio.

## Correlo local

No hay build, no hay dependencias, no hay `npm install`. Es JavaScript con
módulos ES y ya.

```bash
git clone https://github.com/jarueda97/plata-clara
cd plata-clara
python3 -m http.server 8000
# abre http://localhost:8000
```

> Necesitas un servidor (aunque sea ese) porque los módulos ES no cargan sobre
> `file://`. Abrir el `index.html` con doble clic no funciona.

Los tests corren con Node, sin instalar nada:

```bash
node --test tests/test.mjs
```

## Cómo funciona

| Archivo | Qué hace |
|---|---|
| `src/parse/numero.js` | `$1.234.567,89` → `1234567.89`. Y `45.000` son cuarenta y cinco **mil**. |
| `src/parse/fecha.js` | `15/01/2026`, `15-ene-26`, `15 de enero de 2026`. DD/MM, no MM/DD. |
| `src/parse/csv.js` | Olfatea el delimitador, encuentra la fila de encabezados entre la basura, hace match difuso de columnas en español. |
| `src/parse/pdf.js` | Saca texto del PDF con pdf.js. Prueba los presets de banco y, si ninguno pega, cae al extractor genérico. |
| `src/parse/bancolombia-visa.js` | **Preset Bancolombia Visa detallado.** El primero construido contra un extracto real. |
| `src/motor/diferidos.js` | Lo que estás pagando a cuotas sin haberlo decidido, y cuánto se apila. |
| `src/datos/cargos.js` | Patrones de cargos financieros. **Editable.** |
| `src/datos/suscripciones.js` | Diccionario de comercios. **Editable — aquí es donde más ayuda hace falta.** |
| `src/motor/interes.js` | Clasifica cargos, suma el costo real de la deuda. |
| `src/motor/suscripciones.js` | Identifica comercios, detecta recurrencia, calcula recargos. |
| `src/motor/minimo.js` | Simula pagar el mínimo hasta que la deuda muera (si es que muere). |

### La regla que no se rompe: ningún peso se cuenta dos veces

Es la única cosa que esta herramienta no se puede dar el lujo de arruinar, y
tiene dos trampas que son fáciles de pisar:

**1. La comisión internacional ya está en tu extracto.** Sale como línea aparte
(`COMISION TRANSACCION INTERNACIONAL`). Si la cuentaramos como cargo del banco
*y además* la estimáramos sobre la suscripción, la sumaríamos dos veces. Así que
la sacamos del costo de la deuda (no es costo de deber plata, es costo de
comprar en dólares) y se la atribuimos a la compra que la causó, por fecha. Solo
estimamos cuando el extracto no la trae — y ahí lo decimos.

**2. El margen de cambio NO se suma.** El banco no te manda una línea que diga
"mi margen": te da una tasa peor que la TRM y ya. Ese margen ya está **adentro**
del monto en pesos que pagaste. Sumarlo encima sería inventar plata que nunca
salió de tu cuenta. Lo mostramos aparte, como descomposición de lo que ya
pagaste, nunca como suma.

Los tests en `tests/test.mjs` bajo `no se cuenta dos veces` existen para que esto
no se rompa nunca.

### Los diferidos: el hallazgo que cambió el producto

La primera prueba con un extracto real (Bancolombia Visa, 9 páginas) rompió el
modelo entero, y la lección vale más que el código:

**Casi todo se difiere.** La tarjeta viene configurada para partir cada compra
en 36 cuotas. Entonces "cuánto pagaste este mes" tiene tres respuestas posibles,
y se llevan 18x entre ellas:

| Lectura | Ejemplo |
|---|---|
| Suma de las compras | $18.000.000 |
| **Suma de las cuotas** — lo que de verdad golpeó el mes | **$1.000.000** |
| Suma de los saldos pendientes | $11.000.000 |

En el extracto con el que probamos, la diferencia entre la primera y la segunda
lectura era de **18x**.

El parser genérico agarraba la última cifra de cada fila, o sea el **saldo
pendiente**, y reportaba el saldo entero como "gasto del mes". Ahora `valor` es
la cuota.

**Y lo que se apila.** Una suscripción se cobra todos los meses. Si el banco
difiere *cada cobro* a 36 cuotas, al mes 20 tienes 20 cuotas del mismo servicio
corriendo a la vez y el saldo solo sube — nunca terminas de pagar el mes 1 antes
de que llegue el 21. Eso dejó de ser una suscripción: es deuda que se acumula
sola, y ningún extracto te lo dice. Por eso el bloque de diferidos agrupa por
comercio y no por cuota: *"49 suscripciones diferidas"* es un número engañoso
cuando en realidad son 6 servicios apilados.

**La cuota es capital puro.** El interés no va adentro (3.600.000 / 36 = 100.000
exacto): se cobra aparte, en una sola línea, sobre el saldo total. Por eso la
cuota se ve inofensiva y el saldo te cobra todos los meses.

### Lo que NO hacemos

- **No inventamos la tasa de usura.** Cambia cada mes y la publica la
  Superfinanciera. Quemarla en el código sería garantizar que quede
  desactualizada y mienta. La escribes tú, con el link al lado.
- **No *estimamos* tu tasa de interés.** Si el extracto la trae impresa (el de
  Bancolombia la da por transacción), la leemos y la usamos, ponderada por
  saldo: eso es un dato, no una cuenta nuestra. Si no la trae, el campo queda
  vacío y lo llenas tú. Lo que no hacemos es *adivinarla*: nuestra estimación
  divide el interés del mes por el saldo de cierre, cuando el interés se liquida
  sobre el saldo promedio diario, o sea que tira para arriba por construcción.
  Ese campo alimenta la comparación con la usura, y un número inflado te haría
  acusar a un banco de un delito por culpa de nuestra aritmética.
- **No sumamos sin mostrarte.** Siempre ves la tabla y puedes destildar lo que
  esté mal clasificado antes de que sumemos nada.

## Diseño

Plata Clara habla el idioma visual de **Chidori Labs**: `--void` casi negro,
acento `--volt`, Space Grotesk + JetBrains Mono, y el radio canónico de 14px que
viene del sistema de Sombra. Nocturno por decisión, no por preferencia del
sistema — no hay tema claro.

Tres reglas que no son decorativas:

- **Sin emoji.** Heredada de Sombra: *"la marca es severa y seca; los emoji
  rompen el registro"*. Un 📺 al lado de una cifra de plata la hace ver de
  juguete, y esta herramienta necesita que le creas. Las categorías usan iconos
  de trazo (`src/datos/iconos.js`).
- **Toda cifra de plata va en mono, con `tabular-nums`.** Es un recibo, no una
  decoración: los números tienen que alinearse y poder compararse de un vistazo.
- **Los colores del gráfico no son los acentos de marca.** Un mark y un acento
  tienen oficios distintos. Los acentos (`--volt`, `--pink`) son brillantes para
  UI sobre casi-negro; las marcas del gráfico (`--mark-min`, `--mark-fija`) son
  escalones oscurecidos de los mismos tonos, dentro del band de L 0.48–0.67 que
  exige el modo oscuro. Están validadas: ΔE 9.7 bajo deuteranopía, 30.7 en visión
  normal, contraste ≥3:1 contra el panel. Además el gráfico lleva leyenda y
  etiqueta directa, así que el color nunca es el único canal que carga la
  identidad.

La única animación del proyecto es el conteo de las dos cifras. Se gana el
puesto: el número no es un dato, es el golpe, y verlo subir hace que llegue.
Respeta `prefers-reduced-motion`, y tiene una red de seguridad que aterriza el
valor correcto aunque los frames no corran (en pestaña oculta
`requestAnimationFrame` se congela — sin la red, la cifra se quedaba en $0).

## Contribuir

Lo más útil que puedes hacer, en orden:

1. **Agregar comercios al diccionario** (`src/datos/suscripciones.js`). Es la
   diferencia entre "detectamos 3 suscripciones" y "detectamos 11". No necesitas
   saber programar.
2. **Agregar patrones de cargos de tu banco** (`src/datos/cargos.js`). Cada banco
   los nombra distinto.
3. **Reportar un extracto que se leyó mal.** Mándanos la fila de encabezados de
   tu CSV, sin datos personales.

Ver [CONTRIBUTING.md](CONTRIBUTING.md).

## Descargo

Plata Clara hace estimaciones a partir de lo que dice tu extracto. **No es
asesoría financiera** y puede equivocarse leyendo el archivo de tu banco — por
eso te mostramos la tabla antes de sumar. La cifra que manda siempre es la de tu
banco.

## Licencia

MIT. Ver [LICENSE](LICENSE).

---

*Ningún banco patrocina esto, por razones evidentes.*
