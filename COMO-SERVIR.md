# Cómo servir el proyecto — Carnet DGT Agudelian

Esta guía explica, paso a paso, cómo poner en marcha la aplicación. Si solo
quieres usarla como usuario final (hacer tests, sin tocar código ni scripts),
con la sección 1 te basta.

---

## 1. Uso local normal (lo habitual)

Requisitos previos: tener instalado **Node.js 18 o superior** (recomendado
20+). Puedes comprobar tu versión con:

```bash
node -v
```

Si no lo tienes instalado: [https://nodejs.org](https://nodejs.org) (elige la
versión LTS).

### Pasos

Desde la carpeta del proyecto (`carnet-dgt/`):

```bash
# 1. Instalar las dependencias del proyecto (se descargan a node_modules/)
npm install

# 2. Crear el archivo de configuración a partir de la plantilla
cp .env.example .env

# 3. Arrancar el servidor
npm start
```

Si todo ha ido bien, verás en la terminal:

```
🚗 Carnet DGT Agudelian escuchando en http://localhost:3000
```

Abre esa URL (`http://localhost:3000`) en tu navegador, crea una cuenta desde
"Regístrate aquí" y ya puedes empezar a hacer tests.

> ✅ Este proyecto se entrega con la base de datos (`database/carnet.db`) ya
> cargada con los 11 temas oficiales y el banco completo de preguntas del
> carnet B (con sus imágenes). No necesitas ejecutar ningún script de
> importación para empezar a usarlo.

### Para detener el servidor

Pulsa `Ctrl + C` en la terminal donde lo lanzaste.

### Para volver a arrancarlo más adelante

Solo hace falta repetir el paso 3 (`npm start`) desde la carpeta del
proyecto; no hace falta repetir `npm install` salvo que borres la carpeta
`node_modules/` o cambies de ordenador.

---

## 2. Acceder desde otro dispositivo de tu misma red (móvil, tablet...)

Por defecto el servidor solo escucha en `localhost` (tu propio ordenador). Si
quieres abrirlo desde el móvil conectado al mismo Wi-Fi:

1. Averigua la IP local de tu ordenador:
   - Windows: `ipconfig` (busca "Dirección IPv4")
   - macOS/Linux: `ifconfig` o `ip a` (busca algo como `192.168.x.x`)
2. Con el servidor arrancado, entra desde el móvil a `http://<esa-ip>:3000`
   (por ejemplo `http://192.168.1.35:3000`).
3. Si no carga, revisa que el firewall de tu ordenador permite conexiones
   entrantes al puerto 3000.

No es necesario cambiar nada en el código: Express ya escucha en todas las
interfaces de red por defecto.

---

## 3. Modo desarrollo (si vas a tocar el código)

```bash
npm run dev
```

Usa `node --watch`, así que el servidor se reinicia solo cada vez que
guardas un cambio en un archivo `.js`. (Requiere Node 18.11 o superior).

---

## 4. Cambiar el puerto

Por defecto la app usa el puerto **3000**. Para cambiarlo, edita tu archivo
`.env`:

```
PORT=8080
```

Y vuelve a arrancar con `npm start`.

---

## 4.1. Activar el chat "Consulta a un experto" (opcional)

Esta función necesita una API key gratuita de OpenRouter. Sin ella, el resto
de la app funciona igual; solo ese botón muestra un aviso.

1. Crea una cuenta gratuita en https://openrouter.ai (sin tarjeta).
2. Genera una API key en tu panel.
3. Añádela a tu `.env`:
   ```
   OPENROUTER_API_KEY=sk-or-tu-clave-aqui
   ```
4. Reinicia el servidor.

## 4.2. Cambiar el manual PDF

Sustituye `public/pdf/manual.pdf` por tu propio archivo (mismo nombre exacto)
y recarga `/manual` en el navegador. No hace falta reiniciar el servidor ni
tocar código.

## 5. Reiniciar la base de datos desde cero

Si quieres borrar tu progreso/usuarios y volver a empezar:

```bash
npm run db:reset
```

Esto borra `database/carnet.db`, la vuelve a crear, carga los 11 temas y un
pequeño dataset de ejemplo (30-40 preguntas). Si después quieres el banco
completo con imágenes otra vez, consulta el `README.md`, sección "Alimentar
el banco de preguntas" (importación automática + `scripts/asociar-imagenes.js`
para volver a enlazar las imágenes si las tienes descargadas en tu equipo).

---

## 6. Dejarlo funcionando de forma más permanente (opcional, avanzado)

Esto **no es necesario** para uso normal en tu propio ordenador, pero si
quieres que seguir corriendo en un servidor/NAS sin tener una terminal
abierta todo el rato, una opción sencilla es usar [`pm2`](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start server.js --name carnet-dgt
pm2 save
pm2 startup   # sigue las instrucciones que te muestre para que arranque solo al reiniciar el equipo
```

Comandos útiles de `pm2`:

```bash
pm2 status              # ver si sigue corriendo
pm2 logs carnet-dgt      # ver los logs en vivo
pm2 restart carnet-dgt   # reiniciar
pm2 stop carnet-dgt      # detener
```

> Esta app está pensada para uso local/personal. Si la vas a exponer a
> internet (no solo a tu red local), como mínimo deberías: servirla detrás de
> HTTPS (por ejemplo con un proxy como Caddy o Nginx), poner un
> `SESSION_SECRET` largo y aleatorio en `.env`, y activar `cookie.secure =
> true` en `server.js`. No se ha diseñado ni probado como servicio público
> expuesto a internet.

---

## 7. Solución de problemas

### En Windows, `npm install` falla con errores de "node-gyp", "Visual Studio" o "better-sqlite3"

Esto ocurre si tu versión de Node.js es tan reciente que el paquete de base
de datos (`better-sqlite3`) todavía no tiene un binario precompilado para
ella, y npm intenta compilarlo desde el código fuente en tu propio equipo
(para lo cual sí hace falta tener instalado Visual Studio con el workload de
C++, algo que la mayoría de gente no tiene instalado).

**Este proyecto ya usa una versión de `better-sqlite3` (v12+) pensada para
traer binario precompilado también para Node.js 24 en Windows**, así que si
descargaste el proyecto después de esta corrección no deberías ver este
error. Si aun así te aparece:

1. Borra `node_modules` y `package-lock.json` de la carpeta del proyecto.
2. Vuelve a ejecutar `npm install`.
3. Si el error persiste, lo más rápido suele ser instalar una versión LTS de
   Node.js algo más asentada (por ejemplo Node 20 o 22, desde
   [nodejs.org](https://nodejs.org)) en vez de la versión "Current" más
   nueva, ya que las versiones LTS son las que primero reciben binarios
   precompilados de la mayoría de paquetes. Instálala, cierra y vuelve a
   abrir la terminal, comprueba con `node -v` que se está usando esa versión,
   y repite `npm install`.
4. Como último recurso (no debería hacer falta), puedes instalar las
   "Build Tools for Visual Studio" con el workload "Desktop development with
   C++" para permitir compilar el paquete desde el código fuente.

### `npm start` da error "Cannot find module '...'" justo después de un `npm install` que falló

Si `npm install` terminó con errores (como el caso anterior), es probable que
se quedara a medias y falten paquetes por instalar. Soluciónalo repitiendo
`npm install` hasta que termine sin errores antes de hacer `npm start`.

---

## Resumen rápido (por si solo quieres copiar y pegar)

```bash
npm install
cp .env.example .env
npm start
```

Y abre `http://localhost:3000`.
