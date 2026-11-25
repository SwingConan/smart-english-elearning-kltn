#!/usr/bin/env bash
set -euo pipefail

DOMAIN="smartenglishcenter.site"
APP_DIR="/var/www/smart-english"
DB_NAME="v2_wave01_dev_test_w04b_br136_demo_20261111_42db33"
DB_USER="wave01"
DUMP_FILE="${APP_DIR}/smart_english_kltn.dump"

echo "=== [1/7] Tạo 2GB RAM ảo (Swap) để máy chủ chạy mượt 100% ==="
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
free -h

echo "=== [2/7] Cài đặt gói hệ thống, Nginx, Certbot & PostgreSQL ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y sudo curl git unzip ca-certificates gnupg build-essential python3 nginx certbot python3-certbot-nginx postgresql postgresql-contrib openssl

echo "=== [3/7] Cài đặt Node.js 22 LTS & PM2 ==="
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v22.* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v
npm install -g pm2

echo "=== [4/7] Khởi tạo PostgreSQL & Khôi phục Database KLTN ==="
systemctl enable --now postgresql

DB_PASS_FILE="${APP_DIR}/.db_pass.secret"
if [ -f "${DB_PASS_FILE}" ]; then
  DB_PASS="$(cat "${DB_PASS_FILE}")"
else
  DB_PASS="$(openssl rand -hex 18)"
  echo "${DB_PASS}" > "${DB_PASS_FILE}"
  chmod 600 "${DB_PASS_FILE}"
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN SUPERUSER PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN SUPERUSER PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SQL

DB_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")"
if [ "${DB_EXISTS}" != "1" ]; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
  sudo -u postgres psql -c "COMMENT ON DATABASE ${DB_NAME} IS 'SMART_ENGLISH_DISPOSABLE_E2E_V1';"
  echo "Đang khôi phục dữ liệu từ ${DUMP_FILE}..."
  PGPASSWORD="${DB_PASS}" pg_restore -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" --no-owner --role="${DB_USER}" "${DUMP_FILE}" || true
fi

sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 <<'SQL'
COMMENT ON DATABASE v2_wave01_dev_test_w04b_br136_demo_20261111_42db33 IS 'SMART_ENGLISH_DISPOSABLE_E2E_V1';
CREATE SCHEMA IF NOT EXISTS br136_bank_check AUTHORIZATION wave01;
DROP FUNCTION IF EXISTS br136_bank_check.assert_target();
CREATE OR REPLACE FUNCTION br136_bank_check.assert_target()
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_database() <> 'v2_wave01_dev_test_w04b_br136_demo_20261111_42db33'
     OR current_user <> 'wave01'
     OR shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database') <> 'SMART_ENGLISH_DISPOSABLE_E2E_V1'
  THEN
    RAISE EXCEPTION 'VPS_DEMO_TARGET_MISMATCH';
  END IF;
  RETURN true;
END;
$$;
ALTER FUNCTION br136_bank_check.assert_target() OWNER TO wave01;
SELECT 'RESTORED_USERS=' || count(*) FROM users;
SELECT 'RESTORED_CLASSES=' || count(*) FROM class_offerings;
SQL

echo "=== [5/7] Cài đặt thư viện Linux (argon2, prisma) & tạo apps/api/.env ==="
cd "${APP_DIR}"
ENV_FILE="${APP_DIR}/apps/api/.env"
if [ ! -f "${ENV_FILE}" ]; then
  SESSION_SECRET="$(openssl rand -hex 32)"
  cat > "${ENV_FILE}" <<EOF
PORT=3000
WEB_ORIGIN="https://${DOMAIN}"
TRUST_PROXY="loopback"
REPORT_CENTER_TIME_ZONE="Asia/Ho_Chi_Minh"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"
E2E_DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"
SHADOW_DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}_shadow"
SESSION_SECRET="${SESSION_SECRET}"
EMAIL_PROVIDER="console"
EOF
  chmod 600 "${ENV_FILE}"
fi
grep -q '^SHADOW_DATABASE_URL=' "${ENV_FILE}" || echo "SHADOW_DATABASE_URL=\"postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}_shadow\"" >> "${ENV_FILE}"

if [ ! -f "${APP_DIR}/node_modules/@nestjs/core/package.json" ]; then
  npm ci --no-audit --no-fund
fi
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}" \
SHADOW_DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}_shadow" \
npm --workspace @smart-elearning/api exec prisma -- generate --config prisma.config.ts
if [ ! -f "${APP_DIR}/apps/api/dist/src/app.module.js" ]; then
  npm --workspace @smart-elearning/api run build
fi
if [ ! -f "${APP_DIR}/apps/web/dist/index.html" ]; then
  npm --workspace @smart-elearning/web exec vite -- build
fi

echo "=== [6/7] Khởi chạy API qua PM2 ==="
pm2 delete smart-english-api >/dev/null 2>&1 || true
pm2 start "${APP_DIR}/scripts/vps-runtime.cjs" \
  --name smart-english-api \
  --cwd "${APP_DIR}" \
  --node-args="--env-file=apps/api/.env"
pm2 save
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

API_OK=0
for i in $(seq 1 35); do
  if curl -fsS http://127.0.0.1:3000/api/demo/environment >/dev/null 2>&1; then
    echo "✅ API đã sẵn sàng tại 127.0.0.1:3000!"
    API_OK=1
    break
  fi
  sleep 1
done
if [ "${API_OK}" != "1" ]; then
  echo "⚠️ API chưa phản hồi sau 35s, in log kiểm tra:"
  pm2 logs smart-english-api --lines 50 --nostream || true
  exit 1
fi

echo "=== [7/7] Cấu hình Nginx cho ${DOMAIN} ==="
cat > /etc/nginx/sites-available/smart-english <<EOF
server {
    listen 80;
    server_name www.${DOMAIN};
    return 301 https://${DOMAIN}\$request_uri;
}

server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 50M;

    root ${APP_DIR}/apps/web/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 90s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/smart-english /etc/nginx/sites-enabled/smart-english
nginx -t
systemctl reload nginx

chmod +x "${APP_DIR}/scripts/vps-update.sh" || true
ln -sf "${APP_DIR}/scripts/vps-update.sh" "${APP_DIR}/update.sh"

echo "=========================================================="
echo "HOÀN TẤT CÀI ĐẶT HỆ THỐNG SMART ENGLISH TRÊN VPS!"
echo "Bước cuối để bật HTTPS xanh mượt, hãy chạy:"
echo "certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email --redirect"
echo "=========================================================="
