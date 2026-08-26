# The supplied `apps/engineering/Dockerfile.dev` with three packages added.
#
# `npm ci` reaches @parcel/watcher@2.0.4, which predates that package's split
# into per-platform prebuilt binaries. There is no arm64 prebuild in the
# tarball, so node-gyp-build falls back to compiling from source, and
# node:20-bookworm-slim carries no Python, make or g++ — the build fails
# outright on Apple Silicon (finding 8 in NOTES.md).
#
# The supplied Dockerfile is left exactly as delivered, so this stands beside
# it rather than replacing it. Pinning `platform: linux/amd64` instead does
# nothing under podman, which ignores it and builds for the host regardless.
FROM node:20-bookworm-slim

WORKDIR /usr/src/app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 8080

CMD ["npm", "run", "start:api"]
