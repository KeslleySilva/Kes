#!/usr/bin/env python3
"""Servidor da Calculadora da Reforma Tributária.

- Serve a interface web (ferramenta/web) em http://localhost:8000
- Repassa /api/calculadora/* para a API oficial da Receita Federal
  (calculadora-rtc-regime-regular), evitando problemas de CORS no navegador.
- Serve o catálogo de cenários (cenarios/cenarios.json).

Uso:
    python3 ferramenta/servidor.py [--porta 8000] [--api http://localhost:8080/api]

Também aceita a variável de ambiente RTC_API_URL. Só usa a biblioteca padrão.
"""
import argparse
import http.server
import os
import pathlib
import urllib.error
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
WEB = RAIZ / "ferramenta" / "web"
CENARIOS = RAIZ / "cenarios" / "cenarios.json"
REPASSAR_CABECALHOS = ("content-type", "x-warning-dados-simulados")


class Handler(http.server.SimpleHTTPRequestHandler):
    api = "http://localhost:8080/api"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB), **kw)

    def _proxy(self):
        destino = self.api.rstrip("/") + self.path[len("/api"):]
        tamanho = int(self.headers.get("Content-Length") or 0)
        corpo = self.rfile.read(tamanho) if tamanho else None
        cab = {"Accept": self.headers.get("Accept", "*/*")}
        if self.headers.get("Content-Type"):
            cab["Content-Type"] = self.headers["Content-Type"]
        req = urllib.request.Request(destino, data=corpo, method=self.command, headers=cab)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                self._responder(r.status, r.headers, r.read())
        except urllib.error.HTTPError as e:
            self._responder(e.code, e.headers, e.read())
        except (urllib.error.URLError, OSError) as e:
            msg = ('{"title":"API oficial indisponível","detail":"Não foi possível conectar em %s (%s). '
                   'Inicie a API oficial com scripts/instalar_api_oficial.sh."}' % (self.api, e)).encode()
            self._responder(502, {"Content-Type": "application/json"}, msg)

    def _responder(self, status, cabecalhos, corpo):
        self.send_response(status)
        for k, v in cabecalhos.items():
            if k.lower() in REPASSAR_CABECALHOS:
                self.send_header(k, v)
        self.send_header("Access-Control-Expose-Headers", "x-warning-dados-simulados")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self._proxy()
        if self.path.split("?")[0] == "/cenarios.json":
            dados = CENARIOS.read_bytes()
            return self._responder(200, {"Content-Type": "application/json; charset=utf-8"}, dados)
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self._proxy()
        self.send_error(404)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=int(os.environ.get("PORTA", 8000)))
    ap.add_argument("--api", default=os.environ.get("RTC_API_URL", "http://localhost:8080/api"))
    a = ap.parse_args()
    Handler.api = a.api
    srv = http.server.ThreadingHTTPServer(("0.0.0.0", a.porta), Handler)
    print(f"Calculadora RTC em http://localhost:{a.porta}  (API oficial: {a.api})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
