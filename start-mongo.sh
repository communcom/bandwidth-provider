#!/usr/bin/env bash
docker rm -f bandwidth_mongo
set -e
docker run --name bandwidth_mongo -p 27017:27017 -d mongo
