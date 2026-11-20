#!/usr/bin/env python3
"""Mapa de cobertura: para cada cClassTrib de CBS/IBS vigente, verifica se a
calculadora oficial já tem o tratamento implementado.

Envia um item por cClassTrib ao endpoint de observabilidade e lê o estadoItem.
NAO_IMPLEMENTADO = tratamento ainda não implementado na calculadora.
INCONSISTENCIA_ENTRADA = implementado, mas exige dados específicos (NCM/NBS
vinculada, grupos obrigatórios etc.) que este teste genérico não fornece.

Uso: python3 demo/mapa_cobertura.py [--api URL] [--data 2027-03-10]
Saída: demo/resultados/mapa_cobertura.json
"""
import argparse
import json
import pathlib
import urllib.error
import urllib.parse
import urllib.request

SAIDA = pathlib.Path(__file__).resolve().parent / "resultados" / "mapa_cobertura.json"


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def post(url, corpo):
    req = urllib.request.Request(url, data=json.dumps(corpo).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8") or "{}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8080/api/calculadora")
    ap.add_argument("--data", default="2027-03-10")
    a = ap.parse_args()
    ano = int(a.data[:4])

    csts = get(f"{a.api}/dados-abertos/situacoes-tributarias/cbs-ibs?data={a.data}")
    linhas = []
    for cst in csts:
        for ct in cst["classificacoesTributarias"]:
            item = {"numero": 1, "cst": cst["codigo"], "cClassTrib": ct["codigo"], "baseCalculo": 1000.00,
                    "quantidade": 1, "unidade": "UN"}
            if ano >= 2027:
                item["aliquotasNominais"] = {"cbs": 8.8, "ibsEstadual": 0.05, "ibsMunicipal": 0.05}
            op = {"id": "cobertura", "versao": "1.0.0", "dhFatoGerador": f"{a.data}T10:00:00-03:00",
                  "municipio": 3550308, "uf": "SP", "itens": [item]}
            status, r = post(f"{a.api}/observabilidade/regime-geral", op)
            obj = (r.get("objetos") or [{}])[0]
            erros = obj.get("erros") or r.get("erros") or []
            linhas.append({
                "cst": cst["codigo"], "descricaoCst": cst["descricao"],
                "cClassTrib": ct["codigo"], "descricao": ct["descricao"],
                "estado": obj.get("estadoItem", f"HTTP {status}"),
                "erro": (erros[0].get("code", "") + " " + erros[0].get("title", "")).strip() if erros else "",
            })
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps({"data": a.data, "itens": linhas}, ensure_ascii=False, indent=2), encoding="utf-8")
    resumo = {}
    for l in linhas:
        resumo[l["estado"]] = resumo.get(l["estado"], 0) + 1
    print(f"{len(linhas)} cClassTribs testadas em {a.data}: {resumo}")
    for l in linhas:
        if l["estado"] == "NAO_IMPLEMENTADO":
            print(f'  não implementado: {l["cClassTrib"]} {l["descricao"][:80]}')


if __name__ == "__main__":
    main()
