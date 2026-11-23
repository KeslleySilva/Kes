// Motor do Simples Nacional (IBS e CBS) para o navegador.
//
// Tradução para JavaScript do cálculo "não assistido" da calculadora oficial
// (github.com/ReceitaFederal/calculadora-rtc-simples-nacional, endpoint
// POST /calculadora/observabilidade/simples-nacional/nao-assistido):
// CalculoSimplesUnificadoService, ProcessadorItemSimples, EscolhaParAliquotasService,
// SimplesNacionalCalculoService, ValidacaoNomenclaturaAdapter/Service e TotalSimplesDomain.
// Os parâmetros (regimes, enquadramentos, tipos de receita, atividades, pares de ISS,
// transição de compra governamental) vêm das tabelas oficiais extraídas por gerar_dados.py.
(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) module.exports = fabrica(require("decimal.js"));
  else raiz.MotorSimplesRTC = fabrica(raiz.Decimal);
})(typeof self !== "undefined" ? self : this, function (DecimalBase) {
  "use strict";
  const D = DecimalBase.clone({ precision: 200, rounding: DecimalBase.ROUND_HALF_EVEN });
  const HE = D.ROUND_HALF_EVEN;
  const ZERO = new D(0);

  const vig = (ini, fim, d) => String(ini).slice(0, 10) <= d && (!fim || String(fim).slice(0, 10) >= d);
  const informado = (v) => v != null && String(v).trim() !== "";
  const inteiro = (v) => { if (!informado(v)) return null; const t = String(v).trim(); return /^[+-]?\d+$/.test(t) ? parseInt(t, 10) : null; };
  const moeda = (v) => (v == null ? null : v.toFixed(2, HE));
  function aliqTxt(v) { // 3v2-4
    if (v == null) return null;
    let s = v.toDecimalPlaces(4, HE).toFixed(4).replace(/0+$/, "");
    const [i, f = ""] = s.split(".");
    return i + "." + (f.length < 2 ? f.padEnd(2, "0") : f);
  }
  const brMoeda = (v) => { const [i, f] = (v || ZERO).toFixed(2, HE).split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + f; };
  const brPct = (v) => {
    let s = (v || ZERO).toDecimalPlaces(4, HE).toFixed(4);
    let [i, f] = s.split("."); f = f.replace(/0+$/, ""); if (f.length < 2) f = f.padEnd(2, "0");
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + f;
  };
  const FORMATO_ALIQ = /^\d{1,3}(\.\d{1,34})?$/;
  const FORMATO_VALOR = /^\d{1,13}(\.\d{1,2})?$/;
  const DESC_ALIQ = "até 3 dígitos inteiros e até 34 casas decimais, sem notação científica (ex.: 1.6839)";
  const DESC_VALOR = "até 13 dígitos inteiros e até 2 casas decimais, sem notação científica (ex.: 1000.00)";

  const COD = {
    "VSN-001": "Base de cálculo do Simples ausente", "VSN-002": "Base de cálculo do Simples inválida (negativa/fora do formato)",
    "VSN-003": "Valor do Imposto Seletivo inválido (negativo/fora do formato)", "VSN-004": "Alíquota pCBSSN ausente",
    "VSN-005": "Alíquota pCBSSN inválida (negativa/fora do formato)", "VSN-006": "Alíquota pIBSSN ausente",
    "VSN-007": "Alíquota pIBSSN inválida (negativa/fora do formato)", "VSN-010": "Número do item ausente",
    "VSN-011": "Lista de itens vazia", "VSN-012": "Data do fato gerador ausente/inválida", "VSN-013": "Dado global obrigatório ausente",
    "VSN-014": "Tipo de documento fiscal (tpDoc) ausente", "VSN-015": "Tipo de documento fiscal (tpDoc) não suportado",
    "VSN-016": "Código de Regime Tributário (CRT) ausente/inválido", "VSN-017": "Tipo de regime do IBS/CBS (tpRegimeIBSCBS) inválido",
    "VSN-018": "tpRegimeIBSCBS incompatível com o CRT", "VSN-019": "Operação fora do escopo do cálculo do Simples Nacional",
    "VSN-020": "Código de Classificação Tributária (cClassTrib) ausente", "VSN-021": "cClassTrib desconhecido ou fora de vigência",
    "VSN-022": "cClassTrib incompatível com o tpDoc", "VSN-023": "Código de Atividade do Simples Nacional incompatível com cClassTrib",
    "VSN-024": "Tipo de ente governamental (tpEnteGov) inválido", "VSN-025": "Parametrização de compra governamental indisponível para a data",
    "VSN-026": "Parametrização do cálculo do Simples Nacional indisponível para a data", "VSN-027": "cClassTrib sem tratamento implementado no cálculo do Simples Nacional",
    "VSN-030": "Situação perante o Simples Nacional (opSimpNac) ausente ou inválida",
    "VSN-031": "Regime de apuração do IBS e da CBS no Simples (regApIBSCBSSN) incoerente ou inválido",
    "VSN-032": "Regime de apuração dos tributos no Simples (regApTribSN) incoerente ou inválido",
    "VSN-033": "Campo de regime não pertence ao documento", "VSN-034": "Número de itens não admitido pelo documento",
    "VSN-035": "Imposto Seletivo não admitido pelo documento", "VSN-036": "Tributação do ISSQN (tribISSQN) ausente ou inválida",
    "VSN-037": "Retenção do ISSQN (tpRetISSQN) ausente ou inválida", "VSN-038": "Tipo de benefício municipal (tpBM) inválido",
    "VSN-039": "Alíquotas efetivas do contribuinte (aliquotasEfetivas) ausentes", "VSN-040": 'Fator "r" (fatorR) ausente',
    "VSN-041": "NCM e NBS simultâneos", "VSN-042": "NCM incompleto", "VSN-043": "NBS incompleto", "VSN-044": "Nomenclatura obrigatória",
    "VSN-045": "Nomenclatura incompatível com o documento", "VSN-046": "Nomenclatura não permitida", "VSN-047": "NCM não aplicável",
    "VSN-048": "NBS não aplicável", "VSN-049": "NCM desconhecido", "VSN-050": "NBS desconhecido", "VSN-051": "Formato de nomenclatura inválido",
    "VSN-999": "Falha técnica no cálculo do item",
  };
  const erroGlobal = (code, campo, detail) => ({ type: "erros?codigo=" + code, title: COD[code], code, pointer: "#/" + campo, detail });
  class ErrosGlobais extends Error { constructor(erros) { super("erros"); this.erros = erros; } }

  const SIGLAS = { NFEABI: "NFe ABI", NFE: "NFe", NFCE: "NFCe", CTE: "CTe", CTEOS: "CTe OS", CTESIMPLIFICADO: "CT-e Simplificado", BPE: "BPe", BPETA: "BPe TA", BPETM: "BPe TM", NF3E: "NF3e", NFSE: "NFSe", NFSEVIA: "NFSe Via", NFCOM: "NFCom", DERE: "DERE", DIR: "DIR", DUIMP: "Duimp", NFAG: "NFAg", NFGAS: "NFGas" };
  const norm = (s) => String(s || "").toUpperCase().replace(/[\s\-_]/g, "");

  function criar(R, NCM) {
    const SN = R.sn;
    const ncmIdx = new Map();
    for (const [cd, , ini, fim] of NCM || []) { if (!ncmIdx.has(cd)) ncmIdx.set(cd, []); ncmIdx.get(cd).push({ ini, fim }); }
    const existeNcm = (n, d) => (ncmIdx.get(n) || []).some((r) => vig(r.ini, r.fim, d));
    const existeNbs = (n, d) => R.nbs.some((x) => x.cd === n && vig(x.ini, x.fim, d));
    const sitCbs = new Set(R.situacoes.filter((s) => String(s.tributos || "").split(",").includes("2")).map((s) => s.id));
    const tipoDfePorModelo = (tp, d) => R.tiposDfe.filter((t) => t.modelo === tp && vig(t.ini, t.fim, d));

    /* ----- consultas de parâmetros (ParametroCalculoSimplesService e repositórios) ----- */
    const classifVigentes = (cd, d) => R.classificacoes.filter((c) => c.cd === cd && vig(c.ini, c.fim, d) && sitCbs.has(c.sitr)).sort((a, b) => b.ini.localeCompare(a.ini));
    const naoImplementado = (cd, d) => R.classificacoes.some((c) => c.cd === cd && sitCbs.has(c.sitr) && vig(c.ini, c.fim, d) &&
      R.tratClass.some((tc) => tc.cl === c.id && vig(tc.ini, tc.fim, d) && (() => { const t = R.tratamentos.find((x) => x.TRTR_ID === tc.tr); return t && t.TRTR_IN_POSSUI_AJUSTE === 1 && vig(t.TRTR_INICIO_VIGENCIA, t.TRTR_FIM_VIGENCIA, d); })()));
    const classifComTpDoc = (cd, tp, d) => R.classificacoes.some((c) => c.cd === cd && sitCbs.has(c.sitr) &&
      R.dfeClass.some((x) => x.cl === c.id && vig(x.ini, x.fim, d) && tipoDfePorModelo(tp, d).some((t) => t.id === x.tp)));
    const tipoReceita = (cod, vocab, d) => SN.tiposReceita.filter((t) => t.TRBS_CD === cod && (t.TRBS_VOCABULARIO_REGIME === vocab || t.TRBS_VOCABULARIO_REGIME == null) && vig(t.TRBS_INICIO_VIGENCIA, t.TRBS_FIM_VIGENCIA, d))
      .sort((a, b) => (a.TRBS_VOCABULARIO_REGIME == null) - (b.TRBS_VOCABULARIO_REGIME == null) || b.TRBS_INICIO_VIGENCIA.localeCompare(a.TRBS_INICIO_VIGENCIA))[0] || null;
    const atividade = (cod, d) => SN.atividades.filter((a) => a.ATSN_CATIVSN === cod && vig(a.ATSN_INICIO_VIGENCIA, a.ATSN_FIM_VIGENCIA, d)).sort((a, b) => b.ATSN_INICIO_VIGENCIA.localeCompare(a.ATSN_INICIO_VIGENCIA))[0] || null;
    const atividadeComTpDoc = (at, tp, d) => SN.dfeAtividade.some((x) => x.at === at.ATSN_ID && vig(x.ini, x.fim, d) && tipoDfePorModelo(tp, d).some((t) => t.id === x.tp));
    const regimePorId = (id) => SN.regimes.find((r) => r.RASN_ID === id);
    function regimeApuracao(vocab, crt, tpReg, op, regAp, d) {
      const eq = (a, b) => (b == null ? a == null : a === b);
      return SN.enquadramentos.filter((e) => e.ERSN_VOCABULARIO_REGIME === vocab && eq(e.ERSN_CRT, crt) && eq(e.ERSN_TPREGIMEIBSCBS, tpReg) && eq(e.ERSN_OPSIMPNAC, op) && eq(e.ERSN_REGAPIBSCBSSN, regAp) && vig(e.ERSN_INICIO_VIGENCIA, e.ERSN_FIM_VIGENCIA, d))
        .map((e) => regimePorId(e.ERSN_RASN_ID)).filter((r) => r && vig(r.RASN_INICIO_VIGENCIA, r.RASN_FIM_VIGENCIA, d))[0] || null;
    }
    const fatorTransicao = (d) => { const r = SN.transicaoCompraGov.filter((x) => vig(x.ini, x.fim, d)).sort((a, b) => b.ini.localeCompare(a.ini))[0]; return r ? new D(r.v) : null; };
    const situacoesIss = (d) => SN.situacoesIss.filter((s) => vig(s.SIPA_INICIO_VIGENCIA, s.SIPA_FIM_VIGENCIA, d));

    /* ----- nomenclatura (ValidacaoNomenclaturaAdapter + ValidacaoNomenclaturaService, modo PERMISSIVO) ----- */
    const ex = (codigo, campo, msg) => ({ codigo, campo, msg });
    function criticarNcm(ncm, cl, d) {
      const regs = R.ncmAplicavel.filter((n) => n.cl === cl.id && vig(n.ini, n.fim, d));
      if (!regs.length) return null;
      const casam = regs.filter((n) => ncm.startsWith(n.ncm));
      const vinc = ex("VSN-047", "ncm", `NCM de código ${ncm} não vinculada à Classificação Tributária de código ${cl.cd} (CBS e IBS)`);
      if (!casam.length) return vinc;
      const temEx = casam.some((n) => R.excecaoNcm.some((e) => e.ncma === n.id && ncm.startsWith(e.ncm) && vig(e.ini, e.fim, d)));
      const semEx = casam.some((n) => !R.excecaoNcm.some((e) => e.ncma === n.id && vig(e.ini, e.fim, d)));
      return temEx && !semEx ? vinc : null;
    }
    function criticarNbs(nbs, cl, d) {
      const regs = R.nbsAplicavel.filter((n) => n.cl === cl.id && vig(n.ini, n.fim, d));
      if (!regs.length) return null;
      return regs.some((n) => nbs.startsWith(n.nbs)) ? null : ex("VSN-048", "nbs", `NBS de código ${nbs} não vinculada à Classificação Tributária de código ${cl.cd} (CBS e IBS)`);
    }
    function validarEstrutural(ncm, nbs, d) {
      const v = (s) => s != null && s !== "";
      if (v(ncm) && v(nbs)) return ex("VSN-041", "ncm", "Não é permitido informar NCM e NBS simultaneamente para um item");
      if (v(ncm) && !/^[0-9]{8}$/.test(ncm)) return ex("VSN-051", "ncm", "O NCM deve conter exclusivamente 8 dígitos ASCII, sem espaços ou símbolos.");
      if (v(nbs) && !/^[0-9]{9}$/.test(nbs)) return ex("VSN-051", "nbs", "O NBS deve conter exclusivamente 9 dígitos ASCII, sem espaços ou símbolos.");
      if (v(ncm) && !existeNcm(ncm, d)) return ex("VSN-049", "ncm", `NCM de código ${ncm} não encontrada para a data ${d}`);
      if (v(nbs) && !existeNbs(nbs, d)) return ex("VSN-050", "nbs", `NBS de código ${nbs} não encontrada para a data ${d}`);
      return null;
    }
    function validarPorClassificacao(ncm, nbs, d, siglaDfe, clSn) {
      const chave = norm(siglaDfe);
      const sigla = SIGLAS[chave];
      if (!sigla) return ex("VSN-999", null, "Sigla DFe não encontrada: " + siglaDfe);
      // buscarClassificacaoTributariaCbsIbs (regime regular): exige situação vigente
      const cl = R.classificacoes.find((c) => c.cd === clSn.cd && vig(c.ini, c.fim, d) && (() => { const s = R.situacoes.find((x) => x.id === c.sitr); return s && vig(s.ini, s.fim, d) && String(s.tributos || "").split(",").includes("2"); })());
      if (!cl) return ex("VSN-999", null, `Classificação tributária não encontrada para código ${clSn.cd} e data ${d} (CBS e IBS)`);
      const compat = R.dfeClass.some((x) => x.cl === cl.id && vig(x.ini, x.fim, d) && norm((R.tiposDfe.find((t) => t.id === x.tp) || {}).sigla) === chave);
      let res = "SEM";
      if (compat) {
        const temNcm = R.ncmAplicavel.some((n) => n.cl === cl.id && vig(n.ini, n.fim, d));
        const temNbs = R.nbsAplicavel.some((n) => n.cl === cl.id && vig(n.ini, n.fim, d));
        const ncmAp = ["NFSE", "NFE", "NFCE"].includes(chave), nbsAp = chave === "NFSE";
        if (cl.cd === "200038") res = chave === "NFE" || chave === "NFCE" ? "NCM" : chave === "NFSE" ? "NBS" : "SEM";
        else if (ncmAp && !nbsAp) res = temNcm ? "NCM" : "SEM";
        else if (nbsAp) res = temNcm && temNbs ? "MISTO" : temNcm ? "NCM" : temNbs ? "NBS" : "SEM";
      }
      const v = (s) => s != null && String(s).trim() !== "";
      const incompat = (nom) => ex("VSN-045", v(ncm) ? "ncm" : v(nbs) ? "nbs" : null, `${nom} não permitida para a Classificação Tributária de código ${cl.cd} no tipo de documento ${sigla}`);
      if (res === "NCM") {
        if (v(nbs)) return incompat("NBS");
        if (String(ncm || "").length !== 8) return ex("VSN-042", "ncm", "NCM completo não informado");
        return criticarNcm(ncm, cl, d);
      }
      if (res === "NBS") {
        if (v(ncm)) return incompat("NCM");
        if (String(nbs || "").length !== 9) return ex("VSN-043", "nbs", "NBS completo não informado");
        return criticarNbs(nbs, cl, d);
      }
      if (res === "MISTO") {
        if (v(ncm)) return ncm.length !== 8 ? ex("VSN-042", "ncm", "NCM completo não informado") : criticarNcm(ncm, cl, d);
        if (v(nbs)) return nbs.length !== 9 ? ex("VSN-043", "nbs", "NBS completo não informado") : criticarNbs(nbs, cl, d);
        return ex("VSN-044", null, `A Classificação Tributária de código ${cl.cd} exige NCM ou NBS completo para o tipo de documento ${sigla}`);
      }
      if (!v(ncm) && !v(nbs)) return null;
      if (["NFE", "NFCE", "NFSE"].includes(chave)) {
        if (chave === "NFSE") { if (v(ncm)) return incompat("NCM"); } else if (v(nbs)) return incompat("NBS");
        return null;
      }
      // PERMISSIVO: valida contra o anexo, se houver
      if (v(ncm)) {
        const regs = R.ncmAplicavel.filter((n) => n.cl === cl.id && vig(n.ini, n.fim, d));
        if (regs.length && ncm.length !== 8) return ex("VSN-042", "ncm", "NCM completo não informado");
        return ncm.length === 8 ? criticarNcm(ncm, cl, d) : null;
      }
      const regs = R.nbsAplicavel.filter((n) => n.cl === cl.id && vig(n.ini, n.fim, d));
      if (regs.length && nbs.length !== 9) return ex("VSN-043", "nbs", "NBS completo não informado");
      return nbs.length === 9 ? criticarNbs(nbs, cl, d) : null;
    }

    /* ----- escolha do par de alíquotas (EscolhaParAliquotasService) ----- */
    function avaliarCamposIss(vocab, at, campos, col) {
      const avisos = [];
      const tI = informado(campos.tribISSQN), rI = informado(campos.tpRetISSQN), bI = informado(campos.tpBM);
      if (vocab !== "NFSE") {
        const des = [];
        if (tI) des.push("tribISSQN"); if (rI) des.push("tpRetISSQN"); if (bI) des.push("tpBM");
        if (des.length) avisos.push(`${des.join(", ")} desconsiderado(s): os campos do ISS só valem na NFS-e.`);
        return { tribISSQN: null, tpRetISSQN: null, tpBM: null, avisos };
      }
      const issNoSimples = at.ATSN_IN_ISS_NO_SIMPLES === 1, cAtiv = at.ATSN_CATIVSN;
      let trib = inteiro(campos.tribISSQN);
      if (tI && (trib == null || ![1, 2, 3, 4].includes(trib))) { col.erro("VSN-036", "tribISSQN", `A tributação do ISSQN (tribISSQN) deve ser 1, 2, 3 ou 4, recebido: '${campos.tribISSQN}'.`); trib = null; }
      else if (!tI && issNoSimples) col.erro("VSN-036", "tribISSQN", `A tributação do ISSQN (tribISSQN) é obrigatória para a atividade ${cAtiv}, que tem ISS no Simples Nacional.`);
      let ret = null;
      if (rI && trib != null && trib !== 1) avisos.push(`tpRetISSQN desconsiderado: não há retenção do ISS com tribISSQN ${trib} (a NFS-e recusaria a combinação: regra E0580).`);
      else if (rI) {
        ret = inteiro(campos.tpRetISSQN);
        if (ret == null || ![1, 2, 3].includes(ret)) { col.erro("VSN-037", "tpRetISSQN", `O tipo de retenção do ISSQN (tpRetISSQN) deve ser 1, 2 ou 3, recebido: '${campos.tpRetISSQN}'.`); ret = null; }
      } else if (issNoSimples && trib === 1) col.erro("VSN-037", "tpRetISSQN", `O tipo de retenção do ISSQN (tpRetISSQN) é obrigatório com tribISSQN = 1 na atividade ${cAtiv}, que tem ISS no Simples Nacional.`);
      let bm = null;
      if (bI && at.ATSN_IN_ADMITE_BENEFICIO_MUNICIPAL !== 1) avisos.push(`tpBM desconsiderado: a atividade ${cAtiv} não admite benefício municipal do ISS (regra E0536 da NFS-e: só os subitens 7.02 e 7.05, atividades 12 e 13).`);
      else if (bI) {
        bm = inteiro(campos.tpBM);
        if (bm == null || ![1, 2, 3, 4].includes(bm)) { col.erro("VSN-038", "tpBM", `O tipo de benefício municipal (tpBM) deve ser 1, 2, 3 ou 4, recebido: '${campos.tpBM}'.`); bm = null; }
      }
      if (bm === 1 && ret != null && [2, 3].includes(ret)) avisos.push(`tpBM 1 (isenção) com tpRetISSQN ${ret}: combinação recusada pela NFS-e (regra E0594); vale a isenção municipal (par sem redistribuição).`);
      return { tribISSQN: trib, tpRetISSQN: ret, tpBM: bm, avisos };
    }
    function escolher(at, admissivel, linha, fatos, situacoes) {
      const r = (anexo, tipo, regra, par, semAus, caminho, motivo) => ({ anexo, tipo, regra, par, semAus, caminho, motivo });
      if (!admissivel) return r(null, null, "DOCUMENTO", null, false, null, "ATIVIDADE_INADMISSIVEL_NO_DOCUMENTO");
      const comR = at.ATSN_ANEXO_COM_FATOR_R, semR = at.ATSN_ANEXO_SEM_FATOR_R;
      if (comR == null && semR == null) return r(null, "SEM_ALIQUOTA", "ATIVIDADE_NAO_TRIBUTADA", { pCBSSN: ZERO, pIBSSN: ZERO }, false, null, "ATIVIDADE_SEM_ANEXO");
      let anexo = semR;
      if (comR != null) {
        if (linha.fatorR == null) return r(null, null, null, null, false, null, "FATOR_R_AUSENTE");
        anexo = linha.fatorR ? comR : semR;
      }
      const aa = linha.anexos[anexo];
      const parAnexo = aa ? aa.par : null;
      const cam = "anexo" + anexo;
      const escolhido = (tipo, regra, par, semAus, caminho) => r(anexo, tipo, regra, par, semAus, caminho, par == null || par.pCBSSN == null ? "ANEXO_SEM_ALIQUOTA" : "RESOLVIDA");
      if (!["III", "IV", "V"].includes(anexo)) return escolhido("PAR_UNICO", "ANEXO_SEM_ISS", parAnexo, false, cam);
      const sit = (regra) => situacoes.find((s) => s.SIPA_REGRA === regra && fatos[s.SIPA_CAMPO] === s.SIPA_VALOR);
      let regra = "PADRAO", tipo = "COM_REDISTRIBUICAO", s;
      if (linha.impedimentoSublimite) { regra = "ISS_FORA_DO_SIMPLES"; tipo = "SEM_REDISTRIBUICAO"; }
      else if ((s = sit("ISS_FORA_DO_SIMPLES"))) { regra = s.SIPA_REGRA; tipo = s.SIPA_TIPO_ALIQUOTA; }
      else if (at.ATSN_IN_ISS_NO_SIMPLES !== 1) { regra = "ATIVIDADE_SEM_ISS"; tipo = "SEM_REDISTRIBUICAO"; }
      else for (const c of ["ISS_NAO_INCIDE", "ISENCAO_MUNICIPAL", "ISS_RETIDO"]) { if ((s = sit(c))) { regra = s.SIPA_REGRA; tipo = s.SIPA_TIPO_ALIQUOTA; break; } }
      if (tipo !== "SEM_REDISTRIBUICAO") return escolhido(tipo, regra, parAnexo, false, cam);
      const sem = aa ? aa.sem : null;
      if (!sem) return escolhido(tipo, regra, parAnexo, true, cam);
      return escolhido(tipo, regra, sem, false, cam + "/semRedistribuicaoISS");
    }

    /* ----- operação (CalculoSimplesUnificadoService.processar) ----- */
    function calcular(op) {
      try { return { status: 200, corpo: processar(op) }; }
      catch (e) {
        if (!(e instanceof ErrosGlobais)) throw e;
        return { status: 422, corpo: { title: "Erros no processamento do cálculo do Simples Nacional", status: 422, detail: `O cálculo contém ${e.erros.length} erro(s).`, errors: e.erros } };
      }
    }

    function processar(op) {
      const erros = [];
      // validarCamposGlobais
      if (!informado(op.id)) erros.push(erroGlobal("VSN-013", "id", "O identificador da operação (id) é obrigatório."));
      if (!informado(op.versao)) erros.push(erroGlobal("VSN-013", "versao", "A versão do payload (versao) é obrigatória."));
      let data = null;
      if (!informado(op.data)) erros.push(erroGlobal("VSN-012", "data", "A data do fato gerador é obrigatória."));
      else if (/^\d{4}-\d{2}-\d{2}$/.test(String(op.data).trim()) && !isNaN(Date.parse(String(op.data).trim() + "T00:00:00Z")) && new Date(String(op.data).trim() + "T00:00:00Z").toISOString().slice(0, 10) === String(op.data).trim()) data = String(op.data).trim();
      else erros.push(erroGlobal("VSN-012", "data", `Data inválida, recebido: '${op.data}' (esperado YYYY-MM-DD).`));
      if (informado(op.tpEnteGov)) { const t = inteiro(op.tpEnteGov); if (t == null || t < 1 || t > 4) erros.push(erroGlobal("VSN-024", "tpEnteGov", `Tipo de ente governamental inválido, recebido: '${op.tpEnteGov}' (esperado 1, 2, 3 ou 4).`)); }
      if (!op.itens || !op.itens.length) erros.push(erroGlobal("VSN-011", "itens", "A lista de itens é obrigatória e não pode estar vazia."));
      // validarDocumento
      let doc = null;
      if (!informado(op.tpDoc)) erros.push(erroGlobal("VSN-014", "tpDoc", "O tipo de documento fiscal (tpDoc) é obrigatório e não foi informado."));
      else {
        const tp = inteiro(op.tpDoc);
        if (tp != null && data && R.tiposDfe.some((t) => t.modelo === tp && t.tratado === 0 && vig(t.ini, t.fim, data))) erros.push(erroGlobal("VSN-015", "tpDoc", `Tipo de documento fiscal (tpDoc) de código ${tp} ainda não possui tratamento implementado no cálculo do Simples Nacional.`));
        else if (tp == null) erros.push(erroGlobal("VSN-015", "tpDoc", `Tipo de documento não suportado pelo cálculo do Simples Nacional, recebido: '${op.tpDoc}'.`));
        else if (data) {
          const t = tipoDfePorModelo(tp, data);
          doc = SN.dfeCalculo.filter((c) => vig(c.TDCS_INICIO_VIGENCIA, c.TDCS_FIM_VIGENCIA, data) && t.some((x) => x.id === c.TDCS_TPDF_ID)).sort((a, b) => b.TDCS_INICIO_VIGENCIA.localeCompare(a.TDCS_INICIO_VIGENCIA))[0] || null;
          if (!doc) erros.push(erroGlobal("VSN-015", "tpDoc", `Tipo de documento não suportado pelo cálculo do Simples Nacional, recebido: '${op.tpDoc}'.`));
        }
      }
      const vocab = doc ? doc.TDCS_VOCABULARIO_REGIME : null;
      if (doc) {
        const proibido = (v, campo, documento) => { if (informado(v)) erros.push(erroGlobal("VSN-033", campo, `O campo ${campo} não pertence ao vocabulário de regime do ${documento}, recebido: '${v}'.`)); };
        if (vocab === "NFSE") {
          proibido(op.CRT, "CRT", "NFS-e"); proibido(op.tpRegimeIBSCBS, "tpRegimeIBSCBS", "NFS-e");
          const ops = inteiro(op.opSimpNac);
          if (ops == null || ops < 1 || ops > 4) erros.push(erroGlobal("VSN-030", "opSimpNac", `A situação perante o Simples Nacional (opSimpNac) é obrigatória na NFS-e e deve ser 1, 2, 3 ou 4, recebido: '${op.opSimpNac}'.`));
          else {
            const campoNfse = (valor, campo, code, regra) => {
              if (informado(valor)) {
                const c = inteiro(valor);
                if (c == null || c < 1 || c > 3) erros.push(erroGlobal(code, campo, `O ${campo} deve ser 1, 2 ou 3, recebido: '${valor}'.`));
                else if (![3, 4].includes(ops)) erros.push(erroGlobal(code, campo, `O ${campo} não pode ser informado com opSimpNac=${ops} (não optante ou MEI)${campo === "regApTribSN" ? " (regra E0162 da NFS-e)" : ""}.`));
              } else if ([3, 4].includes(ops)) erros.push(erroGlobal(code, campo, `O ${campo} é obrigatório com opSimpNac=${ops} (${regra}).`));
            };
            campoNfse(op.regApIBSCBSSN, "regApIBSCBSSN", "VSN-031", "regra 313 da NFS-e");
            campoNfse(op.regApTribSN, "regApTribSN", "VSN-032", "regra E0166 da NFS-e, estendida pela NT 009");
          }
        } else {
          proibido(op.opSimpNac, "opSimpNac", "documento com CRT"); proibido(op.regApIBSCBSSN, "regApIBSCBSSN", "documento com CRT"); proibido(op.regApTribSN, "regApTribSN", "documento com CRT");
          const crt = inteiro(op.CRT);
          if (crt == null || crt < 1 || crt > 4) erros.push(erroGlobal("VSN-016", "CRT", `O Código de Regime Tributário (CRT) é obrigatório e deve ser 1, 2, 3 ou 4, recebido: '${op.CRT}'.`));
          else if (informado(op.tpRegimeIBSCBS)) {
            const tr = inteiro(op.tpRegimeIBSCBS);
            if (tr == null || (tr !== 1 && tr !== 2)) erros.push(erroGlobal("VSN-017", "tpRegimeIBSCBS", `Tipo de regime de apuração do IBS/CBS inválido, recebido: '${op.tpRegimeIBSCBS}' (esperado 1 ou 2).`));
            else if (crt === 4) erros.push(erroGlobal("VSN-018", "tpRegimeIBSCBS", tr === 2 ? "CRT=4 (MEI) não admite tpRegimeIBSCBS algum (regras C21a-10 e C21a-30 da NT 2026.005)." : "CRT=4 (MEI) não admite tpRegimeIBSCBS algum (regra C21a-30 da NT 2026.005)."));
            else if ((crt === 1 || crt === 2) && tr === 2) erros.push(erroGlobal("VSN-018", "tpRegimeIBSCBS", `CRT=${crt} não admite tpRegimeIBSCBS=2 (regra C21a-10 da NT 2026.005).`));
            else if (crt === 3 && tr === 1) erros.push(erroGlobal("VSN-018", "tpRegimeIBSCBS", "CRT=3 não admite tpRegimeIBSCBS=1 (regra C21a-20 da NT 2026.005)."));
          }
        }
        const max = doc.TDCS_MAXIMO_ITENS;
        if (max != null && op.itens && op.itens.length > max) erros.push(erroGlobal("VSN-034", "itens", `O documento ${String(op.tpDoc).trim()} admite ${max === 1 ? "exatamente 1 item" : "no máximo " + max + " itens"}, recebidos ${op.itens.length}.`));
      }
      if (erros.length) throw new ErrosGlobais(erros);

      const inf = { crt: inteiro(op.CRT), tpReg: inteiro(op.tpRegimeIBSCBS), ops: inteiro(op.opSimpNac), regAp: inteiro(op.regApIBSCBSSN), regTrib: inteiro(op.regApTribSN) };
      const regime = regimeApuracao(vocab, inf.crt, inf.tpReg, inf.ops, inf.regAp, data);
      const descReg = () => vocab === "NFSE" ? `opSimpNac=${inf.ops}, regApIBSCBSSN=${inf.regAp}` : inf.tpReg == null ? `CRT=${inf.crt}` : `CRT=${inf.crt}, tpRegimeIBSCBS=${inf.tpReg}`;
      if (!regime) {
        let campo, motivo;
        if (vocab === "NFSE") { campo = "opSimpNac"; motivo = inf.ops === 1 ? "prestador não optante pelo Simples Nacional (opSimpNac=1)" : inf.ops === 2 ? "MEI (opSimpNac=2) está fora do cálculo do IBS e da CBS pelo Simples Nacional" : `não há enquadramento vigente na data '${data}' para opSimpNac=${inf.ops} e regApIBSCBSSN=${inf.regAp}`; }
        else { campo = "CRT"; motivo = inf.crt === 4 ? "MEI (CRT=4) está fora do Evento de Tributação do Simples Nacional" : inf.crt === 3 && inf.tpReg == null ? "CRT=3 sem tpRegimeIBSCBS=2 (regime normal puro) não é Simples Nacional" : `não há enquadramento vigente na data '${data}' para ${descReg()}`; }
        throw new ErrosGlobais([erroGlobal("VSN-019", campo, "Operação fora do escopo do cálculo do Simples Nacional: " + motivo + ".")]);
      }
      const calculaTributos = regime.RASN_IN_CALCULA_TRIBUTOS === 1;
      const geraIbs = regime.RASN_IN_GERA_IBS === 1;
      const tpEnte = inteiro(op.tpEnteGov);
      let fator = null;
      if (tpEnte != null && tpEnte !== 1) {
        fator = fatorTransicao(data);
        if (fator == null) throw new ErrosGlobais([erroGlobal("VSN-025", "tpEnteGov", `Não há parametrização de transição de compra governamental vigente para a data '${data}'.`)]);
      }
      // linha de alíquotas (FonteRequisicao)
      let linha = null;
      if (calculaTributos) {
        const a = op.aliquotasEfetivas;
        if (!a) throw new ErrosGlobais([erroGlobal("VSN-039", "aliquotasEfetivas", "A linha de alíquotas efetivas do contribuinte (aliquotasEfetivas) é obrigatória no cálculo não assistido quando o regime calcula tributos.")]);
        const errs = [];
        const aliq = (v, cam, code) => {
          if (!informado(v)) return null;
          const t = String(v).trim();
          if (FORMATO_ALIQ.test(t)) return { v: new D(t), txt: t };
          const neg = t.startsWith("-") && FORMATO_ALIQ.test(t.slice(1));
          errs.push(erroGlobal(code, "aliquotasEfetivas/" + cam, neg ? `O valor não pode ser negativo, recebido: '${v}'.` : `O valor não é um número decimal válido, recebido: '${v}'. Informe ${DESC_ALIQ}.`));
          return null;
        };
        const par = (o, cam) => ({ pCBSSN: aliq(o.pCBSSN, cam + "/pCBSSN", "VSN-005"), pIBSSN: aliq(o.pIBSSN, cam + "/pIBSSN", "VSN-007") });
        const anexos = {};
        for (const k of ["I", "II", "III", "IV", "V"]) {
          const o = a["anexo" + k];
          if (!o) continue;
          const sem = o.semRedistribuicaoISS;
          const semInf = ["III", "IV", "V"].includes(k) && sem && (informado(sem.pCBSSN) || informado(sem.pIBSSN));
          anexos[k] = { par: par(o, "anexo" + k), sem: semInf ? par(sem, "anexo" + k + "/semRedistribuicaoISS") : null };
        }
        if (errs.length) throw new ErrosGlobais(errs);
        linha = { fatorR: a.fatorR == null ? null : !!a.fatorR, impedimentoSublimite: a.impedimentoSublimite === true, anexos };
      }
      const situacoes = calculaTributos ? situacoesIss(data) : [];
      const avisos = [];
      if (linha && geraIbs === linha.impedimentoSublimite) avisos.push(`Regime de apuração ${regime.RASN_CD} (${descReg()}) diverge do indicador de impedimento por sublimite da linha de alíquotas (${linha.impedimentoSublimite})`);
      if (inf.regAp === 2 && inf.regTrib === 1) avisos.push("regApIBSCBSSN 2 (excesso de sublimite) com regApTribSN 1: incoerente — quem excede o sublimite tem o ISS fora do Simples Nacional");
      const tpDoc = parseInt(String(op.tpDoc).trim(), 10);
      const tipoDfe = R.tiposDfe.find((t) => t.id === doc.TDCS_TPDF_ID && vig(t.ini, t.fim, data));
      const ctx = { data, tpDoc, regime, calculaTributos, geraIbs, tpEnte, fator, vocab, admiteIS: doc.TDCS_IN_ADMITE_IS === 1, casas: doc.TDCS_CASAS_ALIQUOTA_CALCULO, siglaDfe: tipoDfe ? tipoDfe.sigla : null, ncmZero: !!(tipoDfe && tipoDfe.ncmZero) };
      const fatosOp = {};
      if (inf.crt != null) fatosOp.CRT = inf.crt;
      if (inf.regAp != null) fatosOp.regApIBSCBSSN = inf.regAp;
      if (inf.regTrib != null) fatosOp.regApTribSN = inf.regTrib;

      const processados = op.itens.map((it, i) => processarItem(it || {}, i, ctx, linha, fatosOp, situacoes));
      const objetos = processados.map((p) => p.objeto).sort((a, b) => (a.nObj == null ? -1 : b.nObj == null ? 1 : a.nObj - b.nObj));
      const oper = {};
      for (const k of ["data", "tpDoc", "CRT", "tpRegimeIBSCBS", "opSimpNac", "regApIBSCBSSN", "regApTribSN", "tpEnteGov"]) if (op[k] != null) oper[k] = op[k];
      oper.regimeApuracao = regime.RASN_CD;
      const corpo = { oper };
      if (calculaTributos) corpo.resolucaoAliquotas = { fatorR: linha.fatorR, indSublimite: linha.impedimentoSublimite, itens: processados.map((p) => p.resolucao), avisos };
      corpo.objetos = objetos;
      const tot = totalizar(objetos);
      if (tot) corpo.total = tot;
      return corpo;
    }

    /* ----- item (ProcessadorItemSimples.processarItem) ----- */
    function processarItem(item, index, ctx, linha, fatosOp, situacoes) {
      const erros = [];
      let estado = "CALCULADO";
      const col = {
        erro(code, campo, detail) { if (estado === "CALCULADO") estado = "INCONSISTENCIA_ENTRADA"; erros.push({ type: "erros?codigo=" + code, title: COD[code], code, pointer: campo == null ? "#/itens/" + index : "#/itens/" + index + "/" + campo, detail }); },
        erroPonteiro(code, ponteiro, detail) { if (estado === "CALCULADO") estado = "INCONSISTENCIA_ENTRADA"; erros.push({ type: "erros?codigo=" + code, title: COD[code], code, pointer: ponteiro, detail }); },
        falha(msg) { estado = "FALHA_TECNICA"; erros.push({ type: "erros?codigo=VSN-999", title: COD["VSN-999"], code: "VSN-999", pointer: "#/itens/" + index, detail: msg }); },
      };
      const nObj = item.numero == null ? null : item.numero;
      const nObjOuIndice = nObj != null ? nObj : index + 1;
      const cAtivNorm = (() => { if (!informado(item.cAtivSN)) return null; const c = String(item.cAtivSN).trim(); return /^\d$/.test(c) ? "0" + c : c; })();
      const semPar = (cAtiv, motivo, avisos = []) => ({ numero: item.numero ?? null, cAtivSN: cAtiv, anexoAplicado: null, tipoAliquota: null, regraAliquota: null, pIBSSN: null, pCBSSN: null, motivo, avisos });
      if (nObj == null) col.erro("VSN-010", "numero", "O número do item é obrigatório.");
      if (informado(item.cClassTrib) && naoImplementado(String(item.cClassTrib).trim(), ctx.data)) {
        estado = "NAO_IMPLEMENTADO";
        erros.push({ type: "erros?codigo=VSN-027", title: COD["VSN-027"], code: "VSN-027", pointer: "#/itens/" + index + "/cClassTrib", detail: `A classificação tributária '${String(item.cClassTrib).trim()}' ainda não possui tratamento implementado no cálculo do Simples Nacional na data '${ctx.data}'. Essa funcionalidade está prevista no roadmap e será disponibilizada em versão futura.` });
        return { objeto: { nObj: nObjOuIndice, estadoItem: estado, erros }, resolucao: ctx.calculaTributos ? semPar(cAtivNorm, "ITEM_NAO_IMPLEMENTADO") : undefined };
      }
      const ncm = ctx.ncmZero && (item.ncm === "00" || item.ncm === "00000000") ? null : item.ncm;
      const decimal = (v, campo, ausente, invalido) => {
        if (!informado(v)) { col.erro(ausente, campo, "O campo é obrigatório e não foi informado."); return null; }
        const t = String(v).trim();
        if (FORMATO_VALOR.test(t)) return new D(t);
        if (t.startsWith("-") && FORMATO_VALOR.test(t.slice(1))) col.erro(invalido, campo, `O valor não pode ser negativo, recebido: '${v}'.`);
        else col.erro(invalido, campo, `O valor não é um número decimal válido, recebido: '${v}'. Informe ${DESC_VALOR}.`);
        return null;
      };
      const base = decimal(item.baseCalculo, "baseCalculo", "VSN-001", "VSN-002");
      const est = validarEstrutural(ncm, item.nbs, ctx.data);
      if (est) col.erro(est.codigo, est.campo, est.msg);
      let valorIs = null;
      if (ctx.admiteIS) valorIs = decimal(item.valorImpostoSeletivo, "valorImpostoSeletivo", "VSN-003", "VSN-003");
      else if (informado(item.valorImpostoSeletivo)) {
        const t = String(item.valorImpostoSeletivo).trim();
        if (FORMATO_VALOR.test(t)) { if (!new D(t).isZero()) col.erro("VSN-035", "valorImpostoSeletivo", `O documento não tem Imposto Seletivo: o valor deve ser zero ou não ser informado, recebido: '${item.valorImpostoSeletivo}'.`); }
        else if (t.startsWith("-") && FORMATO_VALOR.test(t.slice(1))) col.erro("VSN-003", "valorImpostoSeletivo", `O valor não pode ser negativo, recebido: '${item.valorImpostoSeletivo}'.`);
        else col.erro("VSN-003", "valorImpostoSeletivo", `O valor não é um número decimal válido, recebido: '${item.valorImpostoSeletivo}'. Informe ${DESC_VALOR}.`);
      }
      // resolverTipoReceitaBruta
      let cl = null, tipoRec = null;
      if (!informado(item.cClassTrib)) col.erro("VSN-020", "cClassTrib", "O código de classificação tributária (cClassTrib) é obrigatório e não foi informado.");
      else {
        const cod = String(item.cClassTrib).trim();
        const vigs = classifVigentes(cod, ctx.data);
        if (!vigs.length) col.erro("VSN-021", "cClassTrib", `O cClassTrib '${cod}' não existe ou não está vigente na data '${ctx.data}': o tpRBSN não pôde ser determinado.`);
        else if (!classifComTpDoc(cod, ctx.tpDoc, ctx.data)) col.erro("VSN-022", "cClassTrib", `O cClassTrib '${cod}' não é admissível para o tipo de documento fiscal ${ctx.tpDoc}.`);
        else {
          cl = vigs[0];
          tipoRec = tipoReceita(cl.tprbsn, ctx.vocab, ctx.data);
          if (!tipoRec) col.erro("VSN-026", "cClassTrib", `Não há parametrização de efeito vigente para o tipo de receita bruta tpRBSN=${cl.tprbsn} na data '${ctx.data}'.`);
        }
      }
      if (!est && !erros.length && cl) {
        const r = validarPorClassificacao(ncm, item.nbs, ctx.data, ctx.siglaDfe, cl);
        if (r) { if (r.codigo === "VSN-999") col.falha(r.msg); else col.erro(r.codigo, r.campo, r.msg); }
      }
      let at = { cAtivSN: null, atividade: null, admissivel: false };
      let aliq = { pIBSSN: null, pCBSSN: null, naoCalcular: false, resolucao: undefined };
      if (ctx.calculaTributos) {
        // validarCAtivSN
        if (cAtivNorm != null) {
          const a = atividade(cAtivNorm, ctx.data);
          if (!a) at = { cAtivSN: cAtivNorm, atividade: null, admissivel: false };
          else if (!atividadeComTpDoc(a, ctx.tpDoc, ctx.data)) at = { cAtivSN: cAtivNorm, atividade: a, admissivel: false };
          else {
            if (a.ATSN_IN_NAO_TRIBUTAVEL === 1 && tipoRec && tipoRec.TRBS_IN_VEDADO_NAO_TRIBUTAVEL === 1) col.erro("VSN-023", "cAtivSN", `O código de atividade '${cAtivNorm}' (Operações não Tributáveis) é incompatível com cClassTrib de tpRBSN=${tipoRec.TRBS_CD}.`);
            at = { cAtivSN: cAtivNorm, atividade: a, admissivel: true };
          }
        }
        const exigidas = at.atividade != null && at.admissivel && tipoRec != null && tipoRec.TRBS_IN_EXIGE_ALIQUOTA === 1;
        const ibsExigida = exigidas && ctx.geraIbs;
        // resolvedor
        if (at.atividade == null) aliq.resolucao = semPar(at.cAtivSN, "ATIVIDADE_DESCONHECIDA");
        else {
          const avisos = [];
          const fatos = { ...fatosOp };
          if (at.admissivel) {
            const iss = avaliarCamposIss(ctx.vocab, at.atividade, { tribISSQN: item.tribISSQN, tpRetISSQN: item.tpRetISSQN, tpBM: item.tpBM }, col);
            avisos.push(...iss.avisos);
            if (iss.tribISSQN != null) fatos.tribISSQN = iss.tribISSQN;
            if (iss.tpRetISSQN != null) fatos.tpRetISSQN = iss.tpRetISSQN;
            if (iss.tpBM != null) fatos.tpBM = iss.tpBM;
          }
          const esc = escolher(at.atividade, at.admissivel, linha, fatos, situacoes);
          if (esc.motivo === "FATOR_R_AUSENTE") col.erroPonteiro("VSN-040", "#/aliquotasEfetivas/fatorR", `O fatorR é exigido: a atividade ${at.cAtivSN} é sujeita ao fator "r" (Anexo III ou V).`);
          if (esc.semAus) avisos.push(`Par sem redistribuição do ISS ausente no anexo ${esc.anexo}; aplicado o par com redistribuição, igual quando o ISS não passa do teto.`);
          const pC = esc.par ? (esc.par.pCBSSN && esc.par.pCBSSN.v !== undefined ? esc.par.pCBSSN : esc.par.pCBSSN == null ? null : { v: esc.par.pCBSSN, txt: esc.par.pCBSSN.toString() }) : null;
          const pI = esc.par ? (esc.par.pIBSSN && esc.par.pIBSSN.v !== undefined ? esc.par.pIBSSN : esc.par.pIBSSN == null ? null : { v: esc.par.pIBSSN, txt: esc.par.pIBSSN.toString() }) : null;
          if (esc.caminho != null) {
            const exigir = (exig, a, code, campo) => {
              if (!exig || a != null) return;
              const parTxt = esc.tipo === "SEM_REDISTRIBUICAO" && !esc.semAus ? "sem" : "com";
              const det = esc.tipo === "PAR_UNICO" ? `A alíquota ${campo} do anexo ${esc.anexo} é exigida para o cálculo do item e não está na linha de alíquotas.`
                : `A alíquota ${campo} do anexo ${esc.anexo} (par ${parTxt} redistribuição do ISS, regra ${esc.regra}) é exigida para o cálculo do item e não está na linha de alíquotas.`;
              col.erroPonteiro(code, "#/aliquotasEfetivas/" + esc.caminho + "/" + campo, det);
            };
            exigir(exigidas, pC, "VSN-004", "pCBSSN");
            exigir(ibsExigida, pI, "VSN-006", "pIBSSN");
          }
          aliq = { pIBSSN: pI ? pI.v : null, pCBSSN: pC ? pC.v : null, naoCalcular: false, resolucao: { numero: item.numero ?? null, cAtivSN: at.cAtivSN, anexoAplicado: esc.anexo, tipoAliquota: esc.tipo, regraAliquota: esc.regra, pIBSSN: pI ? pI.txt : null, pCBSSN: pC ? pC.txt : null, motivo: esc.motivo, avisos } };
        }
      }
      if (erros.length) return { objeto: { nObj: nObjOuIndice, estadoItem: estado, erros }, resolucao: aliq.resolucao };
      let motivo = null;
      if (ctx.calculaTributos) {
        if (at.cAtivSN == null) motivo = { codigo: "CATIVSN_AUSENTE", descricao: "O código de atividade do Simples Nacional (cAtivSN) não foi informado; sem ele o IBS e a CBS do item não são calculados (NT 2026.005, §5.3.3)." };
        else if (at.atividade == null) motivo = { codigo: "CATIVSN_DESCONHECIDO", descricao: `O código de atividade '${at.cAtivSN}' não existe ou não está vigente na data do fato gerador; o IBS e a CBS do item não são calculados.` };
        else if (!at.admissivel) motivo = { codigo: "CATIVSN_INADMISSIVEL_NO_DOCUMENTO", descricao: `A atividade '${at.cAtivSN}' não é admitida no tipo de documento ${ctx.siglaDfe != null ? ctx.siglaDfe : "informado"} (tpDoc ${ctx.tpDoc}); o IBS e a CBS do item não são calculados.` };
      }
      return { objeto: calcularItem(nObj, tipoRec, motivo, base, valorIs, aliq.pIBSSN, aliq.pCBSSN, ctx), resolucao: aliq.resolucao };
    }

    /* ----- valores (SimplesNacionalCalculoService.calcularItem) ----- */
    function calcularItem(nObj, tr, motivo, base, valorIs, pIbs, pCbs, ctx) {
      const isCompoe = tr.TRBS_IN_IS_COMPOE_RECEITA === 1;
      const vRB = tr.TRBS_IN_COMPOE_RECEITA === 1 ? [base, isCompoe ? valorIs : null].filter((x) => x != null).reduce((a, b) => a.plus(b), ZERO).toDecimalPlaces(2, HE) : ZERO;
      if (!ctx.calculaTributos) motivo = { codigo: "REGIME_SOMENTE_RECEITA", descricao: "O optante apura o IBS e a CBS pelo regime regular, fora do Simples Nacional; o item leva ao Simples apenas a receita bruta." };
      const tribBase = { vRBSNitem: moeda(vRB), tpRBSN: tr.TRBS_CD, tpRBSNDescricao: tr.TRBS_DESCRICAO };
      if (motivo) return { nObj, estadoItem: "NAO_CALCULADO", motivoEstado: motivo, tribCalc: tribBase, _num: { vRB } };
      // deslocamento de compra governamental e casas do leiaute
      if (ctx.tpEnte != null && !(pIbs == null && pCbs == null)) {
        const i = pIbs || ZERO, c = pCbs || ZERO;
        if (ctx.tpEnte === 1) { pIbs = ZERO; pCbs = c.plus(i); }
        else { pIbs = i.plus(ctx.fator.times(c)); pCbs = new D(1).minus(ctx.fator).times(c); }
      }
      if (ctx.casas != null) { pIbs = pIbs == null ? null : pIbs.toDecimalPlaces(ctx.casas, HE); pCbs = pCbs == null ? null : pCbs.toDecimalPlaces(ctx.casas, HE); }
      const fr = new D(tr.TRBS_FATOR_RECEITA);
      const pend = tr.TRBS_IN_PENDENTE_SUSPENSO === 1;
      const vBC = vRB.times(fr).toDecimalPlaces(2, HE);
      const valor = (p) => (p == null || fr.isZero() ? ZERO : vRB.times(fr).times(p.div(100))).toDecimalPlaces(2, HE);
      const repartir = (v) => { const dest = pend ? ctx.regime.RASN_DESTINO_PENDENTE_SUSPENSO : ctx.regime.RASN_DESTINO_DEVIDO; return dest === "DEVIDO" ? { dev: v, pend: ZERO } : dest === "PENDENTE_SUSPENSO" ? { dev: ZERO, pend: v } : { dev: ZERO, pend: ZERO }; };
      const ibs = ctx.geraIbs ? repartir(valor(pIbs)) : null;
      const cbs = repartir(valor(pCbs));
      const totalItem = [ibs ? ibs.dev : null, cbs.dev, valorIs].filter((x) => x != null).reduce((a, b) => a.plus(b), ZERO);
      const mem = (p, v) => `Receita bruta do Simples Nacional de R$ ${brMoeda(vRB)} (${tr.TRBS_DESCRICAO}). A base de cálculo utilizada é de R$ ${brMoeda(vBC)}, com alíquota efetiva de ${brPct(p)}%. Valor devido de R$ ${brMoeda(v.dev)} e pendente/suspenso de R$ ${brMoeda(v.pend)}.`;
      const t = { ...tribBase, vBC: moeda(vBC) };
      if (ctx.geraIbs) { if (pIbs != null) t.pIBSSN = aliqTxt(pIbs); t.vIBSSN = moeda(ibs.dev); t.vIBSPendSusp = moeda(ibs.pend); }
      if (pCbs != null) t.pCBSSN = aliqTxt(pCbs);
      t.vCBSSN = moeda(cbs.dev); t.vCBSPendSusp = moeda(cbs.pend);
      if (valorIs != null) t.IS = { valor: moeda(valorIs) };
      t.totalItem = moeda(totalItem);
      t.memoriaCalculo = { cbs: mem(pCbs, cbs) };
      if (ibs) t.memoriaCalculo.ibs = mem(pIbs, ibs);
      return { nObj, estadoItem: "CALCULADO", tribCalc: t, _num: { vRB, vBC, ibs, cbs, valorIs } };
    }

    /* ----- totais (TotalSimplesDomain) ----- */
    function totalizar(objetos) {
      const com = objetos.filter((o) => o.tribCalc);
      if (!com.length) return null;
      const soma = (f) => { const v = com.map((o) => f(o._num || {})).filter((x) => x != null); return v.length ? v.reduce((a, b) => a.plus(b), ZERO) : null; };
      const vIBS = soma((n) => n.ibs && n.ibs.dev), vCBS = soma((n) => n.cbs && n.cbs.dev), tIs = soma((n) => n.valorIs);
      const t = {};
      const put = (k, v) => { if (v != null) t[k] = moeda(v); };
      put("vRBSNtot", soma((n) => n.vRB)); put("vBC", soma((n) => n.vBC)); put("vIBSSNtot", vIBS); put("vIBSSNtotPendSusp", soma((n) => n.ibs && n.ibs.pend));
      put("vCBSSNtot", vCBS); put("vCBSSNtotPendSusp", soma((n) => n.cbs && n.cbs.pend)); put("totalIs", tIs);
      if (vIBS != null || vCBS != null || tIs != null) put("totalTributos", [vIBS, vCBS, tIs].filter((x) => x != null).reduce((a, b) => a.plus(b), ZERO));
      for (const o of objetos) delete o._num;
      return t;
    }

    function atividades(data, tpDoc) {
      return SN.atividades.filter((a) => vig(a.ATSN_INICIO_VIGENCIA, a.ATSN_FIM_VIGENCIA, data) && (tpDoc == null || atividadeComTpDoc(a, tpDoc, data)))
        .sort((a, b) => a.ATSN_ORDEM - b.ATSN_ORDEM)
        .map((a) => ({ codigo: a.ATSN_CATIVSN, descricao: a.ATSN_DESCRICAO, anexoSemFatorR: a.ATSN_ANEXO_SEM_FATOR_R, anexoComFatorR: a.ATSN_ANEXO_COM_FATOR_R, rotuloAnexo: a.ATSN_ROTULO, issNoSimples: a.ATSN_IN_ISS_NO_SIMPLES === 1 }));
    }
    const tiposDoc = (data) => SN.dfeCalculo.filter((c) => vig(c.TDCS_INICIO_VIGENCIA, c.TDCS_FIM_VIGENCIA, data)).map((c) => { const t = R.tiposDfe.find((x) => x.id === c.TDCS_TPDF_ID) || {}; return { modelo: t.modelo, sigla: t.sigla, descricao: t.descricao, vocabulario: c.TDCS_VOCABULARIO_REGIME }; }).sort((a, b) => a.modelo - b.modelo);

    return { calcular, atividades, tiposDoc };
  }
  return { criar };
});
