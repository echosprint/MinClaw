#!/bin/sh
COMPOSE_FILE="docker-compose.yml:docker-compose-$([ "$(uname)" = Linux ] && echo linux || echo macos).yml" docker compose "$@"
