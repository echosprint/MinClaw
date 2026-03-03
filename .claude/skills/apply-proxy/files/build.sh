#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RUNTIME="${CONTAINER_RUNTIME:-docker}"

# Detect proxy from environment and convert to Docker-reachable address
PROXY="${HTTPS_PROXY:-${https_proxy:-${HTTP_PROXY:-${http_proxy:-}}}}"
PROXY_ARGS=()
if [[ -n "$PROXY" ]]; then
  DOCKER_PROXY="${PROXY//127.0.0.1/host.docker.internal}"
  PROXY_ARGS=(--build-arg "https_proxy=${DOCKER_PROXY}" --build-arg "http_proxy=${DOCKER_PROXY}")
fi

if [[ "$1" == "--base" ]]; then
  echo "Building base image (slow, run once)..."
  ${RUNTIME} build "${PROXY_ARGS[@]}" -f Dockerfile.base -t minclaw-agent-base:latest .
  echo "Base image built: minclaw-agent-base:latest"
  exit 0
fi

if ! ${RUNTIME} image inspect minclaw-agent-base:latest &>/dev/null; then
  echo "Base image not found, building it first (slow, run once)..."
  ${RUNTIME} build "${PROXY_ARGS[@]}" -f Dockerfile.base -t minclaw-agent-base:latest .
fi

echo "Building agent image..."
${RUNTIME} build "${PROXY_ARGS[@]}" -q -t minclaw-agent:latest . > /dev/null
echo "Done: minclaw-agent:latest"
