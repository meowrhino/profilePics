#!/usr/bin/env bash
# Ejemplo de script para descargar todas tus fotos/vídeos de perfil de Telegram
# ⚠️ Rellena API_ID, API_HASH y TELEGRAM_PHONE con tus datos antes de usar

API_ID=""
API_HASH=""
TELEGRAM_PHONE=""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/img"
VENV_DIR="${SCRIPT_DIR}/.venv"
mkdir -p "$OUT_DIR"

echo "➡️  Salida: $OUT_DIR"

PYTHON_BIN="$(command -v python3)"
if [ -z "$PYTHON_BIN" ]; then
  echo "❌ No se encontró python3. Instálalo y reintenta."
  exit 1
fi

# Crear venv si no existe
if [ ! -d "$VENV_DIR" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

VENV_PY="$VENV_DIR/bin/python"

echo "➡️  Instalando dependencias en el venv…"
"$VENV_PY" -m pip install --upgrade pip >/dev/null
"$VENV_PY" -m pip install "telethon>=1.34,<2" "pillow>=10,<12" >/dev/null

echo "➡️  Ejecutando descarga…"
"$VENV_PY" "$SCRIPT_DIR/profile_photos.py" \
  --api-id "$API_ID" \
  --api-hash "$API_HASH" \
  --phone "$TELEGRAM_PHONE" \
  --out "$OUT_DIR" "$@"

echo "✅ Hecho. Revisa $OUT_DIR y abre index.html para ver la galería."