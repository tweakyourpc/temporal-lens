#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('${ROOT_DIR}/manifest.json').version")"
ARCHIVE_NAME="temporal-lens-${VERSION}.zip"
ARCHIVE_PATH="${ROOT_DIR}/${ARCHIVE_NAME}"
STAGE_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${STAGE_DIR}"
}

trap cleanup EXIT

mkdir -p "${STAGE_DIR}/temporal-lens"

cp "${ROOT_DIR}/manifest.json" "${STAGE_DIR}/temporal-lens/"
cp -R \
  "${ROOT_DIR}/background" \
  "${ROOT_DIR}/content" \
  "${ROOT_DIR}/components" \
  "${ROOT_DIR}/popup" \
  "${ROOT_DIR}/styles" \
  "${ROOT_DIR}/utils" \
  "${STAGE_DIR}/temporal-lens/"

rm -f "${ARCHIVE_PATH}"

(
  cd "${STAGE_DIR}/temporal-lens"
  zip -qr "${ARCHIVE_PATH}" \
    manifest.json \
    background \
    content \
    components \
    popup \
    styles \
    utils
)

echo "Created ${ARCHIVE_PATH}"
