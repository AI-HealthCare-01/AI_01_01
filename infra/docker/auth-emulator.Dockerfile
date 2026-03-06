# syntax=docker/dockerfile:1.7

FROM node:20-alpine
WORKDIR /app

RUN npm init -y >/dev/null 2>&1 \
  && npm install --no-audit --no-fund --save-exact firebase-tools@15.8.0

COPY firebase.json ./
COPY .firebaserc ./

EXPOSE 9099 4000
CMD ["npx", "--no-install", "firebase", "emulators:start", "--only", "auth", "--project", "demo-mindsight"]
