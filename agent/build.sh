#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env from repo root so DEBIAN_MIRROR, DOCKER_BUILD_PROXY, etc. are available
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$REPO_ROOT/.env"
  set +a
fi

RUNTIME="${CONTAINER_RUNTIME:-docker}"

# Optional mirror for apt-get (useful in China):
#   DEBIAN_MIRROR=mirrors.tuna.tsinghua.edu.cn bash build.sh --base
BASE_ARGS=()
if [[ -n "${DEBIAN_MIRROR}" ]]; then
  BASE_ARGS+=(--build-arg "DEBIAN_MIRROR=${DEBIAN_MIRROR}")
fi
if [[ -n "${DOCKER_BUILD_PROXY}" ]]; then
  BASE_ARGS+=(--build-arg "https_proxy=${DOCKER_BUILD_PROXY}" --build-arg "http_proxy=${DOCKER_BUILD_PROXY}")
fi

if [[ "$1" == "--base" ]]; then
  echo "Building base image (slow, run once)..."
  ${RUNTIME} build "${BASE_ARGS[@]}" -f Dockerfile.base -t minclaw-agent-base:latest .
  echo "Base image built: minclaw-agent-base:latest"
  exit 0
fi

if ! ${RUNTIME} image inspect minclaw-agent-base:latest &>/dev/null; then
  echo "Base image not found, building it first (slow, run once)..."
  ${RUNTIME} build "${BASE_ARGS[@]}" -f Dockerfile.base -t minclaw-agent-base:latest .
fi

echo "Building agent image..."
${RUNTIME} build -q -t minclaw-agent:latest . > /dev/null
echo "Done: minclaw-agent:latest"
