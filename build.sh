#!/bin/bash
# Rebuild public/ after editing src_app/*.js or designer/*
set -e
cd "$(dirname "$0")"
cat src_app/native.js src_app/saas1.js src_app/saas2.js src_app/saas3.js src_app/saas4.js src_app/saascom.js src_app/saascall.js src_app/saasimp.js src_app/saas5.js > src_app/saas.js
python3 build_saas.py
