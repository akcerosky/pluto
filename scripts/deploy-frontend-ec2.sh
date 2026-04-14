#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="${HOST_NAME:-65.1.22.81}"
SSH_USER="${SSH_USER:-ubuntu}"
KEY_PATH="${KEY_PATH:-$HOME/.ssh/manish-pluto.pem}"
REPO_URL="${REPO_URL:-https://github.com/akcerosky/pluto.git}"
BRANCH="${BRANCH:-razorpay-backend}"
APP_DIR="${APP_DIR:-/var/www/pluto}"
LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-.env.production}"

if [[ ! -f "$LOCAL_ENV_FILE" ]]; then
  echo "Missing $LOCAL_ENV_FILE in the repo root."
  exit 1
fi

if [[ ! -f "$KEY_PATH" ]]; then
  echo "SSH key not found at $KEY_PATH"
  exit 1
fi

SSH_TARGET="${SSH_USER}@${HOST_NAME}"

echo "==> Uploading production env to ${SSH_TARGET}:${APP_DIR}"
ssh -i "$KEY_PATH" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$SSH_TARGET" "mkdir -p '$APP_DIR'"
scp -i "$KEY_PATH" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$LOCAL_ENV_FILE" "${SSH_TARGET}:${APP_DIR}/.env.production"

echo "==> Deploying Pluto frontend on EC2"
ssh -i "$KEY_PATH" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$SSH_TARGET" bash <<EOF
set -euo pipefail

REPO_URL="$REPO_URL"
BRANCH="$BRANCH"
APP_DIR="$APP_DIR"

echo "==> Updating Pluto in \$APP_DIR from \$REPO_URL (\$BRANCH)"

if [ ! -d "\$APP_DIR/.git" ]; then
  echo "==> App directory is missing a git repo. Cloning fresh..."
  sudo mkdir -p "\$APP_DIR"
  sudo chown "\$(id -un):\$(id -gn)" "\$APP_DIR"
  git clone --branch "\$BRANCH" "\$REPO_URL" "\$APP_DIR"
fi

cd "\$APP_DIR"

echo "==> Pulling latest code"
git fetch origin "\$BRANCH"
git reset --hard "origin/\$BRANCH"

echo "==> Activating production env"
cp .env.production .env

echo "==> Installing dependencies"
npm ci

echo "==> Building frontend"
npm run build

echo "==> Checking Nginx config"
sudo nginx -t

echo "==> Reloading Nginx"
sudo systemctl reload nginx

echo "==> Deployment complete: https://pluto.akcero.ai"
EOF
