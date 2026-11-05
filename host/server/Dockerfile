FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.ts ./

EXPOSE 3000

CMD ["npm", "start"]
