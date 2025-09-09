# Telegram Profile Photos Archiver — v7.2

## Project Overview
This project was created to simplify and automate the process of archiving Telegram profile photos and videos. Previously, I managed my Telegram profile pictures manually — taking screenshots, cropping them with GIMP, and organizing them by hand. This tedious workflow inspired me to build a tool that fetches all profile photos and videos directly from Telegram, saving them in an orderly fashion, and generating a gallery for easy browsing.

## A Short History
Before this tool, archiving profile pictures meant:
- Manually scrolling through Telegram chats.
- Taking screenshots of each profile photo.
- Using GIMP to crop and resize images.
- Naming and organizing files by hand.
- Losing track of the order and missing out on videos.

This process was time-consuming and error-prone. The motivation for this project was to automate these steps and keep everything neat and accessible.

## Current Features
- **Correct Ordering**: Photos and videos are saved with indices where `0` corresponds to the oldest profile photo/video, and `N-1` to the most recent.
- **Video Support**: If Telegram returns profile videos, the script saves them with their correct extensions (e.g., `.mp4`).
- **Detailed Manifest**: A `manifest.json` file lists all items with their type and filename, which `index.html` uses to display both images and videos seamlessly.
- **Local Virtual Environment**: The project uses a local Python `venv` for dependencies, ensuring a controlled environment without hidden prompts or external interference.

## Usage Instructions
Run the main script to fetch profile photos and videos:

```bash
bash "/ruta/telegram-profile-photos-kit-v7.2/get_telegram_profile_photos.sh"
```

The output will be saved in the `./img/` folder as `0.jpg`, `1.jpg`, ..., and any videos as `k.mp4`. Open `index.html` in your browser to view the gallery of your archived profile photos and videos.

## Contributing and Copying
- To contribute or use this tool yourself, start by copying the `.example` script and filling in your Telegram API credentials.
- **Important:** Do **not** commit sensitive files such as `.session` files or the `get_telegram_profile_photos.sh` script containing your API keys to any public repository.
- This approach keeps your credentials safe and your project clean.

## Final Notes
This project has made archiving Telegram profile pictures much easier and cleaner than my previous manual workflow. It saves time, preserves the exact order of photos and videos, and provides a neat gallery to browse through memories effortlessly. I hope it helps others looking to organize their Telegram profile media as well!
