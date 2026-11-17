#!/usr/bin/env python3
"""Servidor local para Pronunciation Lab.

Sirve esta carpeta en http://localhost:8765 con las cabeceras que el navegador
necesita para usar varios núcleos del procesador (cross-origin isolation),
y abre el navegador. Detener: Ctrl+C.
"""
import http.server
import os
import socketserver
import sys
import webbrowser

PORT = next((int(a) for a in sys.argv[1:] if a.isdigit()), 8765)
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
    }

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # silencioso


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    url = f"http://localhost:{PORT}/"
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Pronunciation Lab en {url}  (Ctrl+C para detener)")
        if "--no-browser" not in sys.argv:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nDetenido.")
