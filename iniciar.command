#!/bin/bash
cd "$(dirname "$0")"
if command -v python3 >/dev/null; then python3 serve.py; else echo "Instala Python 3 desde https://www.python.org/downloads/"; read -r; fi
