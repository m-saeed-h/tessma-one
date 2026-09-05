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
# docker-compose overrides this with an explicit migrate/seed/rls chain before
# start:prod (see docker-compose.yml); platforms that just run the image as-is
# (Railway) need that chain baked into the default command instead.
CMD ["npm", "run", "start:railway"]
