# 🚗 Carnet DGT Agudelian

> **Novedades de esta revisión:** el temario se reestructuró a los **11
> temas principales del manual real** (antes eran 22/24, genéricos); cada
> tema conserva subtemas internos para clasificación fina, aunque
> visualmente solo se ven los 11 principales; los títulos de nota se generan
> automáticamente a partir del enunciado de la pregunta si no escribes uno;
> nueva identidad visual (azul marino + dorado, tipografía Fraunces); el
> apartado Manual se rediseñó pensando especialmente en iPhone/iOS (ver
> sección correspondiente).
>
> Novedades de revisiones anteriores: corregido el bug de "undefined
> preguntas" en simulacros; botón "Consulta a un experto" (chat IA vía
> OpenRouter); sistema de notas y "Cuaderno"; apartado "Manual" con visor de
> PDF; clasificación por tema, bloques de test, simulacros oficiales,
> progreso guardado/reanudable, selección de test por tarjetas.

Aplicación web local para practicar el examen teórico de la DGT (carnet B, con el
esquema de datos ya preparado para A1 y D). Inspirada en el espíritu y la
estructura de datos del repositorio [`donmerendolo/anki-carnet-conducir`](https://github.com/donmerendolo/anki-carnet-conducir),
pero como aplicación web interactiva en vez de mazos de Anki.

## Por qué este stack

| Capa | Elección | Justificación |
|---|---|---|
| Backend | **Node.js + Express** | Pediste reforzar Node.js; Express es minimalista, con documentación enorme y encaja bien con tu experiencia previa en backend (rutas, controladores, plantillas — muy similar al modelo mental de PHP). |
| Base de datos | **SQLite** (`better-sqlite3`) | Cero configuración: es un único archivo (`database/carnet.db`), no requiere levantar un servidor de base de datos aparte. Ideal para "ejecutarse en local fácilmente". Soporta perfectamente relaciones (preguntas-temas-respuestas-exámenes) mediante claves foráneas estándar en SQL, que ya conoces. `better-sqlite3` es síncrono, lo que simplifica mucho el código en un proyecto de este tamaño. |
| Vistas | **EJS (server-side rendering)** | Sintaxis muy cercana a mezclar PHP con HTML, así que el salto es pequeño. Se combina con JavaScript "vanilla" en el navegador para la parte interactiva del test (sin necesidad de un framework frontend ni de un paso de build). |
| Gráficos | **Chart.js** (vía CDN) | Ligero, sin dependencias de build, suficiente para las estadísticas por tema. |
| Sesiones | **express-session** (memoria) | Suficiente para un proyecto local/personal. Si algún día lo despliegas en un servidor con varios procesos, se recomienda cambiar el store de sesión (p.ej. `connect-sqlite3` o Redis). |
| Seguridad | **bcryptjs** + CSRF propio + `PRAGMA foreign_keys` + consultas parametrizadas | Ver sección "Seguridad" más abajo. |

No hay ningún framework frontend (React/Vue) porque no aporta valor en un proyecto
de este tamaño y añadiría complejidad de build innecesaria para un uso local.

## Diferencias con lo planteado inicialmente (y por qué)

Al inspeccionar el repositorio real `anki-carnet-conducir` para construir el
adaptador de importación, encontré una particularidad del dataset de origen
que conviene que conozcas:

**Las preguntas de origen NO están clasificadas por tema del temario.** El
JSON de origen (`data/data_B.json`, etc.) solo tiene `img`, `question`,
`a.`, `b.`, `c.`, `explanation` y `correct` — no hay ningún campo de tema.
Por eso el importador incluye una clasificación **heurística y opcional**
por palabras clave (`data/tema-keywords.json`, activable con
`--clasificar-temas`), pero no es fiable al 100%; lo más honesto es
dejarlo así documentado en vez de fingir una clasificación oficial que no
existe en la fuente. Puedes reclasificar preguntas manualmente con SQL
(`UPDATE preguntas SET tema_id = ... WHERE id = ...`) si te importa la
precisión.

El resto de la funcionalidad pedida está implementada tal cual se describió:
**siempre 3 opciones por pregunta** (igual que en el examen oficial real de
la DGT, y coincidiendo con el formato del dataset de origen, que tampoco
tiene una 4ª opción), y **cada opción de respuesta tiene su propia
explicación** (no solo una explicación general de la pregunta): al
responder ves por qué tu opción elegida es correcta o incorrecta, y si
fallas, también por qué la opción correcta lo es. Cuando la fuente de datos
solo trae una explicación general (es el caso de `anki-carnet-conducir`), la
aplicación genera automáticamente una explicación de contraste para las
opciones incorrectas ("Esta opción no es correcta, la respuesta correcta
es...") reutilizando esa explicación general — así ninguna opción se queda
sin explicación.

## Estructura del proyecto

```
carnet-dgt/
├── server.js                  # Punto de entrada del servidor Express
├── src/
│   ├── db/                    # Conexión, esquema SQL e inicialización
│   ├── middleware/            # Autenticación por sesión, CSRF, rate limit (chat IA)
│   ├── routes/                # Rutas HTTP (auth, páginas, tests, stats, notas, experto IA, manual)
│   ├── services/              # Lógica de negocio (tests, estadísticas, preguntas, notas, chat IA)
│   └── utils/                 # Validación/saneamiento de inputs
├── views/                     # Plantillas EJS (incluye cuaderno, nota-form, nota-detalle, manual)
├── public/
│   ├── css/style.css          # Sistema visual (variables, componentes)
│   ├── js/                    # test.js, test-nuevo.js, experto.js (chat IA), stats.js
│   ├── images/preguntas/      # Imágenes de las preguntas
│   └── pdf/manual.pdf         # Manual PDF servido por el apartado "Manual"
├── scripts/                   # Scripts CLI (siembra e importación) — SIN rutas web
├── data/                       # Datos de referencia (temas, dataset de ejemplo)
└── database/                    # Aquí se crea el archivo carnet.db (no se versiona)
```

**No existe ningún panel de administración ni ruta para crear/editar/borrar
preguntas desde el navegador**, tal y como pediste. Toda la carga de
contenido se hace por scripts de línea de comandos.

## Instalación y ejecución en local

> 📄 Si solo quieres los pasos para arrancar la aplicación (sin toda la
> explicación técnica de abajo), consulta **[`COMO-SERVIR.md`](./COMO-SERVIR.md)**.

Requisitos: Node.js 18+ (recomendado 20+).

> 📦 **Si has recibido este proyecto como archivo `.zip`, la base de datos
> (`database/carnet.db`) ya viene con los 11 temas, el banco completo de
> ~2945 preguntas reales del carnet B (con imágenes y clasificadas por tema),
> sus bloques de test por tema ya divididos, y 40 simulacros de examen ya
> generados. También incluye ya un manual en `public/pdf/manual.pdf`.**
> Solo necesitas instalar dependencias y arrancar:
> ```bash
> npm install
> cp .env.example .env
> npm start
> ```
> Abre `http://localhost:3000`, crea tu cuenta y empieza a hacer tests. Todo
> lo demás de esta sección es solo necesario si borras la base de datos y
> quieres regenerarla desde cero.
>
> El "Cuaderno" y el "Manual" funcionan sin configuración adicional. El
> chat **"Consulta a un experto"** es la única función que requiere un paso
> extra opcional: una API key gratuita de OpenRouter en tu `.env` — ver la
> sección [Consulta a un experto](#consulta-a-un-experto-chat-ia-contextual)
> más abajo. Sin ella, ese botón simplemente avisa que falta configurarlo.

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# (opcional) edita .env, especialmente SESSION_SECRET

# 3. Crear la base de datos y las tablas
npm run db:init

# 4. Cargar los 11 temas oficiales
npm run db:seed:temas

# 5a. Cargar solo un dataset de ejemplo (30-40 preguntas), para pruebas rápidas
npm run db:seed:sample
# 5b. O, en su lugar, descargar e importar el banco COMPLETO (~2945 preguntas)
npm run import:completo

# 6. Arrancar el servidor
npm start
```

Atajos: `npm run db:reset` hace init `--force` + temas + dataset de ejemplo.
`npm run db:seed:full` hace init + temas + banco completo, todo de una vez.

### Modo desarrollo

`npm run dev` usa `node --watch` para reiniciar el servidor automáticamente al
guardar cambios (requiere Node 18.11+).

## Alimentar el banco de preguntas con datos reales de `anki-carnet-conducir`

El dataset de ejemplo incluido (`npm run db:seed:sample`) es solo para probar
la app rápidamente. Para tener el **banco completo** hay dos vías: la
automática con un solo comando (recomendada si vas a usar la app solo como
usuario final, sin tocar nada más) o la manual (si además quieres las
imágenes).

### Opción A — Un solo comando (recomendada): descarga automática

Este comando descarga el JSON oficial del repositorio directamente desde
GitHub (es público y gratuito) y lo importa entero a la base de datos, sin
tener que clonar nada ni tocar rutas a mano:

```bash
npm run db:init
npm run db:seed:temas
npm run import:completo
npm run clasificar:temas -- --carnet B
npm run generar:bloques -- --carnet B
npm run generar:simulacros -- --carnet B --cantidad 40
npm start
```

O, más corto, todo junto con un solo comando:
```bash
npm run db:seed:full
npm start
```

Esto importa **todas las preguntas del carnet B**: el JSON de origen tiene
2947 preguntas en bruto (el README de `anki-carnet-conducir` indica 2890 en
su paquete `.apkg` final, la pequeña diferencia se debe a preguntas que ese
proyecto filtra al generar el mazo de Anki). El importador de este proyecto
descarta automáticamente cualquier entrada mal formada (sin una única
respuesta correcta clara), así que el número final puede variar unas pocas
unidades. Tarda solo unos segundos.

Para los otros carnets, o para probar con pocas preguntas antes de lanzar la
importación completa:

```bash
npm run import:completo -- --carnet A1        # ~900 preguntas de A1
npm run import:completo -- --carnet D         # ~165 preguntas de D
npm run import:completo -- --carnet todos     # B + A1 + D
npm run import:completo -- --limite 100 --dry-run   # probar sin escribir nada
```

**Limitación importante — las imágenes:** el JSON de preguntas es público y
se puede descargar por URL directa, pero las **imágenes** de las preguntas
NO están en GitHub: el propio proyecto de origen las distribuye aparte en un
`.zip` alojado en un servicio externo (Proton Drive), enlazado desde su
README, que requiere descarga manual desde el navegador (no es un fichero
público accesible por una URL simple y estable apta para automatizar). Por
eso `npm run import:completo` importa el enunciado, las 3 opciones, cuál es
la correcta y la explicación de cada pregunta, pero **sin imagen**.

Si consigues ese `.zip` de imágenes (descarga manual, ver el README de
`anki-carnet-conducir`), puedes asociarlas a las preguntas ya importadas con:

```bash
node scripts/asociar-imagenes.js --images /ruta/a/la/carpeta/descomprimida --carnet B
```

Este script vuelve a consultar el JSON de origen (el único sitio donde consta
qué imagen corresponde a cada pregunta), empareja cada pregunta de tu base de
datos por enunciado **y** por el conjunto de sus 3 opciones de respuesta
(para no confundir preguntas distintas que comparten el mismo enunciado pero
llevan una imagen y opciones distintas), copia el archivo a
`public/images/preguntas/<carnet>/` y actualiza la columna `imagen`. Añade
`--dry-run` para ver antes cuántas se asociarían sin escribir nada.

### Opción B — Manual, con imágenes incluidas

```bash
# 1. Clona el repositorio de origen
git clone https://github.com/donmerendolo/anki-carnet-conducir.git

# 2. Descarga el .zip de imágenes enlazado en el README de ese repositorio
#    y descomprímelo (verás carpetas images/A1, images/B, images/D)

# 3. Importa desde este proyecto, apuntando también a las imágenes
node scripts/import-from-anki-json.js \
  --input ./anki-carnet-conducir/data/data_B.json \
  --images /ruta/a/images/B \
  --carnet B
```

Parámetros disponibles (iguales en ambos scripts de importación):

- `--carnet`: `B` (por defecto), `A1` o `D`.
- `--clasificar-temas`: activa la clasificación heurística por palabras clave
  (ver limitación explicada arriba).
- `--limite N`: importa solo las primeras N preguntas (útil para probar).
- `--dry-run`: simula la importación sin escribir en la base de datos.
- `--force` (solo en `descargar-banco-completo.js`): permite re-importar
  aunque ya existan preguntas de ese origen/carnet (por defecto se salta
  para evitar duplicados si ejecutas el comando dos veces).

### Formato de origen soportado (referencia técnica)

Cada elemento del JSON de origen tiene esta forma (verificado contra el
repositorio real):

```json
{
  "img": "6288.jpg",
  "question": "Enunciado de la pregunta...",
  "a.": "Opción A",
  "b.": "Opción B",
  "c.": "Opción C",
  "explanation": "Texto de la explicación oficial",
  "correct": "0 0 1"
}
```

`correct` es una cadena de `0`/`1` separados por espacio, en el mismo orden
que `a.`, `b.`, `c.`, indicando cuál es la opción correcta.

Si tienes datos de otra fuente con estructura equivalente (tema, enunciado,
imagen, opciones, respuesta correcta, explicación), puedes adaptar tu propio
script reutilizando `src/services/questionService.js#insertQuestion`, que es
el punto de entrada único a la base de datos para insertar preguntas. Ten en
cuenta que exige **exactamente 3 opciones** con **1 correcta**; si no le
pasas una `explicacion` propia por opción, la genera automáticamente a
partir de la explicación general de la pregunta.

### Importar exámenes oficiales completos

El repositorio `anki-carnet-conducir` no distribuye los exámenes oficiales
como agrupaciones (solo el banco de preguntas suelto). Si quieres cargar
exámenes oficiales reales de `sede.dgt.gob.es` en el orden publicado, la vía
más simple es escribir un pequeño script que:

1. Inserte primero las preguntas del examen con `insertQuestion` (o las
   reutilice si ya existen — puedes buscar por coincidencia de enunciado).
2. Inserte un registro en `examenes_oficiales`.
3. Inserte, en `examen_preguntas`, una fila por pregunta con su `orden` (1 a
   30) para ese `examen_id`.

El script `scripts/seed-sample-data.js` ya contiene un ejemplo funcional
completo de este proceso (busca la sección "Crear un examen oficial de
demostración") que puedes tomar como plantilla.

## Temario: 11 temas principales del manual real (+ subtemas internos)

El temario de la app está estructurado según **los 11 temas principales de
tu manual real** (Definiciones, La Vía, El Alumbrado, Maniobras,
Señalización, Transporte, Técnicas de conducción, Seguridad vial,
Mantenimiento del vehículo, Comportamiento en caso de accidente,
Documentación), definidos en `data/temas.json`. Cada uno conserva además sus
**subtemas** (p. ej. "2.5 Distancia de seguridad entre vehículos") en la
tabla `subtemas` — se guardan por si en el futuro quieres filtrar más fino,
pero **la experiencia principal del usuario es siempre sobre los 11 temas**:
tarjetas de tema, bloques de test, filtros de repaso, notas del cuaderno y
estadísticas todos usan esos 11 temas de forma consistente.

**Clasificación por tema** (`scripts/clasificar-preguntas.js`): asigna un
tema a cada pregunta puntuando coincidencias de palabras clave por tema
(`data/tema-keywords.json`, refactorizado para las 11 categorías del
manual) — las frases más específicas puntúan más que las genéricas. Es una
aproximación heurística: clasifica correctamente alrededor del 78% del
banco completo; el resto se queda sin tema si no encuentra ninguna
coincidencia clara (esas preguntas solo aparecen en el modo aleatorio, no en
"test por tema" ni en el repaso filtrado por tema). Se ejecuta con:
```bash
npm run clasificar:temas -- --carnet B
```

**"Sin categorizar":** las preguntas sin ninguna coincidencia clara de
palabras clave no se dejan huérfanas — se agrupan automáticamente en un
tema especial "Sin categorizar" (numero `0`), con sus propios bloques de
test, exactamente igual que cualquier otro tema. Así puedes seguir haciendo
test de ellas desde "Test por tema" en vez de que solo aparezcan en el modo
aleatorio.

**Si en el futuro cambias el temario** (por ejemplo, un manual distinto con
otra estructura), usa este proceso seguro (no hay sistema de migraciones
formal, así que se hace a mano pero de forma controlada):
1. Edita `data/temas.json` (y `data/tema-keywords.json` a juego).
2. Borra los temas y bloques de tema actuales y reclasifica desde cero:
   ```bash
   node -e "const db=require('./src/db/connection'); db.pragma('foreign_keys=OFF'); db.exec(\"DELETE FROM examen_preguntas WHERE examen_id IN (SELECT id FROM examenes_oficiales WHERE tema_id IS NOT NULL); DELETE FROM examenes_oficiales WHERE tema_id IS NOT NULL; UPDATE preguntas SET tema_id=NULL, subtema_id=NULL; UPDATE tests SET tema_id=NULL; UPDATE notas SET tema_id=NULL; DELETE FROM temas;\"); db.pragma('foreign_keys=ON');"
   npm run db:seed:temas
   npm run clasificar:temas -- --carnet B
   npm run generar:bloques -- --carnet B --force
   ```
Los simulacros oficiales (mezclados, sin tema) no se ven afectados por este proceso.

**Simulacros "estilo examen oficial"** (`scripts/generar-examenes-oficiales.js`):
agrupa preguntas reales del banco en lotes de 30, imitando el formato del
examen oficial DGT (30 preguntas, máx. 3 fallos para aprobar). **Importante
para que no haya confusión:** no son actas de examen histórico literales.
Investigué si existía alguna forma gratuita y automatizable de descargar los
exámenes oficiales reales de `sede.dgt.gob.es`, y encontré que el único
proyecto que lo hacía (por ingeniería inversa de su web,
[`alvarolozano/dgt-test-downloader`](https://github.com/alvarolozano/dgt-test-downloader))
quedó descontinuado en 2025 porque la DGT cambió su web; su autor ahora solo
mantiene una API de pago (Apify/RapidAPI). Ante la ausencia de una fuente
gratuita fiable, esta es la alternativa honesta: mismas preguntas reales,
mismo formato de examen, dejando claro en la propia interfaz y en la base de
datos que son simulacros generados, no actas oficiales. Se ejecutan con:
```bash
npm run generar:simulacros -- --carnet B --cantidad 40
```

Ambos pasos ya están integrados en `npm run db:seed:full` (ver más abajo), y
ya vienen aplicados en la base de datos incluida si has recibido este
proyecto como `.zip`.

## Modos de test

- **Aleatorio**: 30 preguntas al azar de todo el banco.
- **Por tema**: eliges un tema (tarjeta) y luego un bloque de ese tema
  (tarjeta "Test 1", "Test 2"...). Los temas con muchas preguntas se dividen
  automáticamente en bloques de hasta 30 preguntas cada uno; los que tienen
  menos de 30 tienen un único bloque. Genéralos con
  `npm run generar:bloques -- --carnet B`.
- **Simulacro oficial**: eliges una tarjeta de entre los simulacros
  generados (30 preguntas reales en formato oficial; ver limitación
  explicada arriba: no son actas históricas literales).
- **Repaso de fallos**: tarjetas por tema con el nº de preguntas falladas en
  rojo (se guardan en cuanto respondes, aunque no termines el test), o
  "todos los temas" a la vez. Los temas sin fallos aparecen deshabilitados.

**Progreso guardado:** si dejas un bloque de tema o un simulacro a medias,
la tarjeta correspondiente muestra una barra con el % completado la próxima
vez que entres a `/test/nuevo`, y al pulsarla **continúas el mismo intento**
en vez de empezar uno nuevo desde cero. Si ya lo completaste alguna vez,
verás tu último resultado (apto/no apto) y podrás volver a intentarlo.

La regla de aprobado es la oficial de la DGT (máximo 3 fallos en un test de
30 preguntas) generalizada proporcionalmente para tests de otro tamaño; las
preguntas en blanco cuentan como fallo a efectos de aprobar.

## Consulta a un experto (chat IA contextual)

En la pantalla de test, tras responder una pregunta, el botón **"💬 Consulta
a un experto"** abre un chat que recibe automáticamente el contexto completo
de esa pregunta (enunciado, las 3 opciones, cuál es la correcta y la
explicación disponible) y responde como un profesor experto en el temario de
la DGT. Puedes seguir preguntando sobre esa misma pregunta; la conversación
se reinicia en cuanto pasas a otra pregunta (nunca se mezclan).

**Configuración (gratuita):**
1. Crea una cuenta en [openrouter.ai](https://openrouter.ai) (no requiere tarjeta).
2. Genera una API key en tu panel de OpenRouter.
3. Pégala en tu `.env`:
   ```
   OPENROUTER_API_KEY=sk-or-tu-clave-aqui
   ```
4. Reinicia el servidor (`npm start`).

Por defecto se usa el modelo `openrouter/free` (el enrutador automático de
OpenRouter a modelos `:free` disponibles en cada momento — el catálogo de
modelos gratuitos rota con frecuencia, así que esto evita tener que tocar el
código cuando un modelo concreto deja de estar disponible). Puedes fijar un
modelo `:free` concreto con `OPENROUTER_MODEL` en tu `.env` si lo prefieres.

Sin `OPENROUTER_API_KEY` configurada, el botón sigue apareciendo pero
muestra un aviso explicando que falta configurarlo (no rompe el resto de la
app). Hay un límite de 12 consultas por minuto por usuario para evitar abuso
(`src/middleware/rateLimit.js`, en memoria — ver limitación más abajo).

Arquitectura: `src/services/expertChatService.js` centraliza la llamada al
proveedor de IA en una única función (`preguntarAlExperto`), así que cambiar
de proveedor en el futuro (OpenAI, Anthropic, un modelo local...) solo
requiere tocar ese archivo, no las rutas ni el frontend. El endpoint es
`POST /api/expert-chat`, protegido con sesión + CSRF + rate limit; la clave
de API nunca se envía al navegador.

## Notas y Cuaderno

Puedes guardar notas de estudio desde dos sitios:
- El botón **"📝 Guardar en notas"** en cualquier pregunta (antes o después de responder).
- El botón **"Guardar en notas"** que aparece bajo cada respuesta del chat del experto.

También puedes crear notas sueltas (sin vincular a ninguna pregunta) desde
`/cuaderno/nueva`. Cada nota admite título, contenido, tema, categoría libre
y etiquetas (separadas por comas).

**Título automático:** si no escribes un título, la nota lo genera sola:
usa el enunciado de la pregunta vinculada (recortado de forma limpia, sin
cortar a mitad de palabra) o, si la nota no está ligada a ninguna pregunta,
usa "Nota rápida". Nunca queda vacío ni con textos genéricos tipo
"Explicación del experto" (`src/services/noteService.js#generarTituloPorDefecto`).

La sección **Cuaderno** (`/cuaderno`, enlazada en el menú principal) lista
todas tus notas con filtros por tema/categoría/etiqueta/origen y varios
órdenes (recientes, antiguas, alfabético, por tema, por categoría). Desde
ahí puedes abrir, editar o eliminar cualquier nota.

Datos: tabla `notas` (ver `src/db/schema.sql`), añadida sin migraciones
formales — el proyecto no tenía un sistema de migraciones, así que se sigue
el mismo patrón que ya usaba (`CREATE TABLE IF NOT EXISTS` en `schema.sql`,
aplicado con `node src/db/init-db.js` sin `--force`, que no borra datos
existentes y solo añade lo que falte).

## Manual (visor de PDF)

La sección **Manual** (`/manual`) se adapta según el dispositivo:

- **En escritorio/tablet**: visor de PDF embebido directamente en la página
  (vía `<iframe>` nativo del navegador, sin dependencias como PDF.js).
- **En móvil**: en vez de depender del `<iframe>` (los visores de PDF
  embebidos son conocidos por no funcionar bien en Safari de iOS — a veces
  se quedan en blanco o fuerzan una descarga en lugar de mostrar el
  contenido), se muestra directamente un botón grande **"Abrir manual"**
  que lo abre en el visor de PDF nativo del navegador a pantalla completa
  (más rápido, con zoom y búsqueda de texto, y sin el riesgo de que el
  visor embebido no cargue). El botón de descarga siempre está visible en
  ambos casos.

**Para sustituir el manual por otro PDF:** copia tu archivo a
`public/pdf/manual.pdf` (reemplazando el que hubiera, siempre con ese mismo
nombre) y recarga la página — no hace falta tocar código ni reiniciar el
servidor. Si el archivo no existe, la página lo indica con un mensaje claro
en vez de romperse.

## Identidad visual

La interfaz usa una paleta sobria de "documento oficial": azul marino
(`--navy`) como color estructural y dorado (`--gold`) como único acento,
sobre fondo neutro claro — deliberadamente distinta de las paletas
genéricas de IA (sin degradados, sin colores saturados). Tipografía Fraunces
(títulos, con carácter editorial) + Inter (interfaz) + JetBrains Mono
(números y datos). Todo el sistema de diseño vive en variables CSS al
principio de `public/css/style.css`, así que cambiar la paleta o la
tipografía en el futuro es tan sencillo como editar esas variables.

**Optimización para móvil (prioridad iPhone):** `viewport-fit=cover` +
`env(safe-area-inset-*)` para respetar el notch/home indicator en modales y
menús; todos los campos de formulario a 16px (evita el zoom automático de
iOS al enfocar un input); objetivos táctiles de al menos 44-48px; sin
scroll horizontal (tablas envueltas en contenedores con `overflow-x`); menú
de navegación en desplegable completo en pantallas estrechas.- Contraseñas con **bcrypt** (12 salt rounds), nunca en texto plano.
- Todas las consultas SQL usan **parámetros preparados** (`better-sqlite3`
  `prepare().run()/.get()/.all()`), nunca concatenación de strings.
- **Protección CSRF** propia (token por sesión, verificado en toda petición
  POST/PUT/DELETE, tanto en formularios como en `fetch` vía cabecera
  `X-CSRF-Token`).
- **Sanitización básica de inputs** de usuario (registro/login) eliminando
  etiquetas HTML.
- Cookies de sesión `httpOnly` y `sameSite=lax`.
- Claves foráneas activas (`PRAGMA foreign_keys = ON`) para mantener la
  integridad referencial.

Nota: `express-session` con almacenamiento en memoria es adecuado para uso
local/personal. Si despliegas esto en un servidor real con más de un
proceso/usuario, cambia a un store persistente (`connect-sqlite3`, Redis...).

## Scripts disponibles (`package.json`)

| Comando | Qué hace |
|---|---|
| `npm start` | Arranca el servidor |
| `npm run dev` | Arranca el servidor con recarga automática |
| `npm run db:init` | Crea las tablas (no borra datos existentes) |
| `npm run db:init -- --force` | Borra y recrea la base de datos desde cero |
| `npm run db:seed:temas` | Inserta/actualiza los 11 temas oficiales |
| `npm run db:seed:sample` | Carga el dataset de ejemplo (30-40 preguntas) + examen de demo |
| `npm run db:reset` | Init `--force` + seed temas + seed sample, todo junto (dataset de ejemplo) |
| `npm run db:seed:full` | Init + seed temas + descarga banco completo + clasifica por tema + **genera bloques por tema y simulacros**, todo junto |
| `npm run clasificar:temas -- --carnet B` | (Re)clasifica las preguntas existentes por tema |
| `npm run generar:bloques -- --carnet B` | Divide cada tema en bloques de test de hasta 30 preguntas |
| `npm run generar:simulacros -- --carnet B --cantidad 40` | Genera simulacros de 30 preguntas en formato oficial |
| `npm run import:completo` | Descarga e importa el banco completo desde GitHub (ver arriba) |
| `npm run import -- --input ... --carnet B` | Importa desde un JSON local, opcionalmente con imágenes (ver arriba) |

## Próximos pasos posibles (no incluidos, ideas para ampliar)

- Soporte multi-carnet en la interfaz (selector A1/B/D; el esquema ya lo admite).
- Exportar resultados a PDF.
- Modo "examen cronometrado" con cuenta atrás visible.
- Reclasificación manual de temas vía un pequeño script CLI interactivo.
