// Compara o motor do Simples Nacional (web-estatica/motor-simples.js) com a API oficial
// (calculadora-rtc-simples-nacional, POST /calculadora/observabilidade/simples-nacional/nao-assistido).
// Uso: NODE_PATH=<pasta com decimal.js> node web-estatica/testes/comparar_simples_com_api.js [URL base]
// Exemplo de URL base: http://localhost:8082/api/calculadora
"use strict";
const fs = require("fs");
const path = require("path");
const API = (process.argv[2] || "http://localhost:8082/api/calculadora") + "/observabilidade/simples-nacional/nao-assistido";
const RAIZ = path.resolve(__dirname, "..", "..");
const R = JSON.parse(fs.readFileSync(path.join(RAIZ, "web-estatica", "dados", "regras.json"), "utf8"));
const NCM = JSON.parse(fs.readFileSync(path.join(RAIZ, "web-estatica", "dados", "ncm.json"), "utf8"));
const motor = require(path.join(RAIZ, "web-estatica", "motor-simples.js")).criar(R, NCM);

async function api(corpo) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json() };
}
// ignora só o que depende do servidor (URL base no "type", timestamp e instance)
function canon(r) {
  const c = JSON.parse(JSON.stringify(r.corpo));
  const limpa = (e) => { delete e.type; };
  delete c.timestamp; delete c.instance; delete c.type;
  (c.errors || []).forEach(limpa);
  (c.objetos || []).forEach((o) => (o.erros || []).forEach(limpa));
  return { status: r.status, corpo: c };
}
function diff(a, b, p = "") {
  if (typeof a !== typeof b || (a === null) !== (b === null)) return [`${p}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
  if (a && typeof a === "object") return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => diff(a[k], b[k], p + "." + k));
  return a === b ? [] : [`${p}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
}

const LINHA = {
  fatorR: true, impedimentoSublimite: false,
  anexoI: { pCBSSN: "1.16125", pIBSSN: "0.012955" }, anexoII: { pCBSSN: "1.3", pIBSSN: "0.02" },
  anexoIII: { pCBSSN: "2.387449", pIBSSN: "0.0263", semRedistribuicaoISS: { pCBSSN: "2.3591", pIBSSN: "0.026" } },
  anexoIV: { pCBSSN: "3.5", pIBSSN: "0.04", semRedistribuicaoISS: { pCBSSN: "3.41", pIBSSN: "0.039" } },
  anexoV: { pCBSSN: "4.25555", pIBSSN: "0.0555" },
};
const clone = (o) => JSON.parse(JSON.stringify(o));
function casos() {
  const L = [];
  const op = (o) => ({ id: "t", versao: "3.0.0", data: "2027-03-15", ...o });
  const it = (o) => ({ numero: 1, cClassTrib: "000001", baseCalculo: "1234.56", valorImpostoSeletivo: "0.00", ...o });
  // documentos com CRT x regimes x atividades
  const docsCrt = ["55", "65", "57", "67", "63", "93", "62"];
  const regimes = [{ CRT: "1" }, { CRT: "2" }, { CRT: "3", tpRegimeIBSCBS: "2" }, { CRT: "1", tpRegimeIBSCBS: "1" }, { CRT: "4" }, { CRT: "3" }, { CRT: "2", tpRegimeIBSCBS: "2" }];
  const ativs = ["01", "02", "03", "04", "05", "06", "07", "11", "14", "90", "1", "77", null];
  for (const tpDoc of docsCrt) for (const reg of regimes) for (const a of ativs) {
    L.push({ nome: `doc ${tpDoc} ${JSON.stringify(reg)} ativ ${a}`, op: op({ tpDoc, ...reg, aliquotasEfetivas: LINHA, itens: [it({ cAtivSN: a, ncm: tpDoc === "55" || tpDoc === "65" ? "84713012" : undefined })] }) });
  }
  // NFS-e: regime x atividade x campos do ISS
  const ativNfse = ["07", "08", "09", "10", "11", "12", "13", "14", "90", "01"];
  const issCombos = [{}, { tribISSQN: "1" }, { tribISSQN: "1", tpRetISSQN: "1" }, { tribISSQN: "1", tpRetISSQN: "2" }, { tribISSQN: "2", tpRetISSQN: "2" }, { tribISSQN: "3" }, { tribISSQN: "1", tpRetISSQN: "1", tpBM: "1" }, { tribISSQN: "1", tpRetISSQN: "3", tpBM: "1" }, { tribISSQN: "9" }, { tribISSQN: "1", tpRetISSQN: "1", tpBM: "7" }];
  const regNfse = [{ opSimpNac: "3", regApIBSCBSSN: "1", regApTribSN: "1" }, { opSimpNac: "3", regApIBSCBSSN: "2", regApTribSN: "2" }, { opSimpNac: "3", regApIBSCBSSN: "1", regApTribSN: "3" }, { opSimpNac: "4", regApIBSCBSSN: "1", regApTribSN: "1" }, { opSimpNac: "4", regApIBSCBSSN: "2", regApTribSN: "1" }, { opSimpNac: "3", regApIBSCBSSN: "3", regApTribSN: "1" }, { opSimpNac: "1" }, { opSimpNac: "2" }, { opSimpNac: "3" }, { opSimpNac: "1", regApIBSCBSSN: "1" }];
  for (const reg of regNfse) for (const a of ativNfse) for (const iss of issCombos) {
    for (const fatorR of [true, false]) {
      if (a !== "09" && fatorR === false) continue;
      const linha = { ...clone(LINHA), fatorR };
      L.push({ nome: `nfse ${JSON.stringify(reg)} ${a} ${JSON.stringify(iss)} fr=${fatorR}`, op: op({ tpDoc: "91", ...reg, aliquotasEfetivas: linha, itens: [{ numero: 1, cAtivSN: a, cClassTrib: "000001", nbs: "115021000", baseCalculo: "987.65", ...iss }] }) });
    }
  }
  // compra governamental x datas
  for (const data of ["2027-06-01", "2029-06-01", "2031-02-01", "2033-05-01"]) for (const ente of [null, "1", "2", "3", "4", "5"]) for (const [tpDoc, extra, a] of [["55", { CRT: "1" }, "01"], ["91", { opSimpNac: "3", regApIBSCBSSN: "1", regApTribSN: "1" }, "14"], ["55", { CRT: "3", tpRegimeIBSCBS: "2" }, "02"]]) {
    const item = tpDoc === "91" ? { numero: 1, cAtivSN: a, cClassTrib: "000001", baseCalculo: "5000.00", tribISSQN: "1", tpRetISSQN: "1" } : it({ cAtivSN: a, baseCalculo: "5000.00", valorImpostoSeletivo: "12.34" });
    L.push({ nome: `gov ${data} ente ${ente} ${tpDoc}`, op: op({ data, tpDoc, ...extra, tpEnteGov: ente, aliquotasEfetivas: LINHA, itens: [item] }) });
  }
  // classificações tributárias (tpRBSN variados) em NF-e e NFS-e
  const cts = [...new Set(R.classificacoes.map((c) => c.cd))];
  for (const cd of cts) {
    L.push({ nome: `ct ${cd} nfe`, op: op({ tpDoc: "55", CRT: "1", aliquotasEfetivas: LINHA, itens: [it({ cAtivSN: "01", cClassTrib: cd })] }) });
    L.push({ nome: `ct ${cd} nfse`, op: op({ tpDoc: "91", opSimpNac: "3", regApIBSCBSSN: "1", regApTribSN: "1", aliquotasEfetivas: LINHA, itens: [{ numero: 1, cAtivSN: "14", cClassTrib: cd, baseCalculo: "100.00", tribISSQN: "1", tpRetISSQN: "1" }] }) });
  }
  // nomenclatura
  for (const [ncm, nbs, ct] of [["84713012", null, "000001"], ["10063021", null, "200003"], ["02013000", null, "200035"], [null, null, "200003"], ["8471", null, "000001"], ["99999999", null, "000001"], [null, "122011200", "000001"], ["84713012", "122011200", "000001"], ["00", null, "000001"], ["00000000", null, "200003"]])
    for (const tpDoc of ["55", "65", "62"]) L.push({ nome: `nomenclatura ${tpDoc} ${ncm}/${nbs}/${ct}`, op: op({ tpDoc, CRT: "1", aliquotasEfetivas: LINHA, itens: [it({ cAtivSN: "01", cClassTrib: ct, ncm, nbs })] }) });
  // linha de alíquotas incompleta / inválida
  const linhas = [
    null, {}, { fatorR: null, anexoIII: LINHA.anexoIII }, { ...LINHA, anexoI: { pCBSSN: "-1" } }, { ...LINHA, anexoI: { pCBSSN: "abc", pIBSSN: "1e2" } },
    { ...LINHA, anexoI: { pCBSSN: "1.2" } }, { ...LINHA, anexoI: { pIBSSN: "0.5" } }, { ...LINHA, impedimentoSublimite: true },
    { ...LINHA, anexoIII: { pCBSSN: "2.1", pIBSSN: "0.02" } }, { ...LINHA, anexoIV: undefined },
  ];
  for (const [i, ln] of linhas.entries()) for (const [tpDoc, extra, a, iss] of [["55", { CRT: "1" }, "01", {}], ["55", { CRT: "2" }, "01", {}], ["91", { opSimpNac: "3", regApIBSCBSSN: "1", regApTribSN: "1" }, "09", { tribISSQN: "1", tpRetISSQN: "1" }], ["91", { opSimpNac: "3", regApIBSCBSSN: "1", regApTribSN: "1" }, "13", { tribISSQN: "1", tpRetISSQN: "1" }]]) {
    const item = tpDoc === "91" ? { numero: 1, cAtivSN: a, cClassTrib: "000001", baseCalculo: "100.00", ...iss } : it({ cAtivSN: a });
    const o = op({ tpDoc, ...extra, itens: [item] });
    if (ln !== null) o.aliquotasEfetivas = ln;
    L.push({ nome: `linha ${i} ${tpDoc} ${a}`, op: o });
  }
  // valores, erros de item e globais
  const itensErro = [it({ cAtivSN: "01", baseCalculo: "-5" }), it({ cAtivSN: "01", baseCalculo: "1.234" }), it({ cAtivSN: "01", baseCalculo: null }), it({ cAtivSN: "01", valorImpostoSeletivo: "x" }),
    it({ cAtivSN: "01", cClassTrib: null }), it({ cAtivSN: "01", cClassTrib: "620001" }), it({ numero: null, cAtivSN: "01" }), it({ cAtivSN: "01", valorImpostoSeletivo: "15.50" }), it({ cAtivSN: "01", baseCalculo: "0.01" }), it({ cAtivSN: "01", baseCalculo: "9999999999999.99" })];
  L.push({ nome: "itens variados nfe", op: op({ tpDoc: "55", CRT: "1", aliquotasEfetivas: LINHA, itens: itensErro.map((x, i) => ({ ...x, numero: x.numero === null ? null : i + 1 })) }) });
  for (const x of itensErro) L.push({ nome: "item " + JSON.stringify(x).slice(0, 60), op: op({ tpDoc: "55", CRT: "1", aliquotasEfetivas: LINHA, itens: [x] }) });
  L.push({ nome: "nfse com IS", op: op({ tpDoc: "91", opSimpNac: "3", regApIBSCBSSN: "1", regApTribSN: "1", aliquotasEfetivas: LINHA, itens: [{ numero: 1, cAtivSN: "14", cClassTrib: "000001", baseCalculo: "100.00", valorImpostoSeletivo: "3.00", tribISSQN: "1", tpRetISSQN: "1" }] }) });
  L.push({ nome: "nfse 2 itens", op: op({ tpDoc: "91", opSimpNac: "3", regApIBSCBSSN: "1", regApTribSN: "1", aliquotasEfetivas: LINHA, itens: [{ numero: 1, cAtivSN: "14", cClassTrib: "000001", baseCalculo: "1" }, { numero: 2, cAtivSN: "14", cClassTrib: "000001", baseCalculo: "1" }] }) });
  for (const g of [{ id: null }, { versao: "" }, { data: "2027-02-30" }, { data: null }, { tpDoc: null }, { tpDoc: "99" }, { tpDoc: "77" }, { tpDoc: "abc" }, { tpEnteGov: "9" }, { CRT: "7" }, { CRT: "1", tpRegimeIBSCBS: "2" }, { CRT: "4", tpRegimeIBSCBS: "1" }, { CRT: "3", tpRegimeIBSCBS: "1" }, { CRT: "1", tpRegimeIBSCBS: "5" }, { CRT: "1", opSimpNac: "3" }, { data: "2026-06-01" }, { itens: [] }])
    L.push({ nome: "global " + JSON.stringify(g), op: { ...op({ tpDoc: "55", CRT: "1", aliquotasEfetivas: LINHA, itens: [it({ cAtivSN: "01" })] }), ...g } });
  for (const g of [{ opSimpNac: "3" }, { opSimpNac: "9" }, { opSimpNac: "2", regApIBSCBSSN: "1" }, { opSimpNac: "3", regApIBSCBSSN: "5", regApTribSN: "1" }, { CRT: "1", opSimpNac: "3", regApIBSCBSSN: "1", regApTribSN: "1" }])
    L.push({ nome: "global nfse " + JSON.stringify(g), op: op({ tpDoc: "91", ...g, aliquotasEfetivas: LINHA, itens: [{ numero: 1, cAtivSN: "14", cClassTrib: "000001", baseCalculo: "100.00", tribISSQN: "1", tpRetISSQN: "1" }] }) });
  // vários itens com arredondamento
  const bases = ["0.01", "0.05", "1.01", "33.33", "100.005".slice(0, 6), "2499.99", "123456.78", "7.77"];
  L.push({ nome: "multi arred", op: op({ tpDoc: "55", CRT: "1", tpEnteGov: "2", data: "2030-01-10", aliquotasEfetivas: LINHA, itens: bases.map((b, i) => it({ numero: i + 1, cAtivSN: ["01", "02", "03", "04"][i % 4], baseCalculo: b, valorImpostoSeletivo: (i * 1.11).toFixed(2) })) }) });
  return L;
}

(async () => {
  const lista = casos();
  let ok = 0;
  const falhas = [];
  for (const c of lista) {
    const oficial = canon(await api(c.op));
    const local = canon(motor.calcular(clone(c.op)));
    const d = diff(oficial, local);
    if (d.length) falhas.push({ nome: c.nome, d: d.slice(0, 6) }); else ok++;
  }
  console.log(`Simples Nacional: ${ok}/${lista.length} idênticos à API oficial`);
  for (const f of falhas.slice(0, 20)) console.log("✗", f.nome, "\n   " + f.d.join("\n   "));
  fs.writeFileSync(path.join(__dirname, "resultado-simples.json"), JSON.stringify({ data: new Date().toISOString(), casos: lista.length, identicos: ok, falhas }, null, 2));
  process.exit(falhas.length ? 1 : 0);
})();
