#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env (scoped to this script process)
[[ -f ../.env ]] && set -a && source ../.env && set +a

RUNTIME="${CONTAINER_RUNTIME:-docker}"
OS="$(uname -s)"
BUILD_ARGS=()

# --- Proxy (auto-detect from env) ---
# Detect proxy: HTTPS_PROXY > https_proxy > HTTP_PROXY > http_proxy
PROXY="${HTTPS_PROXY:-${https_proxy:-${HTTP_PROXY:-${http_proxy:-}}}}"
if [[ -n "$PROXY" ]]; then
  if [[ "$OS" == "Linux" ]]; then
    # Linux: --network=host shares the host network stack,
    # so 127.0.0.1 inside the build reaches the host proxy directly
    BUILD_ARGS+=(--network=host)
    BUILD_ARGS+=(--build-arg "https_proxy=${PROXY}" --build-arg "http_proxy=${PROXY}")
  else
    # macOS: Docker runs in a VM, 127.0.0.1 is the VM itself.
    # Rewrite to host.docker.internal so the build can reach the host proxy
    DOCKER_PROXY="${PROXY//127.0.0.1/host.docker.internal}"
    DOCKER_PROXY="${DOCKER_PROXY//localhost/host.docker.internal}"
    BUILD_ARGS+=(--build-arg "https_proxy=${DOCKER_PROXY}" --build-arg "http_proxy=${DOCKER_PROXY}")
  fi
  echo "Proxy: $PROXY (OS: $OS)"
fi

# --- Mirror (on by default, off with USE_MIRROR=false in .env) ---
if [[ "${USE_MIRROR:-}" != "false" ]]; then
  BUILD_ARGS+=(--build-arg "DEBIAN_MIRROR=mirrors.ustc.edu.cn")
  BUILD_ARGS+=(--build-arg "NPM_REGISTRY=https://registry.npmmirror.com")
  echo "Mirror: USTC + npmmirror"
fi

# --- Build ---
if [[ "$1" == "--base" ]]; then
  echo "Building base image (slow, run once)..."
  ${RUNTIME} build "${BUILD_ARGS[@]}" -f Dockerfile.base -t minclaw-agent-base:latest .
  echo "Base image built: minclaw-agent-base:latest"
  exit 0
fi

if ! ${RUNTIME} image inspect minclaw-agent-base:latest &>/dev/null; then
  echo "Base image not found, building it first (slow, run once)..."
  ${RUNTIME} build "${BUILD_ARGS[@]}" -f Dockerfile.base -t minclaw-agent-base:latest .
fi

echo "Building agent image..."
${RUNTIME} build "${BUILD_ARGS[@]}" -q -t minclaw-agent:latest . > /dev/null
echo "Done: minclaw-agent:latest"
