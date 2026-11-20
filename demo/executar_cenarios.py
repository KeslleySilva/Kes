#!/usr/bin/env python3
"""Executa todos os cenários de cenarios/cenarios.json contra a API oficial
da Calculadora RTC (regime regular) e grava as respostas reais.

Uso:
    python3 demo/executar_cenarios.py [--api http://localhost:8080/api/calculadora]

Saída: demo/resultados/resultados.json e um arquivo por cenário.
Só usa a biblioteca padrão do Python.
"""
import argparse
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CENARIOS = RAIZ / "cenarios" / "cenarios.json"
SAIDA = RAIZ / "demo" / "resultados"


def chamar(api, cen, corpo):
    url = api + cen["caminho"]
    if cen.get("query"):
        url += "?" + urllib.parse.urlencode(cen["query"])
    dados = None
    cabecalhos = {"Accept": "application/json, application/xml, text/plain"}
    if cen["metodo"] == "POST":
        tipo = cen.get("tipoConteudo", "application/json")
        cabecalhos["Content-Type"] = tipo
        dados = corpo.encode("utf-8") if isinstance(corpo, str) else json.dumps(corpo).encode("utf-8")
    req = urllib.request.Request(url, data=dados, method=cen["metodo"], headers=cabecalhos)
    inicio = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            status, hdrs, bruto = r.status, dict(r.headers), r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        status, hdrs, bruto = e.code, dict(e.headers), e.read().decode("utf-8")
    ms = int((time.time() - inicio) * 1000)
    try:
        resposta = json.loads(bruto)
    except ValueError:
        resposta = bruto
    avisos = {k: v for k, v in hdrs.items() if k.lower().startswith("x-warning")}
    return {"url": url, "status": status, "ms": ms, "avisos": avisos, "resposta": resposta, "bruto": bruto}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8080/api/calculadora")
    args = ap.parse_args()

    cenarios = json.loads(CENARIOS.read_text(encoding="utf-8"))
    SAIDA.mkdir(parents=True, exist_ok=True)
    resultados = {}
    for cen in cenarios:
        corpo = cen.get("corpo")
        if cen.get("corpoDe"):  # encadeia: usa a resposta de outro cenário como corpo
            anterior = resultados[cen["corpoDe"]]
            corpo = anterior["bruto"]
        r = chamar(args.api, cen, corpo)
        r["corpoEnviado"] = corpo
        resultados[cen["id"]] = r
        print(f'{cen["id"]:4} HTTP {r["status"]} {r["ms"]:5} ms  {cen["titulo"]}')
        (SAIDA / f'{cen["id"]}.json').write_text(
            json.dumps({k: v for k, v in r.items() if k != "bruto"}, ensure_ascii=False, indent=2), encoding="utf-8")

    pacote = {
        "geradoEm": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "api": args.api,
        "cenarios": cenarios,
        "resultados": {k: {kk: vv for kk, vv in v.items() if kk != "bruto"} for k, v in resultados.items()},
    }
    (SAIDA / "resultados.json").write_text(json.dumps(pacote, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nResultados gravados em {SAIDA}")


if __name__ == "__main__":
    sys.exit(main())
