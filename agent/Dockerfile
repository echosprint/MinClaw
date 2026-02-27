FROM node:22-slim

# Proxy args for apt-get (pass via --build-arg or docker-compose build args)
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy

# System dependencies for Chromium (required by agent-browser)
RUN apt-get update && apt-get install -y \
    git \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libgbm1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libcups2 \
    libdrm2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Point agent-browser at the system Chromium
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Global tools
RUN npm install -g agent-browser @anthropic-ai/claude-code

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Run as non-root
RUN chown -R node:node /app
USER node

EXPOSE 4000
CMD ["node", "dist/index.js"]
