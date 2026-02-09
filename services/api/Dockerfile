FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
RUN node -e "import('@google-cloud/firestore').then(()=>console.log('firestore-import-ok'))"
COPY src ./src

EXPOSE 8080
CMD ["node", "src/server.js"]
