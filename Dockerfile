FROM node:11-alpine as builder

ENV IN_DOCKER=1
WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --only=production

FROM node:11-alpine

ENV NODE_ENV=production
ENV IN_DOCKER=1
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules/ ./node_modules/

COPY ./src/ ./src
CMD [ "node", "./src/index.js" ]
