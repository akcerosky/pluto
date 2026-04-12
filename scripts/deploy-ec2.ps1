param(
  [string]$HostName = "65.1.22.81",
  [string]$User = "ubuntu",
  [string]$KeyPath = "C:\Users\prave\manish-pluto.pem",
  [string]$RepoUrl = "https://github.com/VigneshAkcero/pluto.git",
  [string]$Branch = "main",
  [string]$AppDir = "/var/www/pluto"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $KeyPath)) {
  throw "SSH key not found at: $KeyPath"
}

$remoteScript = @"
set -euo pipefail

REPO_URL='$RepoUrl'
BRANCH='$Branch'
APP_DIR='$AppDir'

echo "==> Updating Pluto in `$APP_DIR from `$REPO_URL (`$BRANCH)"

if [ ! -d "`$APP_DIR/.git" ]; then
  echo "==> App directory is missing a git repo. Cloning fresh..."
  sudo mkdir -p "`$APP_DIR"
  sudo chown "`$(id -un):`$(id -gn)" "`$APP_DIR"
  git clone --branch "`$BRANCH" "`$REPO_URL" "`$APP_DIR"
fi

cd "`$APP_DIR"

echo "==> Pulling latest code"
git fetch origin "`$BRANCH"
git reset --hard "origin/`$BRANCH"

echo "==> Installing dependencies"
npm ci

echo "==> Building"
npm run build

echo "==> Checking Nginx config"
sudo nginx -t

echo "==> Reloading Nginx"
sudo systemctl reload nginx

echo "==> Deployment complete: https://pluto.akcero.ai"
"@

$sshTarget = "$User@$HostName"
$sshArgs = @(
  "-i", $KeyPath,
  "-o", "IdentitiesOnly=yes",
  "-o", "StrictHostKeyChecking=accept-new",
  $sshTarget,
  "bash -s"
)

$remoteScript | ssh @sshArgs
