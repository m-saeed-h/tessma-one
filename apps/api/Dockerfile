FROM node:22-slim
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
# Build, then fail loudly if the entry file isn't where start:prod expects it.
RUN npm run build && test -f dist/main.js
EXPOSE 4000
CMD ["npm", "run", "start:prod"]
