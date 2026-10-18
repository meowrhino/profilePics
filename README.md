# profilePics — archivo de fotos de perfil de Telegram

Archivo completo de mis fotos y vídeos de perfil de Telegram, con una galería
para navegarlos. Se actualiza solo cada domingo.

**En vivo:** <https://profile.meowrhino.studio/>

## Por qué

Antes esto se hacía a mano: capturas de pantalla, recortar en GIMP, renombrar,
ordenar. Se perdía el orden y los vídeos de perfil no había forma de guardarlos.
El script se baja todo directamente de Telegram y lo deja numerado.

## Cómo está montado

```
index.html          galería (HTML + CSS, sin dependencias)
js/gallery.js       lógica: scroll, navegación, teclado, fotos y vídeos bajo demanda
js/text2num.js      opcional — convierte texto a índice. Quita el <script> y se desactiva
img/                0.jpg … N.jpg, algún N.mp4, y manifest.json
fonts/              Agdasima en woff2 (sin Google Fonts)
profile_photos.py   descarga desde Telegram y escribe el manifest
_headers            cabeceras de cacheo para Cloudflare
.github/workflows/  el archivado semanal
```

### Numeración

`0` es la foto **más antigua** y `N-1` la más reciente. Los índices son estables
mientras solo añadas fotos por el final, que es lo que hace el archivado
semanal. Ojo: si algún día borras una foto antigua, todos los índices posteriores
se desplazan y los enlaces `#123` que hayas compartido pasan a apuntar a otra
imagen.

### manifest.json

```json
{ "count": 988, "items": [ { "i": 0, "type": "image", "ext": "jpg", "file": "0.jpg" } ] }
```

`type` es `image` o `video`; la galería usa eso para pintar un `<img>` o un
`<video>`.

## Uso de la galería

| Acción | Qué hace |
|---|---|
| Scroll / arrastrar | moverse por el archivo |
| `←` `→` | ir a la anterior / siguiente |
| `Inicio` / `Fin` | primera / última |
| Teclear un número | salta a ese índice |
| Teclear una palabra | la convierte a un índice (ver `js/text2num.js`) |
| `Enter` | confirma sin esperar |
| `Esc` | cancela lo tecleado |
| Clic en una foto | la centra |
| Hover (con ratón) | la vuelve un círculo |

La URL lleva el índice en el hash, así que `…/#987` es un enlace directo.

## Ejecutar el archivador a mano

Copia el script de ejemplo y rellena tus credenciales:

```bash
cp get_telegram_profile_photos_PUBLIC.sh get_telegram_profile_photos.sh
```

Edita `API_ID`, `API_HASH` y `TELEGRAM_PHONE` (los sacas de
<https://my.telegram.org>) y lánzalo:

```bash
bash get_telegram_profile_photos.sh
```

Crea un `.venv`, instala `telethon` y `pillow`, y deja el resultado en `./img/`.
La primera vez te pedirá el código que llega por Telegram. Con `--no-square`
se salta el recorte cuadrado y guarda las fotos con su encuadre original.

> **No comitees `get_telegram_profile_photos.sh` ni los `*.session`.** Llevan
> tus credenciales y tu sesión de Telegram. Los dos están en `.gitignore`.

## Archivado automático

`.github/workflows/reijimaigo.yml` corre los domingos a las 05:00 UTC, baja lo
nuevo y commitea `img/`. Necesita estos secrets en el repo:

| Secret | Qué es |
|---|---|
| `API_ID` | de my.telegram.org |
| `API_HASH` | de my.telegram.org |
| `TELEGRAM_PHONE` | con prefijo, `+34…` |
| `TELEGRAM_SESSION_B64` | la sesión de Telethon en base64 |

Para regenerar la sesión cuando caduque:

```bash
base64 -i telegram_profile_session.session | pbcopy
```

y pégalo en el secret `TELEGRAM_SESSION_B64`.

## Despliegue

Se sirve por dos sitios a la vez, y los dos se actualizan solos con cada push:

- **Cloudflare Worker** (static assets) en `profile.meowrhino.studio` — el
  dominio principal. Configurado en `wrangler.jsonc`; `.assetsignore` decide qué
  no se sube.
- **GitHub Pages** en la URL `github.io` del repo.

Por eso **no hay fichero `CNAME`**: si GitHub Pages reclamara
`profile.meowrhino.studio` chocaría con el Worker y redirigiría la URL de
`github.io` fuera. Sin `CNAME`, cada uno sirve lo suyo. Si añades uno, rompes
esto.

Despliegue manual del Worker:

```bash
npx wrangler deploy
```

### Cacheo

`_headers` marca `/img/*` como inmutable durante un año — las fotos nunca
cambian, solo se añaden. Como las reglas de `_headers` se **combinan** en vez de
sobrescribirse, y solo se admite un comodín sin sufijo (no existe `/img/*.jpg`),
no se puede excluir de ahí `img/manifest.json`, que sí cambia cada semana. Por
eso `gallery.js` lo pide con `?v=<timestamp>`. Si quitas una de las dos cosas,
quita la otra.
