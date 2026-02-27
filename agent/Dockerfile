FROM minclaw-agent-base:latest

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Run as non-root
RUN chown -R node:node /app && chmod 777 /home/node
USER node

EXPOSE 4000
CMD ["node", "dist/index.js"]
