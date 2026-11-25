FROM node:22-bookworm-slim

# Install ffmpeg and ffprobe for HLS stream muxing, probing, and transcoding
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV FFMPEG_PATH=ffmpeg
ENV FFPROBE_PATH=ffprobe

RUN chown -R node:node /app
USER node

EXPOSE 3000

CMD ["npm", "start"]
