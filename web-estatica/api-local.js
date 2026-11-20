// "API local": responde no navegador às mesmas rotas da API oficial que a
// interface (ferramenta/web/app.js) usa, calculando com motor.js e as tabelas
// oficiais em dados/. Quando este arquivo está carregado, a interface não
// precisa de servidor.
"use strict";
(function () {
  let pronto = null;
  const carregar = () => (pronto ||= (async () => {
    const j = (u) => fetch(u).then((r) => r.json());
    const [R, NCM, MUN] = await Promise.all([j("dados/regras.json"), j("dados/ncm.json"), j("dados/municipios.json")]);
    return { R, NCM, MUN, motor: MotorRTC.criar(R, NCM, MUN) };
  })());

  const vig = (r, d) => String(r.ini || r[2]).slice(0, 10) <= d && (!(r.fim ?? r[3]) || String(r.fim ?? r[3]).slice(0, 10) >= d);
  const resp = (status, dados, aviso = null) => ({ status, ok: status < 400, aviso, dados, texto: typeof dados === "string" ? dados : JSON.stringify(dados) });
  const nao = (titulo) => resp(501, { title: "Disponível só na versão com a API oficial", detail: titulo + " depende da API Java oficial. Use a versão servidor (README) para essa função." });
  const naoAchou = (detail) => resp(404, { title: "Não encontrado", detail });

  window.RTC_MODO_LOCAL = true;
  window.RTC_API_LOCAL = async function (metodo, caminho, corpo) {
    const { R, NCM, MUN, motor } = await carregar();
    const url = new URL(caminho, "http://x");
    const q = Object.fromEntries(url.searchParams);
    const p = url.pathname;
    const data = q.data || q.dataOcorrenciaFatoGerador || new Date().toISOString().slice(0, 10);
    const body = typeof corpo === "string" ? JSON.parse(corpo) : corpo;

    if (p === "/regime-geral" || p === "/observabilidade/regime-geral") {
      const r = motor.calcular(body, { observabilidade: p.startsWith("/observabilidade") });
      return resp(r.status, r.corpo, r.aviso);
    }
    if (p === "/base-calculo/base-calculo-unificada") { const r = motor.calcularBaseUnificada(body); return resp(r.status, r.corpo); }
    if (p.startsWith("/xml/")) return nao("A geração e validação de XML");
    if (p.startsWith("/nfse/") || p === "/pedagio" || p.startsWith("/base-calculo/")) return nao("Esta função");

    const D = "/dados-abertos";
    if (p === D + "/versao") return resp(200, { versaoApp: "motor web", versaoDb: R.versaoDb.VRBD_VERSAO_BASE_DADO, dataVersaoDb: R.versaoDb.VRBD_DATA.slice(0, 10), descricaoVersaoDb: R.versaoDb.VRBD_DESCRICAO });
    if (p === D + "/ufs") return resp(200, R.ufs);
    if (p === D + "/ufs/municipios") {
      const uf = R.ufs.find((u) => u.sigla === q.siglaUf);
      return resp(200, uf ? MUN.filter((m) => m[1] === uf.codigo).map(([codigo, , nome]) => ({ codigo, nome })) : []);
    }
    if (p === D + "/dfe/grupos") {
      const tipos = R.tiposDfe.filter((t) => vig(t, data) && t.tratado).map((t) => ({ modelo: String(t.modelo), titulo: t.descricao }));
      return resp(200, [{ titulo: "Documentos com tratamento na calculadora", tipos }]);
    }
    if (p === D + "/situacoes-tributarias/cbs-ibs") return resp(200, motor.arvoreCst(data));
    let m;
    if ((m = p.match(/^\/dados-abertos\/classificacoes-tributarias\/cbs-ibs\/class-trib\/(\d+)$/))) {
      const d = motor.detalheClassificacao(m[1], data);
      return d ? resp(200, d) : naoAchou(`Classificação tributária ${m[1]} não encontrada em ${data}`);
    }
    if (p === D + "/ncm") {
      const n = NCM.find((x) => x[0] === q.ncm && vig(x, data));
      if (!n) return naoAchou(`NCM ${q.ncm} não encontrada em ${data}`);
      const pais = NCM.filter((x) => q.ncm.startsWith(x[0]) && x[0] !== q.ncm && vig(x, data)).map((x) => `${x[0]} – ${x[1]}`);
      return resp(200, { ncm: n[0], descricao: n[1], hierarquia: pais, sujeitoImpostoSeletivo: R.isNcm.includes(q.ncm) });
    }
    if (p === D + "/nbs") {
      const n = R.nbs.find((x) => x.cd === q.nbs && vig(x, data));
      return n ? resp(200, { nbs: n.cd, descricao: n.descricao }) : naoAchou(`NBS ${q.nbs} não encontrada em ${data}`);
    }
    if (p === D + "/classificacoes-tributarias/ncm-aplicavel") return resp(200, { ncm: q.ncm, cClassTrib: q.cClassTrib, dataOcorrenciaFatoGerador: data, ...motor.ncmAplicavel(q.ncm, q.cClassTrib, data) });
    if (p === D + "/classificacoes-tributarias/nbs-aplicavel") return resp(200, { nbs: q.nbs, cClassTrib: q.cClassTrib, dataOcorrenciaFatoGerador: data, ...motor.nbsAplicavel(q.nbs, q.cClassTrib, data) });
    if (p === D + "/classificacoes-tributarias/nbs") {
      const lista = motor.arvoreCst(data).flatMap((s) => s.classificacoesTributarias.map((c) => c.codigo)).filter((cd) => { const d = motor.detalheClassificacao(cd, data); return d && /NBS/.test(d.nomenclatura) && motor.nbsAplicavel(q.nbs, cd, data).valido; });
      return resp(200, lista);
    }
    const ref = motor.aliquotasReferencia(data);
    const aliq = (v) => (v == null ? resp(404, { title: "Alíquota não encontrada", detail: `Não há alíquota de referência cadastrada para ${data}` }) : resp(200, { aliquotaReferencia: Number(v) }));
    if (p === D + "/aliquota-uniao") return aliq(ref.cbs);
    if (p === D + "/aliquota-uf") return aliq(ref.ibsUF);
    if (p === D + "/aliquota-municipio") return aliq(ref.ibsMun);
    if (p === D + "/fundamentacoes-legais") {
      const lista = motor.arvoreCst(data).flatMap((s) => s.classificacoesTributarias.map((c) => { const d = motor.detalheClassificacao(c.codigo, data); return { cClassTrib: c.codigo, descricao: c.descricao, fundamentacao: d && d.fundamentacao }; }));
      return resp(200, lista);
    }
    if (p === D + "/redutores-compra-governamental") return resp(200, R.redutorCompraGov.map((r) => ({ valor: r.v, inicioVigencia: r.ini, fimVigencia: r.fim })));
    if (p === "/observabilidade/erros") return nao("A descrição detalhada de códigos de erro");
    return nao("Esta consulta");
  };
})();
