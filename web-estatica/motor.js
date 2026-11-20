// Motor de cálculo da Calculadora RTC (regime regular) para o navegador.
//
// Tradução para JavaScript dos serviços Java da calculadora oficial da Receita
// Federal (github.com/ReceitaFederal/calculadora-rtc-regime-regular):
// ProcessamentoItemService, CalculoTributoService, CalculoCbsIbsService,
// CalculoImpostoSeletivoService, MemoriaCalculoService, BaseCalculoUnificadaService
// e TributacaoCompraGovernamentalDomain. As fórmulas NÃO estão no código: vêm das
// tabelas oficiais (TRATAMENTO_TRIBUTARIO etc.) extraídas por gerar_dados.py e são
// avaliadas aqui com aritmética decimal e arredondamento HALF_EVEN, como no Java.
//
// Fora do escopo: monofasia (a própria calculadora oficial ainda não implementa),
// pedágio, geração/validação de XML e regras de nomenclatura específicas por tpDoc.
(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) module.exports = fabrica(require("decimal.js"));
  else raiz.MotorRTC = fabrica(raiz.Decimal);
})(typeof self !== "undefined" ? self : this, function (DecimalBase) {
  "use strict";
  const D = DecimalBase.clone({ precision: 34, rounding: DecimalBase.ROUND_HALF_EVEN });
  const ZERO = new D(0), UM = new D(1), CEM = new D(100);
  const HE = D.ROUND_HALF_EVEN;

  /* ---------- utilitários de arredondamento (ArredondamentoUtils) ---------- */
  const dec = (v) => (v === null || v === undefined || v === "" ? null : new D(v));
  const fis = (v) => (v == null ? null : v.toDecimalPlaces(2, HE)); // arredondarValorFiscal
  const aliqPub = (v) => (v == null ? null : v.toDecimalPlaces(4, HE)); // arredondarAliquotaPublicada
  const pf = (v) => (v == null ? null : v.div(CEM)); // percentualParaFracao
  const fp = (v) => (v == null ? null : v.times(CEM)); // fracaoParaPercentual
  const publicar = (fr) => (fr == null ? null : pf(aliqPub(fp(fr))));
  const moeda = (v) => (v == null ? null : v.toFixed(2, HE));
  function aliqTxt(v) {
    if (v == null) return null;
    let s = v.toDecimalPlaces(4, HE).toFixed(4);
    s = s.replace(/0+$/, "");
    const [i, f = ""] = s.split(".");
    return i + "." + (f.length < 2 ? f.padEnd(2, "0") : f);
  }
  const qtdTxt = (v) => (v == null ? null : v.isInteger() ? v.toFixed(0) : v.toFixed(4, HE));
  const brMoeda = (v) => {
    const s = (v || ZERO).toFixed(2, HE);
    const [i, f] = s.split(".");
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + f;
  };
  const brPct = (v) => {
    let s = (v || ZERO).toDecimalPlaces(4, HE).toFixed(4).replace(/0{1,2}$/, "");
    if (s.endsWith("0") && s.split(".")[1].length > 2) s = s.slice(0, -1);
    const [i, f] = s.split(".");
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + f;
  };

  /* ---------- avaliador de expressões (AvaliadorExpressaoAritmetica / JEXL) ---------- */
  function avaliar(expr, vars) {
    const toks = String(expr).match(/\d+(?:\.\d+)?|[A-Za-z_]\w*|[()+\-*/]/g) || [];
    let p = 0;
    const prox = () => toks[p], come = () => toks[p++];
    function primario() {
      const t = come();
      if (t === "(") { const v = soma(); come(); return v; }
      if (t === "-") return primario().neg();
      if (t === "+") return primario();
      if (/^\d/.test(t)) return new D(t);
      const v = vars[t];
      return v == null ? ZERO : v;
    }
    function prod() {
      let v = primario();
      while (prox() === "*" || prox() === "/") {
        const op = come(), d = primario();
        v = op === "*" ? v.times(d) : v.div(d);
      }
      return v;
    }
    function soma() {
      let v = prod();
      while (prox() === "+" || prox() === "-") {
        const op = come(), d = prod();
        v = op === "+" ? v.plus(d) : v.minus(d);
      }
      return v;
    }
    return soma();
  }

  /* ---------- erros (ProblemType) ---------- */
  const NAO_ENCONTRADO = new Set(["REG-002", "REG-003", "REG-004", "REG-005", "REG-008", "REG-019", "REG-020", "CAL-001"]);
  class ErroRTC extends Error {
    constructor(code, title, detail, campo, estado = "INCONSISTENCIA_ENTRADA", tipo = "erro") {
      super(detail);
      Object.assign(this, { code, title, detail, campo, estado, tipo });
    }
  }
  const E = {
    ncmNbs: () => new ErroRTC("REG-001", "NCM e NBS informadas simultaneamente", "Não é permitido informar NCM e NBS simultaneamente para um item", null, undefined, "ncm-nbs-simultaneas"),
    ncm: (n, d) => new ErroRTC("REG-002", "NCM não encontrada", `NCM de código ${n} não encontrada para a data ${d}`, "ncm", undefined, "ncm-nao-encontrada"),
    nbs: (n, d) => new ErroRTC("REG-003", "NBS não encontrada", `NBS de código ${n} não encontrada para a data ${d}`, "nbs", undefined, "nbs-nao-encontrada"),
    cst: (c, d, t) => new ErroRTC("REG-004", "Situação tributária não encontrada", `Situação tributária (CST) não encontrada para código ${c} e data ${d} (${t})`, "cst", undefined, "situacao-tributaria-nao-encontrada"),
    ct: (c, d, t) => new ErroRTC("REG-005", "Classificação tributária não encontrada", `Classificação tributária não encontrada para código ${c} e data ${d} (${t})`, "cClassTrib", undefined, "classificacao-tributaria-nao-encontrada"),
    ctCst: (c, s, t) => new ErroRTC("REG-006", "Classificação tributária não vinculada à situação tributária", `Classificação tributária (cClassTrib) de código ${c} não está vinculada à situação tributária (CST) de código ${s} (${t})`, "cClassTrib", undefined, "classificacao-tributaria-nao-vinculada"),
    trReg: (c, s) => new ErroRTC("REG-009", "Grupo de tributação regular não informado", `Dados da tributação regular devem ser informados para cClassTrib ${c} e CST ${s}`, "tributacaoRegular", undefined, "tributacao-regular-nao-informada"),
    susp: (c, s) => new ErroRTC("REG-010", "Incompatibilidade com suspensão", `Classificação tributária (cClassTrib) ${c} e situação tributária (CST) ${s} incompatíveis com suspensão`, "tributacaoRegular/cClassTrib", undefined, "incompatibilidade-suspensao"),
    ncmVinc: (n, c) => new ErroRTC("REG-011", "NCM não vinculada", `NCM de código ${n} não vinculada à Classificação Tributária de código ${c} (CBS e IBS)`, "ncm", undefined, "ncm-nao-vinculada"),
    nbsVinc: (n, c) => new ErroRTC("REG-012", "NBS não vinculada", `NBS de código ${n} não vinculada à Classificação Tributária de código ${c} (CBS e IBS)`, "nbs", undefined, "nbs-nao-vinculada"),
    isNao: (t, c, d) => new ErroRTC("REG-013", "Dados do Imposto Seletivo não informados", `Dados do Imposto Seletivo devem ser informados para ${t} ${c} e data ${d}`, "impostoSeletivo", undefined, "imposto-seletivo-nao-informado"),
    ncmComp: () => new ErroRTC("REG-015", "NCM completo não informado", "NCM completo não informado", "ncm", undefined, "ncm-completo-nao-informado"),
    nbsComp: () => new ErroRTC("REG-016", "NBS completo não informado", "NBS completo não informado", "nbs", undefined, "nbs-completo-nao-informado"),
    generico: (m) => new ErroRTC("REG-023", "Erro genérico de validação", m, null, undefined, "erro-generico-validacao"),
    campo: (m) => new ErroRTC("REG-024", "Campo inválido", m, null, undefined, "campo-invalido"),
    bcNao: () => new ErroRTC("REG-025", "Base de cálculo não informada", "A base de cálculo de CBS e IBS deve ser informada quando o grupo do Imposto Seletivo não é informado", "baseCalculo", undefined, "base-calculo-nao-informada"),
    bcInc: (a, b, c) => new ErroRTC("REG-026", "Base de cálculo inconsistente", `A base de cálculo de CBS e IBS informada ${a} difere da soma da base de cálculo do Imposto Seletivo ${b} com o Imposto Seletivo informado ${c}`, "baseCalculo", undefined, "base-calculo-inconsistente"),
    bcMenor: (a, b) => new ErroRTC("REG-027", "Base de cálculo menor que a base de cálculo do Imposto Seletivo", `A base de cálculo de CBS e IBS informada ${a} é menor que a base de cálculo do Imposto Seletivo ${b}`, "baseCalculo", undefined, "base-calculo-menor"),
    dfe: (t, d) => new ErroRTC("REG-028", "Tipo de documento fiscal não encontrado", `Tipo de documento fiscal (tpDoc) de código ${t} não encontrado ou fora de vigência na data ${d}`, "tpDoc", undefined, "tipo-dfe-nao-encontrado"),
    dfeVinc: (c, t) => new ErroRTC("REG-029", "Classificação tributária não vinculada ao tipo de documento", `Classificação Tributária de código ${c} não vinculada ao tipo de documento fiscal (tpDoc) ${t} (CBS e IBS)`, "cClassTrib", undefined, "classificacao-nao-vinculada-tipo-dfe"),
    bcComp: (a, b) => new ErroRTC("REG-034", "Base de cálculo inconsistente", `A base de cálculo informada ${a} difere da base calculada a partir dos componentes ${b}`, "baseCalculo", undefined, "base-calculo-componentes-inconsistente"),
    isAliq: (t, c, d) => new ErroRTC("REG-035", "Alíquota do Imposto Seletivo não informada", `A alíquota do Imposto Seletivo deve ser informada em aliquotasNominais.impostoSeletivo para ${t} ${c} e data ${d}, pois ainda não foi definida em lei`, "aliquotasNominais/impostoSeletivo", undefined, "aliquota-imposto-seletivo-nao-informada"),
    anIndev: () => new ErroRTC("REG-036", "Alíquotas nominais informadas indevidamente", "As alíquotas nominais não podem ser informadas para operações com fato gerador anterior a 01/01/2027, pois a calculadora resolve as alíquotas vigentes", "aliquotasNominais", undefined, "aliquotas-nominais-indevidas"),
    anNao: () => new ErroRTC("REG-037", "Alíquotas nominais não informadas", "As alíquotas nominais (os três campos cbs, ibsEstadual e ibsMunicipal) devem ser informadas para operações com fato gerador a partir de 01/01/2027", "aliquotasNominais", undefined, "aliquotas-nominais-nao-informadas"),
    dfeNaoTratado: (t, s) => new ErroRTC("REG-038", "Tipo de documento fiscal não tratado", `Tipo de documento fiscal (tpDoc) de código ${t} (${s}) não possui tratamento implementado na calculadora`, "tpDoc", undefined, "tipo-dfe-nao-tratado"),
    naoImpl: (c) => new ErroRTC("CAL-007", "Classificação tributária em desenvolvimento", `A classificação tributária ${c} ainda não possui tratamento tributário implementado na Calculadora. Essa funcionalidade está prevista no roadmap e será disponibilizada em versão futura.`, "cClassTrib", "NAO_IMPLEMENTADO", "erro-falta-implementacao"),
  };

  /* ---------- acesso às tabelas oficiais ---------- */
  const vigente = (r, data) => r.ini.slice(0, 10) <= data && (!r.fim || r.fim.slice(0, 10) >= data);

  function criar(R, NCM, MUN) {
    const CBS = 2, IBSUF = 3, IBSMUN = 4, IS = 1;
    const sitPorId = new Map(R.situacoes.map((s) => [s.id, s]));
    const trat = new Map(R.tratamentos.map((t) => [t.TRTR_ID, t]));
    const tribNome = { 1: "Imposto Seletivo", 2: "CBS", 3: "IBS Estadual", 4: "IBS Municipal" };
    const ncmIdx = new Map();
    for (const [cd, , ini, fim] of NCM || []) {
      if (!ncmIdx.has(cd)) ncmIdx.set(cd, []);
      ncmIdx.get(cd).push({ ini, fim });
    }
    const munIdx = new Map((MUN || []).map(([cd, uf]) => [cd, uf]));
    const nbsIdx = new Map();
    for (const n of R.nbs) { if (!nbsIdx.has(n.cd)) nbsIdx.set(n.cd, []); nbsIdx.get(n.cd).push(n); }

    const situacao = (cd, tb, data) => R.situacoes.find((s) => s.cd === cd && vigente(s, data) && String(s.tributos || "").split(",").includes(String(tb)));
    function classificacao(cd, tb, data) {
      for (const c of R.classificacoes) {
        if (c.cd !== cd || !vigente(c, data)) continue;
        const s = sitPorId.get(c.sitr);
        if (s && vigente(s, data) && String(s.tributos || "").split(",").includes(String(tb))) return { ...c, cst: s.cd, situacao: s };
      }
      return null;
    }
    const tratamentoDe = (clId, data) => {
      const tc = R.tratClass.find((t) => t.cl === clId && vigente(t, data));
      return tc ? trat.get(tc.tr) : null;
    };
    const reducao = (clId, tb, data) => { const r = R.reducoes.find((x) => x.cl === clId && x.tb === tb && vigente(x, data)); return r ? dec(r.v) : null; };
    const aliqRef = (tb, data) => { const r = R.aliqRef.find((x) => x.tb === tb && vigente(x, data)); return r ? dec(r.v) : null; };
    const fundamentacao = (clId, data) => R.fundamentacao.find((f) => f.cl === clId && vigente(f, data));
    const redutorCompraGov = (data) => { const r = R.redutorCompraGov.find((x) => vigente(x, data)); return r ? dec(r.v) : ZERO; };
    const transfCbs = (data) => { const r = R.transfCbs.find((x) => vigente(x, data)); return r ? dec(r.v) : ZERO; };
    const existeNcm = (n, data) => (ncmIdx.get(n) || []).some((r) => vigente(r, data));
    const existeNbs = (n, data) => (nbsIdx.get(n) || []).some((r) => vigente(r, data));

    function validarNcmAplicavel(ncm, cl, data) {
      const regs = R.ncmAplicavel.filter((n) => n.cl === cl.id && vigente(n, data));
      const completo = ncm && ncm.length === 8;
      if (regs.length && !completo) throw E.ncmComp();
      if (!completo || !regs.length) return;
      const casam = regs.filter((n) => ncm.startsWith(n.ncm));
      if (!casam.length) throw E.ncmVinc(ncm, cl.cd);
      const excecao = (n) => R.excecaoNcm.some((e) => e.ncma === n.id && ncm.startsWith(e.ncm) && vigente(e, data));
      if (casam.some(excecao) && !casam.some((n) => !R.excecaoNcm.some((e) => e.ncma === n.id && vigente(e, data)))) throw E.ncmVinc(ncm, cl.cd);
    }
    function validarNbsAplicavel(nbs, cl, data) {
      const regs = R.nbsAplicavel.filter((n) => n.cl === cl.id && vigente(n, data));
      const completo = nbs && nbs.length === 9;
      if (regs.length && !completo) throw E.nbsComp();
      if (!completo || !regs.length) return;
      if (!regs.some((n) => nbs.startsWith(n.nbs))) throw E.nbsVinc(nbs, cl.cd);
    }

    /* ---------- base de cálculo unificada (ElementoBaseCalculo) ---------- */
    const ELEMENTOS = [
      ["vProd", 1, "RIS", null, 2026, 2033, [55, 65]], ["vFrete", 1, "RIS", null, 2026, 2033, [55, 65]],
      ["vSeg", 1, "RIS", null, 2026, 2033, [55, 65]], ["vOutro", 1, "RIS", null, 2026, 2033, [55, 65]],
      ["vII", 1, "RI", "BEM", 2026, 2033, [55]], ["vIS", 1, "RS", null, 2027, 2033, [55, 65]],
      ["vDesc", -1, "RIS", null, 2026, 2033, [55, 65]], ["vPIS", -1, "RI", null, 2026, 2026, [55, 65]],
      ["vCOFINS", -1, "RI", null, 2026, 2026, [55, 65]], ["vICMS", -1, "RI", "BEM", 2026, 2032, [55, 65]],
      ["vICMSUFDest", -1, "RI", "BEM", 2026, 2032, [55]], ["vFCP", -1, "RI", "BEM", 2026, 2032, [55, 65]],
      ["vFCPUFDest", -1, "RI", "BEM", 2026, 2032, [55]], ["vICMSMono", -1, "RI", "BEM", 2026, 2032, [55, 65]],
      ["vISSQN", -1, "RI", "SERVICO", 2026, 2032, [55, 65]],
    ];
    function baseUnificada(comp, ano, natureza, tpDoc) {
      if (tpDoc !== 55 && tpDoc !== 65) throw E.campo("Tipo de documento deve ser 55 (NF-e) ou 65 (NFC-e)");
      const nat = natureza ? String(natureza).toUpperCase().replace("Ç", "C") : null;
      let rg = ZERO, is = ZERO, sn = ZERO;
      const avisos = [];
      for (const [tag, sinal, bases, soNat, ini, fim, docs] of ELEMENTOS) {
        const v = dec(comp[tag]);
        const anoOk = ano >= ini && ano <= fim, natOk = !soNat || nat === soNat, docOk = docs.includes(tpDoc);
        if (!(anoOk && natOk && docOk)) {
          if (v && !v.isZero()) {
            if (!anoOk) avisos.push(`Campo ${tag} não compõe as bases para o ano ${ano} (vigência ${ini}–${fim}) e foi ignorado no cálculo`);
            else if (!natOk) avisos.push(`Campo ${tag} não compõe as bases para a natureza ${nat} (aplicável apenas a ${soNat}) e foi ignorado no cálculo`);
            else avisos.push(`Campo ${tag} não compõe as bases para o documento modelo ${tpDoc} e foi ignorado no cálculo`);
          }
          continue;
        }
        if (!v || v.isZero()) continue;
        const x = sinal > 0 ? v : v.neg();
        if (bases.includes("R")) rg = rg.plus(x);
        if (bases.includes("I")) is = is.plus(x);
        if (bases.includes("S")) sn = sn.plus(x);
      }
      return { baseRG: rg, baseIS: is, baseSN: sn, avisos };
    }

    /* ---------- cálculo de um tributo (CalculoCbsIbsService.calcularCbsIbs) ---------- */
    function calcularTributo(tb, item, tc, isCalculado, temRegular, data, tpEnteGov, pRedutor) {
      // (tpEnteGov já chega como ente equivalente: 3→2, 5 e 6→4)
      const tt = trat.get(tc.tr);
      const cl = tc.cl;
      const sit = situacao(item.cst, tb, data);
      if (tt.TRTR_IN_POSSUI_AJUSTE) throw E.naoImpl(cl.cd);
      if (tt.TRTR_IN_POSSUI_MONOFASIA) throw E.naoImpl(cl.cd);
      const possuiReducao = !!tt.TRTR_IN_POSSUI_PERCENTUAL_REDUCAO;
      const pRed = possuiReducao ? pf(reducao(cl.id, tb, data)) : null;
      const tipoAliq = cl.cd === "510001" ? "Padrão" : cl.tipoAliquota;
      const nominal = item.aliquotasNominais ? dec({ 2: item.aliquotasNominais.cbs, 3: item.aliquotasNominais.ibsEstadual, 4: item.aliquotasNominais.ibsMunicipal }[tb]) : null;
      let aliquota = null, informada = false, divCem = false;
      if (["Padrão", "Uniforme nacional (referência)", "Uniforme setorial", "Fixa"].includes(tipoAliq)) {
        if (nominal != null) { aliquota = pf(nominal); informada = true; }
        else if (tipoAliq === "Padrão" || tipoAliq === "Uniforme nacional (referência)") {
          const r = aliqRef(tb, data);
          if (r == null) throw new ErroRTC("CAL-001", "Alíquota não encontrada", `Alíquota de referencia ou padrão não encontrada para o tributo com id ${tb} e data ${data}`, null, "FALHA_TECNICA");
          aliquota = pf(r);
        } else {
          const r = (R.aliqClass || []).find((x) => x.cl === cl.id && x.tb === tb && x.v != null && vigente(x, data));
          if (!r) throw E.generico(`Alíquota ${tipoAliq === "Fixa" ? "fixa" : "uniforme setorial"} não encontrada em ${data}`);
          aliquota = pf(dec(r.v));
        }
        divCem = true;
      } else if (tipoAliq === "Sem alíquota") {
        if (nominal != null) { aliquota = pf(nominal); informada = true; divCem = true; } else aliquota = ZERO;
      }
      const v = (o) => o;
      let rAliq = null;
      const exA = tt.TRTR_EXPRESSAO_ALIQUOTA;
      if (informada && !(exA && /\baliquota\b/.test(exA))) rAliq = aliquota;
      else if (exA && exA.trim()) rAliq = avaliar(exA, { aliquota, quantidade: item._qtd, percentualReducao: pRed });
      if (divCem) rAliq = publicar(rAliq);
      let rEfet = null;
      if (tt.TRTR_EXPRESSAO_ALIQUOTA_EFETIVA && tt.TRTR_EXPRESSAO_ALIQUOTA_EFETIVA.trim()) {
        rEfet = avaliar(tt.TRTR_EXPRESSAO_ALIQUOTA_EFETIVA, { quantidade: item._qtd, aliquota: rAliq, percentualReducao: pRed, pRedutorCompraGov: pRedutor });
        if (divCem) rEfet = publicar(rEfet);
      }
      const vars = {
        quantidade: item._qtd, aliquota: rAliq, aliquotaEfetiva: rEfet, impostoSeletivoInformado: item._isInformado,
        baseCalculoInformada: item._bc, impostoSeletivoCalculado: isCalculado, percentualReducao: pRed,
      };
      let bc = fis(avaliar(tt.TRTR_EXPRESSAO_BASE_CALCULO, vars));
      if (bc.isNeg()) bc = ZERO;
      vars.baseCalculo = bc;
      const calcExato = avaliar(tt.TRTR_EXPRESSAO_TRIBUTO_CALCULADO, vars);
      const calculado = fis(calcExato);
      vars.tributoCalculado = calculado;
      let devido = null;
      if (tt.TRTR_EXPRESSAO_TRIBUTO_DEVIDO && tt.TRTR_EXPRESSAO_TRIBUTO_DEVIDO.trim()) devido = fis(avaliar(tt.TRTR_EXPRESSAO_TRIBUTO_DEVIDO, vars));
      let gDif = null;
      if (tt.TRTR_EXPRESSAO_PERCENTUAL_DIFERIMENTO && tt.TRTR_EXPRESSAO_VALOR_DIFERIMENTO && tt.TRTR_EXPRESSAO_PERCENTUAL_DIFERIMENTO.trim() && tt.TRTR_EXPRESSAO_VALOR_DIFERIMENTO.trim()) {
        const pDif = publicar(avaliar(tt.TRTR_EXPRESSAO_PERCENTUAL_DIFERIMENTO, vars));
        const vDif = fis(avaliar(tt.TRTR_EXPRESSAO_VALOR_DIFERIMENTO, { ...vars, percentualDiferimento: pDif, tributoCalculado: calcExato }));
        devido = calculado.minus(vDif);
        if (devido.isNeg()) devido = ZERO;
        gDif = { pDif: fp(pDif), vDif };
      }
      if (!sit || !sit.gIBSCBS) return null;
      let gRed = null;
      if (sit.gRed && !(temRegular && tpEnteGov == null) && pRed != null && rEfet != null)
        gRed = { pRedAliq: fp(pRed), pAliqEfet: divCem ? fp(rEfet) : rEfet };
      let compraGov = null;
      if (tpEnteGov != null) compraGov = { pAliq: fp(rEfet), vTrib: devido };
      let regular = null;
      if (temRegular) {
        let ef = rAliq;
        if (possuiReducao && pRed != null) ef = rAliq.times(UM.minus(pRed));
        if (divCem) ef = publicar(ef);
        regular = { cst: item.tributacaoRegular.cst, cClassTrib: item.tributacaoRegular.cClassTrib, aliquotaEfetiva: divCem ? fp(ef) : ef, devido: fis(bc.times(ef)) };
      }
      return {
        gRed, compraGov, regular, gDif,
        calculado: temRegular ? ZERO : calculado,
        devido: temRegular ? ZERO : devido,
        aliquota: temRegular ? ZERO : divCem && rAliq != null ? fp(rAliq) : rAliq,
        baseCalculo: bc, informada,
      };
    }

    function memoria(cl, tt, out, bcInformada, data) {
      const f = fundamentacao(cl.id, data);
      const texto = cl.memoria;
      if (!texto || !texto.trim()) return "Texto de memória de cálculo não encontrado";
      const t = out || { baseCalculo: bcInformada };
      const vals = {
        norma: f ? f.curto : "", tratamento: tt.TRTR_DESCRICAO, base_calculo: brMoeda(t.baseCalculo),
        aliquota_ad_valorem: brPct(t.aliquota), aliquota_ad_rem: brPct(null), quantidade: "", unidade: "",
        percentual_reducao: brPct(t.gRed ? t.gRed.pRedAliq : null),
        percentual_diferimento: brPct(t.gDif ? t.gDif.pDif : null), valor_diferimento: brMoeda(t.gDif ? t.gDif.vDif : null),
        aliquota_desoneracao: brPct(null), montante_desoneracao: brMoeda(null),
      };
      return texto.replace(/\[(\w+)\]/g, (m, k) => (k in vals ? vals[k] : m));
    }

    /* ---------- processamento de um item (ProcessamentoItemService) ---------- */
    function validarFormato(item) {
      const digitos = (v, int, frac) => { if (v == null) return true; const t = String(v); if (!/^-?\d+(\.\d+)?$/.test(t) && isNaN(Number(t))) return false; const d = new D(t); const [i, f = ""] = d.abs().toFixed().split("."); return i.replace(/^0+/, "").length <= int && f.length <= frac; };
      const v = (code, titulo, campo, msg, val) => new ErroRTC(code, titulo, `Campo '${campo}' ${msg}` + (val != null ? `, recebido: '${val}'` : ""), campo);
      if (item.numero == null) throw v("VAL-001", "Campo obrigatório não informado", "numero", "não deve ser nulo");
      if (item.cst == null) throw v("VAL-001", "Campo obrigatório não informado", "cst", "não deve ser nulo");
      if (item.cClassTrib == null) throw v("VAL-001", "Campo obrigatório não informado", "cClassTrib", "não deve ser nulo");
      if (!/^\d+$/.test(item.cst)) throw v("VAL-009", "Formato inválido", "cst", "Informar somente dígitos", item.cst);
      if (String(item.cst).length !== 3) throw v("VAL-004", "Tamanho fora do intervalo permitido", "cst", "tamanho deve ser entre 3 e 3", item.cst);
      if (!/^\d+$/.test(item.cClassTrib)) throw v("VAL-009", "Formato inválido", "cClassTrib", "Informar somente dígitos", item.cClassTrib);
      if (String(item.cClassTrib).length !== 6) throw v("VAL-004", "Tamanho fora do intervalo permitido", "cClassTrib", "tamanho deve ser entre 6 e 6", item.cClassTrib);
      if (item.baseCalculo != null && new D(item.baseCalculo).isNeg()) throw v("VAL-013", "Valor deve ser positivo ou zero", "baseCalculo", "deve ser maior ou igual a 0", item.baseCalculo);
      if (!digitos(item.baseCalculo, 13, 2)) throw v("VAL-010", "Quantidade de dígitos inválida", "baseCalculo", "valor numérico fora do limite (<13 dígitos>.<2 dígitos> esperado)", item.baseCalculo);
      if (!digitos(item.quantidade, 11, 4)) throw v("VAL-010", "Quantidade de dígitos inválida", "quantidade", "valor numérico fora do limite (<11 dígitos>.<4 dígitos> esperado)", item.quantidade);
    }

    function processarItem(op, item, data, tipoDfe, pRedutor) {
      validarFormato(item);
      const ano = Number(data.slice(0, 4));
      item = JSON.parse(JSON.stringify(item));
      if (item.quantidade == null) item.quantidade = 1;
      if (item.unidade == null) item.unidade = "UN";
      if (tipoDfe && tipoDfe.ncmZero && (item.ncm === "00" || item.ncm === "00000000")) item.ncm = null;
      const blank = (s) => s == null || String(s).trim() === "";
      const is = item.impostoSeletivo;
      const comp = item.gComponentesBC;
      const possuiComp = comp && Object.values(comp).some((x) => x != null);
      if (possuiComp) {
        const nat = !blank(item.ncm) && blank(item.nbs) ? "BEM" : blank(item.ncm) && !blank(item.nbs) ? "SERVICO" : null;
        const r = baseUnificada(comp, ano, nat, op.tpDoc ?? null);
        if (is) {
          if (r.baseIS.isNeg()) throw E.generico("A base de cálculo do Imposto Seletivo calculada a partir dos componentes é negativa");
          const decl = dec(is.baseCalculo);
          if (decl != null && !decl.eq(r.baseIS)) throw E.bcComp(decl.toString(), r.baseIS.toString());
          if (decl == null) is.baseCalculo = r.baseIS.toString();
        } else {
          if (r.baseRG.isNeg()) throw E.generico("A base de cálculo calculada a partir dos componentes é negativa");
          const decl = dec(item.baseCalculo);
          if (decl != null && !decl.eq(r.baseRG)) throw E.bcComp(decl.toString(), r.baseRG.toString());
          if (decl == null) item.baseCalculo = r.baseRG.toString();
        }
      } else {
        const bc = dec(item.baseCalculo);
        if (!is) { if (bc == null) throw E.bcNao(); }
        else {
          const bcIs = dec(is.baseCalculo);
          if (bcIs == null) throw E.generico("A base de cálculo do Imposto Seletivo deve ser informada quando o grupo de Imposto Seletivo é informado");
          const isInf = dec(is.impostoInformado);
          if (bc == null) item.baseCalculo = bcIs.plus(isInf || ZERO).toString();
          else if (isInf != null) { if (!bc.eq(bcIs.plus(isInf))) throw E.bcInc(bc.toString(), bcIs.toString(), isInf.toString()); }
          else if (bc.lt(bcIs)) throw E.bcMenor(bc.toString(), bcIs.toString());
        }
      }
      if (!blank(item.ncm) && !blank(item.nbs)) throw E.ncmNbs();
      if (!blank(item.ncm) && !existeNcm(item.ncm, data)) throw E.ncm(item.ncm, data);
      if (!blank(item.nbs) && !existeNbs(item.nbs, data)) throw E.nbs(item.nbs, data);
      const sitCbs = situacao(item.cst, CBS, data);
      if (!sitCbs) throw E.cst(item.cst, data, "CBS");
      const an = item.aliquotasNominais;
      if (ano < 2027) {
        if (an && (an.cbs != null || an.ibsEstadual != null || an.ibsMunicipal != null || (an.impostoSeletivo && (an.impostoSeletivo.adValorem != null || an.impostoSeletivo.adRem != null)))) throw E.anIndev();
      } else if (sitCbs.gIBSCBS && (!an || an.cbs == null || an.ibsEstadual == null || an.ibsMunicipal == null)) throw E.anNao();

      // tratamento da classificação
      let cl = classificacao(item.cClassTrib, CBS, data);
      if (!cl) throw E.ct(item.cClassTrib, data, "CBS e IBS");
      const temNom = !blank(item.ncm) || !blank(item.nbs);
      if (temNom && cl.cst !== item.cst) throw E.ctCst(cl.cd, item.cst, "CBS e IBS");
      const vincDfe = (c) => { if (tipoDfe && !R.dfeClass.some((x) => x.cl === c.id && x.tp === tipoDfe.id && vigente(x, data))) throw E.dfeVinc(c.cd, tipoDfe.modelo); };
      vincDfe(cl);
      let tt = tratamentoDe(cl.id, data);
      if (!tt) throw new ErroRTC("REG-008", "Tratamento de classificação não encontrado", `Tratamento de classificação não encontrado para ${cl.cd}`, "cClassTrib");
      let tcCbsIbs = { cl, tr: tt.TRTR_ID }, tcDeson = null, temDeson = false;
      if (tt.TRTR_IN_EXIGE_GRUPO_DESONERACAO) {
        if (!item.tributacaoRegular) throw E.trReg(item.cClassTrib, item.cst);
        tcDeson = tcCbsIbs;
        const clr = classificacao(item.tributacaoRegular.cClassTrib, CBS, data);
        if (!clr) throw E.ct(item.tributacaoRegular.cClassTrib, data, "CBS e IBS");
        if (temNom && clr.cst !== item.tributacaoRegular.cst) throw E.ctCst(clr.cd, item.tributacaoRegular.cst, "CBS e IBS");
        vincDfe(clr);
        const ttr = tratamentoDe(clr.id, data);
        if (!ttr) throw new ErroRTC("REG-008", "Tratamento de classificação não encontrado", `Tratamento de classificação não encontrado para ${clr.cd}`, "cClassTrib");
        if (ttr.TRTR_IN_INCOMPATIVEL_COM_SUSPENSAO) throw E.susp(clr.cd, item.tributacaoRegular.cst);
        cl = clr; tcCbsIbs = { cl: clr, tr: ttr.TRTR_ID }; temDeson = true;
      } else if (item.tributacaoRegular && tipoDfe) {
        const clr = classificacao(item.tributacaoRegular.cClassTrib, CBS, data);
        if (clr) vincDfe(clr);
      }
      if (blank(item.ncm) && blank(item.nbs)) { validarNcmAplicavel(item.ncm, cl, data); validarNbsAplicavel(item.nbs, cl, data); }
      if (!blank(item.ncm) && blank(item.nbs)) validarNcmAplicavel(item.ncm, cl, data);
      if (!blank(item.nbs) && blank(item.ncm)) validarNbsAplicavel(item.nbs, cl, data);

      // Imposto Seletivo
      let clIs = null;
      if (is) {
        if (!situacao(is.cst, IS, data)) throw E.cst(is.cst, data, "Imposto Seletivo");
        clIs = classificacao(is.cClassTrib, IS, data);
        if (!clIs) throw E.ct(is.cClassTrib, data, "Imposto Seletivo");
        if (clIs.cst !== is.cst) throw E.ctCst(clIs.cd, is.cst, "Imposto Seletivo");
      }
      const anIs = is && an ? an.impostoSeletivo : null;
      if (anIs && anIs.adRem != null && blank(is.unidade)) throw E.generico("A unidade de medida do Imposto Seletivo deve ser informada quando a alíquota ad rem é informada pelo usuário");
      let aliqIs = null;
      if (anIs && (anIs.adValorem != null || anIs.adRem != null)) aliqIs = { adValorem: dec(anIs.adValorem), adRem: dec(anIs.adRem) };
      const nom = !blank(item.ncm) ? ["NCM", item.ncm] : ["NBS", item.nbs];
      if (!aliqIs && ano >= 2027 && !blank(item.ncm) && item.ncm.length === 8 && R.isNcm.includes(item.ncm)) {
        if (!is) throw E.isNao(nom[0], nom[1], data);
        throw E.isAliq(nom[0], nom[1], data);
      }
      let tcIs = null;
      if (aliqIs) {
        if (!is) throw E.isNao(nom[0], nom[1], data);
        if (aliqIs.adRem != null) {
          if (is.quantidade == null) throw E.generico("A quantidade do Imposto Seletivo deve ser informada para alíquota ad rem");
          if (!dec(is.quantidade).gt(0)) throw E.generico("A quantidade do Imposto Seletivo deve ser maior do que zero para alíquota ad rem");
        }
        if (item.quantidade != null && !dec(item.quantidade).gt(0)) throw E.generico("A quantidade do item deve ser maior do que zero");
        const ttIs = tratamentoDe(clIs.id, data);
        tcIs = { cl: clIs, tr: ttIs.TRTR_ID };
      }

      // cálculo (CalculoTributoService)
      item._qtd = dec(item.quantidade);
      item._bc = dec(item.baseCalculo);
      item._isInformado = is ? dec(is.impostoInformado) || ZERO : ZERO;
      let IS_ = null;
      if (tcIs) {
        const ttIs = trat.get(tcIs.tr);
        const adV = aliqIs.adValorem != null ? pf(aliqPub(aliqIs.adValorem)) : null;
        const adR = aliqPub(aliqIs.adRem);
        const q = dec(is.quantidade);
        const vv = { quantidade: q, baseCalculoInformada: dec(is.baseCalculo), impostoSeletivoInformado: item._isInformado, impostoSeletivoCalculado: ZERO, aliquotaAdValorem: adV, aliquotaAdRem: adR };
        const bcIs = fis(avaliar(ttIs.TRTR_EXPRESSAO_BASE_CALCULO, vv));
        vv.baseCalculo = bcIs;
        const calc = fis(avaliar(ttIs.TRTR_EXPRESSAO_TRIBUTO_CALCULADO, vv));
        vv.tributoCalculado = calc;
        const vIS = ttIs.TRTR_EXPRESSAO_TRIBUTO_DEVIDO && ttIs.TRTR_EXPRESSAO_TRIBUTO_DEVIDO.trim() ? fis(avaliar(ttIs.TRTR_EXPRESSAO_TRIBUTO_DEVIDO, vv)) : null;
        const f = fundamentacao(clIs.id, data);
        const mem = clIs.memoria && clIs.memoria.trim() ? clIs.memoria.replace(/\[(\w+)\]/g, (m, k) => ({
          norma: f ? f.curto : "", tratamento: ttIs.TRTR_DESCRICAO, base_calculo: brMoeda(bcIs), aliquota_ad_valorem: brPct(fp(adV)),
          aliquota_ad_rem: brPct(adR), quantidade: is.quantidade != null ? String(is.quantidade) : "", unidade: is.unidade || "",
        }[k] ?? m)) : "Texto de memória de cálculo não encontrado";
        IS_ = { CSTIS: is.cst, cClassTribIS: is.cClassTrib, vBCIS: bcIs, pIS: fp(adV), adRemIS: adR, uTrib: is.unidade, qTrib: q, vIS, memoriaCalculo: mem };
      }
      const isCalc = IS_ ? IS_.vIS : ZERO;
      const tpEnte = op.gCompraGov ? ({ 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4 })[op.gCompraGov.tpEnteGov] ?? null : null;
      const cbs = calcularTributo(CBS, item, tcCbsIbs, isCalc, temDeson, data, tpEnte, pRedutor);
      const uf = calcularTributo(IBSUF, item, tcCbsIbs, isCalc, temDeson, data, tpEnte, pRedutor);
      const mun = calcularTributo(IBSMUN, item, tcCbsIbs, isCalc, temDeson, data, tpEnte, pRedutor);
      const tcMem = tcDeson || tcCbsIbs;
      const ttMem = trat.get(tcMem.tr);
      const mem = { cbs: memoria(tcMem.cl, ttMem, cbs, item._bc, data), ibsUF: memoria(tcMem.cl, ttMem, uf, item._bc, data), ibsMun: memoria(tcMem.cl, ttMem, mun, item._bc, data) };
      const simulado = item.aliquotasNominais != null;

      // grupo gIBSCBS (getGIBSCBS)
      let g = null;
      if (cbs || uf || mun) {
        const vBC = (mun || uf || cbs).baseCalculo;
        let cg = null;
        if (tpEnte != null && cbs && uf && mun) {
          cg = { pAliqCBS: cbs.compraGov.pAliq, vTribCBS: cbs.compraGov.vTrib, pAliqIBSUF: uf.compraGov.pAliq, vTribIBSUF: uf.compraGov.vTrib, pAliqIBSMun: mun.compraGov.pAliq, vTribIBSMun: mun.compraGov.vTrib };
          let ef = cg;
          if (data >= "2027-01-01") {
            const soma = cg.pAliqCBS.plus(cg.pAliqIBSUF).plus(cg.pAliqIBSMun);
            const com = (a, b, c) => ({ pAliqCBS: a, vTribCBS: fis(vBC.times(pf(a))), pAliqIBSUF: b, vTribIBSUF: fis(vBC.times(pf(b))), pAliqIBSMun: c, vTribIBSMun: fis(vBC.times(pf(c))) });
            if (tpEnte === 1) ef = com(soma, ZERO, ZERO);
            else {
              const pcbs = aliqPub(cg.pAliqCBS.minus(cg.pAliqCBS.times(pf(transfCbs(data)))));
              const rec = soma.minus(pcbs);
              ef = tpEnte === 2 ? com(pcbs, rec, ZERO) : com(pcbs, ZERO, rec);
            }
          }
          const impacto = (t, aliq, valor) => {
            if (!t) return;
            if (!t.gRed) t.gRed = { pRedAliq: ZERO };
            if (t.regular) { t.gRed.pRedAliq = ZERO; t.gRed.pAliqEfet = ZERO; t.devido = ZERO; t.regular.aliquotaEfetiva = aliq; t.regular.devido = valor; return; }
            t.gRed.pAliqEfet = aliq;
            if (!t.gDif) { t.devido = valor; return; }
            const bruto = fis(vBC.times(pf(aliq)));
            const vDif = fis(vBC.times(pf(aliq)).times(pf(t.gDif.pDif)));
            t.gDif.vDif = vDif;
            const dv = bruto.minus(vDif);
            t.devido = dv.isNeg() ? ZERO : dv;
          };
          impacto(cbs, ef.pAliqCBS, ef.vTribCBS); impacto(uf, ef.pAliqIBSUF, ef.vTribIBSUF); impacto(mun, ef.pAliqIBSMun, ef.vTribIBSMun);
        }
        const grp = (t, p, v) => {
          if (!t) return null;
          const o = { [p]: aliqTxt(t.aliquota) };
          if (t.gDif) o.gDif = { pDif: aliqTxt(t.gDif.pDif), vDif: moeda(t.gDif.vDif) };
          if (t.gRed) o.gRed = { pRedAliq: aliqTxt(t.gRed.pRedAliq), pAliqEfet: aliqTxt(t.gRed.pAliqEfet) };
          o[v] = moeda(t.devido);
          return o;
        };
        g = { vBC: moeda(vBC) };
        const gUF = grp(uf, "pIBSUF", "vIBSUF"), gMun = grp(mun, "pIBSMun", "vIBSMun");
        if (gUF) g.gIBSUF = gUF;
        if (gMun) g.gIBSMun = gMun;
        g.vIBS = moeda((uf ? uf.devido : ZERO).plus(mun ? mun.devido : ZERO));
        const gC = grp(cbs, "pCBS", "vCBS");
        if (gC) g.gCBS = gC;
        if (cbs && cbs.regular) {
          const r = cbs.regular;
          g.gTribRegular = { CSTReg: r.cst, cClassTribReg: r.cClassTrib, pAliqEfetRegIBSUF: aliqTxt(uf.regular.aliquotaEfetiva), vTribRegIBSUF: moeda(uf.regular.devido), pAliqEfetRegIBSMun: aliqTxt(mun.regular.aliquotaEfetiva), vTribRegIBSMun: moeda(mun.regular.devido), pAliqEfetRegCBS: aliqTxt(r.aliquotaEfetiva), vTribRegCBS: moeda(r.devido) };
        }
        if (cg) {
          if (cbs.regular) for (const k in cg) cg[k] = ZERO;
          g.gTribCompraGov = { pAliqIBSUF: aliqTxt(cg.pAliqIBSUF), vTribIBSUF: moeda(cg.vTribIBSUF), pAliqIBSMun: aliqTxt(cg.pAliqIBSMun), vTribIBSMun: moeda(cg.vTribIBSMun), pAliqCBS: aliqTxt(cg.pAliqCBS), vTribCBS: moeda(cg.vTribCBS) };
        }
        g._num = { vBC, cbs, uf, mun };
      }
      const IBSCBS = { CST: item.cst, cClassTrib: item.cClassTrib };
      if (g) { const { _num, ...gg } = g; IBSCBS.gIBSCBS = gg; }
      IBSCBS.memoriaCalculo = mem;
      const tribCalc = {};
      if (IS_) {
        const o = { CSTIS: IS_.CSTIS, cClassTribIS: IS_.cClassTribIS, vBCIS: moeda(IS_.vBCIS) };
        if (IS_.pIS != null) o.pIS = aliqTxt(IS_.pIS);
        if (IS_.adRemIS != null) { o.pISEspec = aliqTxt(IS_.adRemIS); o.adRemIS = aliqTxt(IS_.adRemIS); }
        Object.assign(o, { uTrib: IS_.uTrib, qTrib: qtdTxt(IS_.qTrib), vIS: moeda(IS_.vIS), memoriaCalculo: IS_.memoriaCalculo });
        tribCalc.IS = o;
      }
      tribCalc.IBSCBS = IBSCBS;
      return { tribCalc, simulado, _num: g ? g._num : null, _is: IS_ };
    }

    /* ---------- operação inteira (/regime-geral e /observabilidade/regime-geral) ---------- */
    function calcular(op, { observabilidade = false } = {}) {
      const dh = op.dhFatoGerador || op.dataHoraEmissao;
      if (!dh) return erroOperacao(new ErroRTC("REG-021", "Data do fato gerador não informada", "Data do fato gerador não informada"), observabilidade);
      const data = String(dh).slice(0, 10);
      let tipoDfe = null;
      try {
        if (op.tpDoc != null) {
          tipoDfe = R.tiposDfe.find((t) => t.modelo === Number(op.tpDoc) && vigente(t, data));
          if (!tipoDfe) throw E.dfe(op.tpDoc, data);
          if (!tipoDfe.tratado) throw E.dfeNaoTratado(op.tpDoc, tipoDfe.sigla);
        }
        if (op.uf == null && munIdx.size) { const c = munIdx.get(Number(op.municipio)); if (c == null) throw new ErroRTC("REG-019", "Município não encontrado", `Município de código ${op.municipio} não encontrado`); op = { ...op, uf: (R.ufs.find((u) => u.codigo === c) || {}).sigla }; }
        const ufReg = R.ufs.find((u) => u.sigla === op.uf);
        if (!ufReg) throw new ErroRTC("REG-020", "UF não encontrada", `UF ${op.uf} não encontrada`);
        if (munIdx.size) {
          const c = munIdx.get(Number(op.municipio));
          if (c == null) throw new ErroRTC("REG-019", "Município não encontrado", `Município de código ${op.municipio} não encontrado`);
          if (c !== ufReg.codigo) throw new ErroRTC("REG-018", "Município não pertencente à UF", `Município de código ${op.municipio} não pertence à UF ${op.uf}`);
        }
      } catch (e) { return erroOperacao(e, observabilidade); }
      const pRedutor = op.gCompraGov ? redutorCompraGov(data) : null;
      const objetos = [];
      const tot = { vBC: ZERO, ufV: ZERO, ufD: ZERO, munV: ZERO, munD: ZERO, cbsV: ZERO, cbsD: ZERO, vIS: ZERO, temIS: false };
      let calculados = 0;
      for (let i = 0; i < (op.itens || []).length; i++) {
        const it = op.itens[i];
        try {
          const r = processarItem(op, it, data, tipoDfe, pRedutor);
          const obj = { nObj: it.numero };
          if (observabilidade) obj.estadoItem = r.simulado ? "CALCULO_SIMULADO" : "CALCULADO";
          obj.tribCalc = r.tribCalc;
          if (!observabilidade) obj.calculoSimulado = r.simulado;
          calculados++;
          objetos.push(obj);
          if (r._num) {
            const { vBC, cbs, uf, mun } = r._num;
            tot.vBC = tot.vBC.plus(vBC);
            if (uf) { tot.ufV = tot.ufV.plus(uf.devido); if (uf.gDif) tot.ufD = tot.ufD.plus(uf.gDif.vDif); }
            if (mun) { tot.munV = tot.munV.plus(mun.devido); if (mun.gDif) tot.munD = tot.munD.plus(mun.gDif.vDif); }
            if (cbs) { tot.cbsV = tot.cbsV.plus(cbs.devido); if (cbs.gDif) tot.cbsD = tot.cbsD.plus(cbs.gDif.vDif); }
          }
          if (r._is) { tot.temIS = true; tot.vIS = tot.vIS.plus(r._is.vIS); }
        } catch (e) {
          if (!(e instanceof ErroRTC)) throw e;
          if (!observabilidade) return erroOperacao(e, false);
          objetos.push({ nObj: it.numero, estadoItem: e.estado, erros: [{ code: e.code, title: e.title, pointer: `#/itens/${i}` + (e.campo ? "/" + e.campo.split("/")[0] : ""), detail: e.detail }] });
        }
      }
      const z = "0.00";
      const tribTot = {};
      if (tot.temIS) tribTot.ISTot = { vIS: moeda(tot.vIS) };
      tribTot.IBSCBSTot = {
        vBCIBSCBS: moeda(tot.vBC),
        gIBS: { gIBSUF: { vDif: moeda(tot.ufD), vDevTrib: z, vIBSUF: moeda(tot.ufV) }, gIBSMun: { vDif: moeda(tot.munD), vDevTrib: z, vIBSMun: moeda(tot.munV) }, vIBS: moeda(tot.ufV.plus(tot.munV)), vCredPres: z, vCredPresCondSus: z },
        gCBS: { vDif: moeda(tot.cbsD), vDevTrib: z, vCBS: moeda(tot.cbsV), vCredPres: z, vCredPresCondSus: z },
        gMono: { vIBSMono: z, vCBSMono: z, vIBSMonoReten: z, vCBSMonoReten: z, vIBSMonoRet: z, vCBSMonoRet: z },
      };
      const corpo = {};
      if (op.gCompraGov) corpo.oper = { gCompraGov: { tpEnteGov: op.gCompraGov.tpEnteGov, pRedutor: aliqTxt(pRedutor), tpOperGov: op.gCompraGov.tpOperGov } };
      corpo.objetos = objetos;
      if (calculados) corpo.total = { tribCalc: tribTot };
      return { status: 200, aviso: avisoSimulado(op, data), corpo };
    }

    // AvisoDadosSimuladosService
    function avisoSimulado(op, data) {
      if (data > "2026-12-31") return "6";
      const ficticias = (op.itens || []).some((i) => ["010", "220", "221"].includes(i.cst));
      if (ficticias && data > "2025-12-31") return "5";
      return null;
    }

    function erroOperacao(e, observabilidade) {
      if (!(e instanceof ErroRTC)) throw e;
      const st = NAO_ENCONTRADO.has(e.code) ? 404 : 422;
      return { status: st, aviso: null, corpo: { detail: e.detail, status: st, title: e.title, type: "erro/" + e.tipo, code: e.code } };
    }

    function calcularBaseUnificada(input) {
      try {
        const r = baseUnificada(input, Number(input.anoFatoGerador), input.natureza, Number(input.tipoDocumento));
        return { status: 200, corpo: { baseRG: Number(fis(r.baseRG)), baseIS: Number(fis(r.baseIS)), baseSN: Number(fis(r.baseSN)), avisos: r.avisos } };
      } catch (e) { return erroOperacao(e); }
    }

    // consultas usadas pela interface
    function arvoreCst(data) {
      return R.situacoes.filter((s) => vigente(s, data) && String(s.tributos || "").split(",").includes("2")).sort((a, b) => a.cd.localeCompare(b.cd)).map((s) => ({
        codigo: s.cd, descricao: s.descricao,
        classificacoesTributarias: R.classificacoes.filter((c) => c.sitr === s.id && vigente(c, data)).sort((a, b) => a.cd.localeCompare(b.cd)).map((c) => ({ codigo: c.cd, descricao: c.descricao })),
      }));
    }
    function detalheClassificacao(cd, data, tb = CBS) {
      const c = classificacao(cd, tb, data);
      if (!c) return null;
      const tt = tratamentoDe(c.id, data);
      return {
        codigo: c.cd, descricao: c.descricao, cst: c.cst, tipoAliquota: c.tipoAliquota, nomenclatura: c.nomenclatura,
        descricaoTratamentoTributario: tt ? tt.TRTR_DESCRICAO : null,
        possuiPercentualReducao: !!(tt && tt.TRTR_IN_POSSUI_PERCENTUAL_REDUCAO),
        exigeGrupoDesoneracao: !!(tt && tt.TRTR_IN_EXIGE_GRUPO_DESONERACAO),
        naoImplementado: !!(tt && (tt.TRTR_IN_POSSUI_AJUSTE || tt.TRTR_IN_POSSUI_MONOFASIA)),
        percentualReducaoCbs: Number(reducao(c.id, CBS, data) || 0), percentualReducaoIbsUf: Number(reducao(c.id, IBSUF, data) || 0), percentualReducaoIbsMun: Number(reducao(c.id, IBSMUN, data) || 0),
        fundamentacao: (fundamentacao(c.id, data) || {}).curto || null,
        tiposDfe: R.dfeClass.filter((x) => x.cl === c.id && vigente(x, data)).map((x) => (R.tiposDfe.find((t) => t.id === x.tp) || {}).sigla).filter(Boolean),
        anexoNcm: R.ncmAplicavel.some((n) => n.cl === c.id && vigente(n, data)),
        anexoNbs: R.nbsAplicavel.some((n) => n.cl === c.id && vigente(n, data)),
      };
    }
    function ncmAplicavel(ncm, cd, data) {
      const c = classificacao(cd, CBS, data);
      if (!c) return { valido: false, motivo: "cClassTrib não encontrada" };
      try { validarNcmAplicavel(ncm, c, data); return { valido: true }; } catch (e) { return { valido: false, motivo: e.detail }; }
    }
    function nbsAplicavel(nbs, cd, data) {
      const c = classificacao(cd, CBS, data);
      if (!c) return { valido: false, motivo: "cClassTrib não encontrada" };
      try { validarNbsAplicavel(nbs, c, data); return { valido: true }; } catch (e) { return { valido: false, motivo: e.detail }; }
    }
    const aliquotasReferencia = (data) => ({ cbs: aliqRef(CBS, data), ibsUF: aliqRef(IBSUF, data), ibsMun: aliqRef(IBSMUN, data) });

    return { calcular, calcularBaseUnificada, arvoreCst, detalheClassificacao, ncmAplicavel, nbsAplicavel, aliquotasReferencia, versaoDb: R.versaoDb };
  }

  return { criar, Decimal: D };
});
