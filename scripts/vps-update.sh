#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/smart-english"
cd "${APP_DIR}"

if [ -d .git ]; then
  echo "=== Đang kéo mã nguồn mới nhất từ Git ==="
  git pull
fi

echo "=== Đang cài đặt gói phụ thuộc & Build lại dự án ==="
npm install
npm --workspace @smart-elearning/api run build
npm --workspace @smart-elearning/web exec vite -- build

echo "=== Đang khởi động lại API không gián đoạn ==="
pm2 restart smart-english-api
echo "✅ Đã cập nhật thành công lên https://smartenglishcenter.site !"
