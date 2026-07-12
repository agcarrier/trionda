#!/bin/zsh
# TRIONDA daily data refresh → commit → push → deploy.
# Designed for launchd: absolute paths, all output to the log.
set -euo pipefail

REPO="/Users/andrew/Documents/Claude/projects/Websites/trionda"
NODE_BIN="/Users/andrew/.nvm/versions/node/v24.15.0/bin"
LOG="$REPO/tools/refresh.log"
export PATH="$NODE_BIN:/usr/bin:/bin:/usr/local/bin"

{
  echo "── $(date '+%Y-%m-%d %H:%M:%S') refresh start ──"
  cd "$REPO"

  /usr/bin/python3 tools/refresh_data.py || { echo "parser aborted — leaving site untouched"; exit 0; }

  if git diff --quiet -- bracket-data.js; then
    echo "no changes in tournament data — nothing to deploy"
    exit 0
  fi

  git add bracket-data.js
  git -c user.name="agcarrier" -c user.email="agcarrier@outlook.com" \
      commit -m "Data refresh: tournament results $(date '+%Y-%m-%d')"
  git push origin main
  "$NODE_BIN/vercel" deploy --prod --yes --scope agcarriers-projects > /dev/null 2>&1 \
    && echo "deployed to production" \
    || echo "WARN: vercel deploy failed — data committed to git only"
  echo "── done ──"
} >> "$LOG" 2>&1
