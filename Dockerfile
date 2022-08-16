FROM node:16.4.2-alpine3.11 AS deps

RUN apk --no-cache add curl

WORKDIR /app
COPY package.json .
RUN ["npm", "install"]

FROM node:16-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json

COPY src ./src
COPY tsconfig.json .
RUN ["npm", "run-script", "build"]

FROM node:16-alpine AS final
WORKDIR /app

COPY src .
COPY .env ./.env
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
RUN ["npm", "install", "--omit=dev"]

EXPOSE 8080

ENTRYPOINT [ "npm" , "run-script", "start"]