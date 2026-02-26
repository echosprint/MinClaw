FROM node:22-slim

# Global tools — browser capability + claude-code CLI
RUN npm install -g agent-browser @anthropic-ai/claude-code

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 4000
CMD ["npx", "tsx", "src/index.ts"]
