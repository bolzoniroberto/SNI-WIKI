FROM node:20-slim

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install --omit=optional

COPY src ./src
RUN npx tsc

EXPOSE 8080

CMD ["node", "dist/server.js"]
