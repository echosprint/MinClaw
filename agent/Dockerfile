FROM minclaw-agent-base:latest

WORKDIR /app
COPY package*.json ./
RUN npm install

# Copy and compile TypeScript source separately so changes to .claude/
# skills or other non-code files don't invalidate the build cache
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

# Copy remaining files — changes here don't trigger recompile
COPY .claude/ ./.claude/

# Workspace — agent works here, cannot touch /app
RUN mkdir -p /workspace/memory

# Symlink .claude into workspace so Claude Code finds project config
RUN ln -s /app/.claude /workspace/.claude

# Lock down app code so agent cannot self-modify
# Exclude node_modules to avoid chmod on tens of thousands of files
RUN chown -R node:node /workspace && chmod 777 /home/node \
    && find /app -not -path '/app/node_modules*' -exec chmod a-w {} +

# Entrypoint
RUN printf '#!/bin/bash\nset -e\nexec node /app/dist/index.js\n' \
    > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

USER node
WORKDIR /workspace

EXPOSE 4000
CMD ["/app/entrypoint.sh"]
