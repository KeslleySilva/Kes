// Compara o motor JavaScript (web-estatica/motor.js) com a API oficial da Receita.
// Uso: NODE_PATH=<pasta com decimal.js> node web-estatica/testes/comparar_com_api.js [URL da API]
// Exemplo de URL: http://localhost:8080/api/calculadora
"use strict";
const fs = require("fs");
const path = require("path");
const API = process.argv[2] || "http://localhost:8080/api/calculadora";
const RAIZ = path.resolve(__dirname, "..", "..");
const Motor = require(path.join(RAIZ, "web-estatica", "motor.js"));
const R = JSON.parse(fs.readFileSync(path.join(RAIZ, "web-estatica", "dados", "regras.json"), "utf8"));
const NCM = JSON.parse(fs.readFileSync(path.join(RAIZ, "web-estatica", "dados", "ncm.json"), "utf8"));
const MUN = JSON.parse(fs.readFileSync(path.join(RAIZ, "web-estatica", "dados", "municipios.json"), "utf8"));
const motor = Motor.criar(R, NCM, MUN);

async function api(caminho, corpo) {
  const r = await fetch(API + caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const t = await r.text();
  let c; try { c = JSON.parse(t); } catch { c = t; }
  return { status: r.status, aviso: r.headers.get("x-warning-dados-simulados"), corpo: c };
}

// remove campos que não fazem parte do cálculo (timestamp, instance, type, detail de 422)
function canon(r, obs) {
  if (r.status !== 200) return { status: r.status, title: r.corpo.title };
  const c = JSON.parse(JSON.stringify(r.corpo));
  for (const o of c.objetos || []) if (o.erros) o.erros = o.erros.map((e) => e.code);
  return { status: 200, aviso: r.aviso || null, corpo: c };
}
function diff(a, b, p = "") {
  if (typeof a !== typeof b || (a === null) !== (b === null)) return [`${p}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
  if (a && typeof a === "object") {
    const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...ks].flatMap((k) => diff(a[k], b[k], p + "." + k));
  }
  return a === b ? [] : [`${p}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
}

function casos() {
  const lista = [];
  const cen = JSON.parse(fs.readFileSync(path.join(RAIZ, "cenarios", "cenarios.json"), "utf8"));
  for (const c of cen) if (c.caminho.endsWith("regime-geral")) lista.push({ nome: c.id, obs: c.caminho.startsWith("/observabilidade"), op: c.corpo });
  const an = { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 };
  const bases = [1234.56, 0.07, 999999.99, 17.35];
  for (const data of ["2026-06-10", "2027-03-10"]) {
    for (const s of motor.arvoreCst(data)) for (const ct of s.classificacoesTributarias) {
      const base = bases[lista.length % bases.length];
      const item = { numero: 1, cst: s.codigo, cClassTrib: ct.codigo, baseCalculo: base, quantidade: 3, unidade: "UN" };
      if (data >= "2027") item.aliquotasNominais = { ...an };
      const op = { id: "t", versao: "1", dhFatoGerador: data + "T10:00:00-03:00", municipio: 3550308, uf: "SP", itens: [item] };
      lista.push({ nome: `${data} ${ct.codigo}`, obs: true, op });
      if (s.codigo === "550" || s.codigo === "000" || s.codigo === "200" || s.codigo === "515") {
        const it2 = JSON.parse(JSON.stringify(item));
        if (s.codigo === "550") it2.tributacaoRegular = { cst: "200", cClassTrib: "200043" };
        for (const ente of [1, 2, 4, 5]) lista.push({ nome: `${data} ${ct.codigo} gov${ente}`, obs: true, op: { ...op, gCompraGov: { tpEnteGov: ente, tpOperGov: 1 }, itens: [it2] } });
        if (s.codigo === "550") lista.push({ nome: `${data} ${ct.codigo} regular`, obs: true, op: { ...op, itens: [it2] } });
      }
    }
  }
  // arredondamento: bases variadas e alíquotas com muitas casas
  const seeds = [0.01, 0.05, 0.15, 0.25, 1.005, 2.675, 3.3333, 10.125, 123.455, 99999.995];
  for (const b of seeds) for (const ct of [["000", "000001"], ["200", "200028"], ["200", "200014"], ["515", "515001"]]) {
    lista.push({ nome: `2027 arred ${ct[1]} ${b}`, obs: true, op: { id: "t", versao: "1", dhFatoGerador: "2027-05-01T10:00:00-03:00", municipio: 4314902, uf: "RS",
      itens: [{ numero: 1, cst: ct[0], cClassTrib: ct[1], baseCalculo: b, aliquotasNominais: { cbs: 8.7654, ibsEstadual: 0.0567, ibsMunicipal: 0.0433 } }] } });
  }
  // Imposto Seletivo
  for (const [bc, av, ar, q, inf] of [[150, 10, null, 12, null], [99.99, 25, 0.35, 7, null], [100, null, 1.2, 3, null], [150, 10, null, 12, 15]]) {
    const is = { cst: "000", cClassTrib: "000001", baseCalculo: bc, quantidade: q, unidade: "LT" };
    if (inf != null) is.impostoInformado = inf;
    lista.push({ nome: `IS ${bc}/${av}/${ar}/${inf}`, obs: true, op: { id: "t", versao: "1", dhFatoGerador: "2027-05-01T10:00:00-03:00", municipio: 4314902, uf: "RS",
      itens: [{ numero: 1, ncm: "22030000", cst: "000", cClassTrib: "000001", quantidade: q, unidade: "LT", impostoSeletivo: is,
        aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05, impostoSeletivo: { adValorem: av, adRem: ar } } }] } });
  }
  // componentes de base e tpDoc
  for (const [ano, tp] of [["2026", 55], ["2027", 65], ["2027", 55]]) {
    const it = { numero: 1, ncm: "84713012", cst: "000", cClassTrib: "000001", gComponentesBC: { vProd: 1000, vFrete: 50, vSeg: 20, vDesc: 50, vICMS: 180, vPIS: 9.25, vCOFINS: 46.25 } };
    if (ano === "2027") it.aliquotasNominais = an;
    lista.push({ nome: `componentes ${ano} ${tp}`, obs: true, op: { id: "t", versao: "1", dhFatoGerador: ano + "-05-01T10:00:00-03:00", municipio: 3550308, uf: "SP", tpDoc: tp, itens: [it] } });
  }
  // erros de entrada
  const err = [
    { cst: "000", cClassTrib: "000001" }, // sem base
    { cst: "999", cClassTrib: "000001", baseCalculo: 10 },
    { cst: "000", cClassTrib: "123456", baseCalculo: 10 },
    { ncm: "99999999", cst: "000", cClassTrib: "000001", baseCalculo: 10 },
    { ncm: "84713012", nbs: "122011200", cst: "000", cClassTrib: "000001", baseCalculo: 10 },
    { ncm: "84713012", cst: "200", cClassTrib: "000001", baseCalculo: 10 },
    { ncm: "84713012", cst: "200", cClassTrib: "200003", baseCalculo: 10 },
    { cst: "200", cClassTrib: "200003", baseCalculo: 10 },
    { cst: "550", cClassTrib: "550001", baseCalculo: 10 },
  ];
  for (const [i, e] of err.entries()) for (const data of ["2026-06-10", "2027-03-10"]) {
    const it = { numero: 1, ...e };
    if (data >= "2027") it.aliquotasNominais = an;
    lista.push({ nome: `erro ${i} ${data}`, obs: i % 2 === 0, op: { id: "t", versao: "1", dhFatoGerador: data + "T10:00:00-03:00", municipio: 3550308, uf: "SP", itens: [it] } });
  }
  lista.push({ nome: "2026 com alíquota", obs: true, op: { id: "t", versao: "1", dhFatoGerador: "2026-03-10T10:00:00-03:00", municipio: 3550308, uf: "SP", itens: [{ numero: 1, cst: "000", cClassTrib: "000001", baseCalculo: 10, aliquotasNominais: an }] } });
  lista.push({ nome: "2027 sem alíquota", obs: true, op: { id: "t", versao: "1", dhFatoGerador: "2027-03-10T10:00:00-03:00", municipio: 3550308, uf: "SP", itens: [{ numero: 1, cst: "000", cClassTrib: "000001", baseCalculo: 10 }] } });
  lista.push({ nome: "tpDoc NFS-e x 200003", obs: true, op: { id: "t", versao: "1", dhFatoGerador: "2026-03-10T10:00:00-03:00", municipio: 3550308, uf: "SP", tpDoc: 91, itens: [{ numero: 1, ncm: "10063021", cst: "200", cClassTrib: "200003", baseCalculo: 10 }] } });
  return lista;
}

(async () => {
  const lista = casos();
  let ok = 0;
  const falhas = [];
  for (const c of lista) {
    const rota = c.obs ? "/observabilidade/regime-geral" : "/regime-geral";
    const oficial = canon(await api(rota, c.op));
    const local = canon(motor.calcular(JSON.parse(JSON.stringify(c.op)), { observabilidade: c.obs }));
    const d = diff(oficial, local);
    if (d.length) falhas.push({ nome: c.nome, d: d.slice(0, 6) });
    else ok++;
  }
  // base unificada
  const bases = [
    { anoFatoGerador: 2026, tipoDocumento: 55, natureza: "bem", vProd: 1000, vFrete: 50, vSeg: 20, vOutro: 10, vDesc: 50, vIS: 30, vPIS: 9.25, vCOFINS: 46.25, vICMS: 180, vFCP: 10 },
    { anoFatoGerador: 2027, tipoDocumento: 55, natureza: "bem", vProd: 1000, vFrete: 50, vSeg: 20, vOutro: 10, vDesc: 50, vIS: 30, vPIS: 9.25, vCOFINS: 46.25, vICMS: 180, vFCP: 10 },
    { anoFatoGerador: 2033, tipoDocumento: 65, natureza: "servico", vProd: 500.555, vISSQN: 25, vII: 10, vICMSUFDest: 3 },
  ];
  let okB = 0;
  for (const b of bases) {
    const o = await api("/base-calculo/base-calculo-unificada", b);
    const l = motor.calcularBaseUnificada(b);
    const n = (x) => ({ baseRG: x.baseRG, baseIS: x.baseIS, baseSN: x.baseSN, avisos: [...(x.avisos || [])].sort() });
    const d = diff(n(o.corpo), n(l.corpo));
    if (d.length) falhas.push({ nome: "base " + b.anoFatoGerador, d }); else okB++;
  }
  console.log(`Cálculo: ${ok}/${lista.length} idênticos à API oficial · Base unificada: ${okB}/${bases.length}`);
  for (const f of falhas.slice(0, 25)) console.log("✗", f.nome, "\n   " + f.d.join("\n   "));
  fs.writeFileSync(path.join(__dirname, "resultado.json"), JSON.stringify({ data: new Date().toISOString(), api: API, casos: lista.length + bases.length, identicos: ok + okB, falhas }, null, 2));
  process.exit(falhas.length ? 1 : 0);
})();
