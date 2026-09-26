FROM node:20-alpine
WORKDIR /hub
COPY server.js merge-drive.js start.js ./
VOLUME ["/hub/data"]
EXPOSE 8787
CMD ["node", "start.js"]
