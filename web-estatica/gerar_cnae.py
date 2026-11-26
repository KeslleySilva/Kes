#!/usr/bin/env python3
"""Gera web-estatica/dados/cnae.json a partir da tabela oficial de CNAE do IBGE (CONCLA).

Uso: python3 web-estatica/gerar_cnae.py <subclasses.json>
O arquivo de entrada é a resposta de https://servicodados.ibge.gov.br/api/v2/cnae/subclasses
Cada linha de saída: [subclasse, descrição, classe, divisão, seção, atividades, compreende, não compreende]
"""
import json
import pathlib
import sys

SAIDA = pathlib.Path(__file__).resolve().parent / "dados" / "cnae.json"


def fmt(cod):  # 4929902 -> 4929-9/02
    return f"{cod[:4]}-{cod[4]}/{cod[5:]}"


def main(arq):
    dados = json.loads(pathlib.Path(arq).read_text(encoding="utf-8"))
    vistos, linhas = set(), []
    for s in dados:
        if s["id"] in vistos:
            continue
        vistos.add(s["id"])
        c = s["classe"]
        g = c["grupo"]
        d = g["divisao"]
        obs = [o.replace("\r", "") for o in (c.get("observacoes") or [])]
        compreende = next((o for o in obs if o.startswith("Esta classe compreende")), "")
        nao = next((o for o in obs if o.startswith("Esta classe NÃO compreende")), "")
        linhas.append([fmt(s["id"]), s["descricao"], c["descricao"], d["descricao"],
                       f'{d["secao"]["id"]} – {d["secao"]["descricao"]}', s.get("atividades") or [], compreende, nao])
    linhas.sort(key=lambda x: x[0])
    SAIDA.write_text(json.dumps(linhas, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(linhas)} subclasses CNAE -> {SAIDA} ({SAIDA.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1])
