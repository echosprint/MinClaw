#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RUNTIME="${CONTAINER_RUNTIME:-docker}"

if [[ "$1" == "--base" ]]; then
  echo "Building base image (slow, run once)..."
  ${RUNTIME} build -f Dockerfile.base -t minclaw-agent-base:latest .
  echo "Base image built: minclaw-agent-base:latest"
  exit 0
fi

if ! ${RUNTIME} image inspect minclaw-agent-base:latest &>/dev/null; then
  echo "Base image not found, building it first (slow, run once)..."
  ${RUNTIME} build -f Dockerfile.base -t minclaw-agent-base:latest .
fi

echo "Building agent image..."
${RUNTIME} build -t minclaw-agent:latest .
echo "Done: minclaw-agent:latest"
