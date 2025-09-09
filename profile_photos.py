#!/usr/bin/env python3
import argparse
import asyncio
import json
import os
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError, PhoneNumberInvalidError
from PIL import Image

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp'}
VIDEO_EXTS = {'.mp4', '.webm', '.mkv', '.gif'}  # Telegram suele dar .mp4

def center_square_crop(img: Image.Image) -> Image.Image:
    w, h = img.size
    if w == h:
        return img
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))

def normalize_phone(p: str) -> str:
    p = p.strip().replace(" ", "")
    if not p.startswith("+"):
        raise ValueError("Teléfono debe empezar por + y prefijo (ej. +34...)")
    return p

async def run(args):
    api_id = args.api_id
    api_hash = args.api_hash
    phone = normalize_phone(args.phone)

    out_dir = os.path.abspath(os.path.expanduser(args.out))
    os.makedirs(out_dir, exist_ok=True)

    session_name = "telegram_profile_session"

    client = TelegramClient(session_name, int(api_id), api_hash)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            try:
                await client.send_code_request(phone)
            except PhoneNumberInvalidError:
                print("❌ Número inválido. Edita el script y corrige TELEGRAM_PHONE.")
                await client.disconnect()
                return
            code = input("Código recibido por Telegram/SMS: ").strip()
            try:
                await client.sign_in(phone=phone, code=code)
            except SessionPasswordNeededError:
                pw = input("Tienes verificación en dos pasos. Contraseña: ").strip()
                await client.sign_in(password=pw)

        me = await client.get_me()
        print(f"Conectado como: {me.first_name or me.username or me.id}")

        # 1) Descargar en orden que da Telegram (normalmente más reciente → más antigua)
        tmp_paths = []
        async for media in client.iter_profile_photos('me'):
            p = await client.download_media(media, file=out_dir + os.sep)
            if p:
                tmp_paths.append(p)

        if not tmp_paths:
            print("ℹ️ No se encontraron fotos/vídeos de perfil.")
            with open(os.path.join(out_dir, "manifest.json"), "w") as f:
                json.dump({"count": 0, "items": []}, f, indent=2)
            return

        # 2) Queremos 0 = la MÁS ANTIGUA, así que invertimos el orden
        #    Si Telegram los dio de más nuevo→más viejo, esto deja viejo→nuevo
        tmp_paths.reverse()

        manifest_items = []
        idx = 0
        for src in tmp_paths:
            _, ext = os.path.splitext(src)
            ext = ext.lower()

            if ext in VIDEO_EXTS:
                # Mantener vídeo; renombrar a i + su ext
                dest = os.path.join(out_dir, f"{idx}{ext}")
                try:
                    if os.path.abspath(dest) != os.path.abspath(src):
                        os.replace(src, dest)
                except Exception:
                    dest = src  # fallback
                manifest_items.append({"i": idx, "type": "video", "ext": ext.lstrip('.'), "file": os.path.basename(dest)})
            else:
                # Tratar como imagen: exportar a JPG cuadrado
                dest = os.path.join(out_dir, f"{idx}.jpg")
                try:
                    img = Image.open(src); img.load()
                    if not args.no_square:
                        img = center_square_crop(img)
                    img.save(dest, format="JPEG", quality=95)
                    if os.path.abspath(dest) != os.path.abspath(src):
                        try: os.remove(src)
                        except Exception: pass
                    manifest_items.append({"i": idx, "type": "image", "ext": "jpg", "file": os.path.basename(dest)})
                except Exception as e:
                    # Si no se puede abrir como imagen, intenta tratarlo como vídeo genérico
                    fallback_ext = ext if ext else ".bin"
                    dest = os.path.join(out_dir, f"{idx}{fallback_ext}")
                    try:
                        if os.path.abspath(dest) != os.path.abspath(src):
                            os.replace(src, dest)
                    except Exception:
                        dest = src
                    media_type = "video" if ext in VIDEO_EXTS else "file"
                    manifest_items.append({"i": idx, "type": media_type, "ext": fallback_ext.lstrip('.'), "file": os.path.basename(dest)})
            idx += 1

        # 3) Escribir manifest detallado
        manifest = {"count": len(manifest_items), "items": manifest_items}
        with open(os.path.join(out_dir, "manifest.json"), "w") as f:
            json.dump(manifest, f, indent=2)

        print(f"✅ Descargados {len(manifest_items)} elementos en: {out_dir}")
        print("   Enumerados 0..N-1 (0 = más antiguo). Soporte imagen y vídeo.")
    finally:
        await client.disconnect()

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--api-id", type=int, required=True)
    p.add_argument("--api-hash", type=str, required=True)
    p.add_argument("--phone", type=str, required=True)
    p.add_argument("--out", type=str, default="./img")
    p.add_argument("--no-square", action="store_true")
    args = p.parse_args()
    asyncio.run(run(args))

if __name__ == "__main__":
    main()
