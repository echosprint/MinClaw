#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="minclaw-agent"
TAG="${1:-latest}"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"

echo "Building MinClaw agent container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"

${CONTAINER_RUNTIME} build -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test with:"
echo "  ${CONTAINER_RUNTIME} run -p 4000:4000 \\"
echo "    -e ANTHROPIC_API_KEY=\$ANTHROPIC_API_KEY \\"
echo "    -e HOST_URL=http://host.docker.internal:3000 \\"
echo "    -e SEARCH_API_KEY=\$SEARCH_API_KEY \\"
echo "    ${IMAGE_NAME}:${TAG}"
