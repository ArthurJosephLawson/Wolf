#!/usr/bin/env bash
# Install the system packages Wolf needs on Arch Linux (and derivatives).
#
# Safe to re-run: pacman is a no-op for anything already installed.
# Run as your normal user; it will ask for sudo only when it needs to.
set -euo pipefail

PACKAGES=(
  # Toolchain
  nodejs npm
  rustup
  # Tauri v2 system dependencies (WebKitGTK 4.1, not 4.0)
  webkit2gtk-4.1
  gtk3
  openssl
  sqlite
  pkgconf
  # Desktop integration: tray icon, notifications, autostart, file dialogs
  libayatana-appindicator
  libappindicator-gtk3
  # Bundling .deb / AppImage output
  linux-headers
  base-devel
  curl
  file
  wget
  appmenu-gtk-module
  librsvg
  imagemagick
)

missing=()
for pkg in "${PACKAGES[@]}"; do
  if pacman -Qi "$pkg" >/dev/null 2>&1; then
    printf '  ok    %s\n' "$pkg"
  else
    missing+=("$pkg")
    printf '  MISS  %s\n' "$pkg"
  fi
done

if [ ${#missing[@]} -eq 0 ]; then
  echo "All system dependencies are installed."
  exit 0
fi

echo
echo "Installing ${#missing[@]} missing package(s): ${missing[*]}"
echo "This needs sudo. Continuing..."
sudo pacman -S --needed --noconfirm "${missing[@]}"
echo
echo "Done. Next: npm install && npm run dev"
