FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY realtime.mjs ./

ENV REALTIME_HOST=0.0.0.0
ENV REALTIME_PORT=8787

EXPOSE 8787

CMD ["npm", "start"]
