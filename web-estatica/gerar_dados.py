#!/usr/bin/env python3
"""Extrai do banco oficial da calculadora (calculadora-pro.db, gerado pelo Flyway
do repositório ReceitaFederal/calculadora-rtc-regime-regular) as tabelas que a
versão web estática usa para calcular no navegador.

Uso: python3 web-estatica/gerar_dados.py <caminho/calculadora-pro.db>
Saída: web-estatica/dados/{regras,ncm,municipios}.json
"""
import json
import pathlib
import sqlite3
import sys

SAIDA = pathlib.Path(__file__).resolve().parent / "dados"


def linhas(c, sql):
    cur = c.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def main(db):
    c = sqlite3.connect(db)
    SAIDA.mkdir(parents=True, exist_ok=True)
    versao = linhas(c, "select * from VERSAO_BASE_DADO order by 1 desc limit 1")
    regras = {
        "versaoDb": versao[0] if versao else None,
        "tributos": linhas(c, "select TBTO_ID id, TBTO_SIGLA sigla, TBTO_INICIO_VIGENCIA ini, TBTO_FIM_VIGENCIA fim from TRIBUTO"),
        "situacoes": linhas(c, """select s.SITR_ID id, s.SITR_CD cd, s.SITR_DESCRICAO descricao, s.SITR_INICIO_VIGENCIA ini, s.SITR_FIM_VIGENCIA fim,
                s.SITR_IND_GIBSCBS gIBSCBS, s.SITR_IND_GIBSCBSMONO gMono, s.SITR_IND_GRED gRed, s.SITR_IND_GDIF gDif,
                (select group_concat(t.TRST_TBTO_ID) from TRIBUTO_SITUACAO_TRIBUTARIA t where t.TRST_SITR_ID=s.SITR_ID) tributos
                from SITUACAO_TRIBUTARIA s"""),
        "classificacoes": linhas(c, """select CLTR_ID id, CLTR_CD cd, CLTR_DESCRICAO descricao, CLTR_MEMORIA_CALCULO memoria, CLTR_SITR_ID sitr,
                CLTR_TIPO_ALIQUOTA tipoAliquota, CLTR_NOMENCLATURA nomenclatura, CLTR_INICIO_VIGENCIA ini, CLTR_FIM_VIGENCIA fim,
                CLTR_IN_APROPRIACAO_CREDITOS_ADQUIRENTES_CBS credCbs, CLTR_IN_APROPRIACAO_CREDITOS_ADQUIRENTES_IBS credIbs,
                CLTR_CREDITO_OPERACAO_ANTECEDENTE credAnt, CLTR_DATA_ATUALIZACAO atualizacao
                from CLASSIFICACAO_TRIBUTARIA"""),
        "tratamentos": linhas(c, "select * from TRATAMENTO_TRIBUTARIO"),
        "tratClass": linhas(c, "select TRCL_CLTR_ID cl, TRCL_TRTR_ID tr, TRCL_INICIO_VIGENCIA ini, TRCL_FIM_VIGENCIA fim from TRATAMENTO_CLASSIFICACAO"),
        "reducoes": linhas(c, "select PERE_CLTR_ID cl, PERE_TBTO_ID tb, PERE_VALOR v, PERE_INICIO_VIGENCIA ini, PERE_FIM_VIGENCIA fim from PERCENTUAL_REDUCAO"),
        "aliqRef": linhas(c, "select ALRE_TBTO_ID tb, ALRE_VALOR v, ALRE_INICIO_VIGENCIA ini, ALRE_FIM_VIGENCIA fim from ALIQUOTA_REFERENCIA"),
        "redutorCompraGov": linhas(c, "select RCGO_VALOR v, RCGO_INICIO_VIGENCIA ini, RCGO_FIM_VIGENCIA fim from REDUTOR_COMPRA_GOVERNAMENTAL"),
        "transfCbs": linhas(c, "select TCEG_VALOR v, TCEG_INICIO_VIGENCIA ini, TCEG_FIM_VIGENCIA fim from TRANSFERENCIA_CBS_ENTE_GOV"),
        "fundamentacao": linhas(c, """select f.FDCL_CLTR_ID cl, l.FDLG_TEXTO_CURTO curto, f.FDCL_INICIO_VIGENCIA ini, f.FDCL_FIM_VIGENCIA fim
                from FUNDAMENTACAO_CLASSIFICACAO f join FUNDAMENTACAO_LEGAL l on l.FDLG_ID=f.FDCL_FDLG_ID"""),
        "ncmAplicavel": linhas(c, "select NCMA_ID id, NCMA_NCM_CD ncm, NCMA_CLTR_ID cl, NCMA_INICIO_VIGENCIA ini, NCMA_FIM_VIGENCIA fim from NCM_APLICAVEL"),
        "excecaoNcm": linhas(c, "select ENCM_NCM_CD ncm, ENCM_NCMA_ID ncma, ENCM_INICIO_VIGENCIA ini, ENCM_FIM_VIGENCIA fim from EXCECAO_NCM_APLICAVEL"),
        "nbsAplicavel": linhas(c, "select NBSA_ID id, NBSA_NBS_CD nbs, NBSA_CLTR_ID cl, NBSA_INICIO_VIGENCIA ini, NBSA_FIM_VIGENCIA fim from NBS_APLICAVEL"),
        "tiposDfe": linhas(c, """select TPDF_ID id, TPDF_SIGLA sigla, TPDF_DESCRICAO descricao, TPDF_TIPO modelo, TPDF_B_PERMITE_NCM_ZERO ncmZero,
                TPDF_B_POSSUI_TRATAMENTO_CALCULADORA tratado, TPDF_INICIO_VIGENCIA ini, TPDF_FIM_VIGENCIA fim from TIPO_DFE"""),
        "dfeClass": linhas(c, "select TDCL_CLTR_ID cl, TDCL_TPDF_ID tp, TDCL_INICIO_VIGENCIA ini, TDCL_FIM_VIGENCIA fim from TIPO_DFE_CLASSIFICACAO"),
        "ufs": linhas(c, "select UF_CD codigo, UF_SIGLA sigla, UF_NOME nome from UF order by UF_CD"),
        "nbs": linhas(c, "select NBS_CD cd, NBS_DESCRICAO descricao, NBS_INICIO_VIGENCIA ini, NBS_FIM_VIGENCIA fim from NBS"),
        "aliqClass": linhas(c, "select AADV_CLTR_ID cl, AADV_TBTO_ID tb, AADV_VALOR v, AADV_INICIO_VIGENCIA ini, AADV_FIM_VIGENCIA fim from ALIQUOTA_AD_VALOREM where AADV_CLTR_ID is not null"),
        "isNcm": [r["ncm"] for r in linhas(c, "select distinct AAVP_NCM_CD ncm from ALIQUOTA_AD_VALOREM_PRODUTO union select AARP_NCM_CD from ALIQUOTA_AD_REM_PRODUTO")],
    }
    ncm = linhas(c, "select NCM_CD cd, NCM_DESCRICAO d, NCM_INICIO_VIGENCIA ini, NCM_FIM_VIGENCIA fim from NCM")
    mun = linhas(c, "select MUNI_CD codigo, MUNI_UF_CD uf, MUNI_NOME nome from MUNICIPIO where MUNI_FIM_VIGENCIA is null order by MUNI_NOME")

    def gravar(nome, obj):
        p = SAIDA / nome
        p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{p.name}: {p.stat().st_size // 1024} KB")

    gravar("regras.json", regras)
    gravar("ncm.json", [[r["cd"], r["d"], r["ini"], r["fim"]] for r in ncm])
    gravar("municipios.json", [[r["codigo"], r["uf"], r["nome"]] for r in mun])


if __name__ == "__main__":
    main(sys.argv[1])
