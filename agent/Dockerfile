FROM minclaw-agent-base:latest

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Workspace — agent works here, cannot touch /app
RUN mkdir -p /workspace/memory

# Symlink .claude into workspace so Claude Code finds project config
RUN ln -s /app/.claude /workspace/.claude

# Lock down app code so agent cannot self-modify
RUN chown -R node:node /workspace && chmod 777 /home/node \
    && chmod -R a-w /app

# Entrypoint
RUN printf '#!/bin/bash\nset -e\nexec node /app/dist/index.js\n' \
    > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

USER node
WORKDIR /workspace

EXPOSE 4000
CMD ["/app/entrypoint.sh"]
