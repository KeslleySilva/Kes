// Calculadora RTC – interface para a API oficial da Receita Federal
// (calculadora-rtc-regime-regular). Todas as chamadas passam pelo servidor
// local em /api/calculadora, que repassa para a API oficial.
"use strict";

const API = "/api/calculadora";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const brl = (v) => (v === undefined || v === null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const pct = (v) => (v === undefined || v === null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 }) + "%");

const LOCAL = !!window.RTC_API_LOCAL; // versão web estática: calcula no navegador (web-estatica/)
async function api(metodo, caminho, corpo, tipo = "application/json") {
  if (LOCAL) return window.RTC_API_LOCAL(metodo, caminho, corpo);
  const op = { method: metodo, headers: { Accept: "application/json, application/xml, text/plain" } };
  if (corpo !== undefined) {
    op.headers["Content-Type"] = tipo;
    op.body = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  }
  const r = await fetch(API + caminho, op);
  const texto = await r.text();
  let dados = texto;
  try { dados = JSON.parse(texto); } catch (_) { /* XML ou texto */ }
  return { status: r.status, ok: r.ok, aviso: r.headers.get("x-warning-dados-simulados"), dados, texto };
}
const qs = (o) => "?" + new URLSearchParams(Object.entries(o).filter(([, v]) => v !== "" && v != null)).toString();

/* ---------------- abas ---------------- */
$$(".aba").forEach((b) => b.addEventListener("click", () => abrirAba(b.dataset.aba)));
function abrirAba(id) {
  $$(".aba").forEach((x) => x.classList.toggle("ativa", x.dataset.aba === id));
  $$(".painel").forEach((p) => p.classList.toggle("ativo", p.id === "aba-" + id));
}

/* ---------------- dados de apoio ---------------- */
const cache = {};
async function arvoreCst(data) {
  if (!cache["cst" + data]) {
    const r = await api("GET", "/dados-abertos/situacoes-tributarias/cbs-ibs" + qs({ data }));
    cache["cst" + data] = r.ok ? r.dados : [];
  }
  return cache["cst" + data];
}
async function detalheCt(ct, data) {
  const k = "ct" + ct + data;
  if (!cache[k]) {
    const r = await api("GET", `/dados-abertos/classificacoes-tributarias/cbs-ibs/class-trib/${ct}` + qs({ data }));
    cache[k] = r.ok ? r.dados : null;
  }
  return cache[k];
}
const dataOp = () => $("#op-data").value || "2026-06-10";
const anoOp = () => Number(dataOp().slice(0, 4));

async function iniciar() {
  const v = await api("GET", "/dados-abertos/versao").catch(() => null);
  $("#versao").innerHTML = v && v.ok
    ? (LOCAL ? `Cálculo no navegador · regras oficiais ${esc(v.dados.versaoDb)} (${esc(v.dados.dataVersaoDb)})`
             : `API oficial v${esc(v.dados.versaoApp)} · base ${esc(v.dados.versaoDb)} (${esc(v.dados.dataVersaoDb)})`)
    : `<span style="color:var(--erro)">API oficial indisponível — inicie com scripts/instalar_api_oficial.sh</span>`;

  const ufs = await api("GET", "/dados-abertos/ufs");
  if (ufs.ok) $("#op-uf").innerHTML = ufs.dados.map((u) => `<option value="${u.sigla}" data-cod="${u.codigo}">${u.sigla} – ${esc(u.nome)}</option>`).join("");
  $("#op-uf").value = "SP";
  await carregarMunicipios("3550308");

  const dfe = await api("GET", "/dados-abertos/dfe/grupos" + qs({ data: dataOp() }));
  if (dfe.ok) $("#op-tpdoc").innerHTML += dfe.dados.map((g) => `<optgroup label="${esc(g.titulo)}">` +
    g.tipos.map((t) => `<option value="${t.modelo}">${t.modelo} – ${esc(t.titulo)}</option>`).join("") + "</optgroup>").join("");

  atualizarAno();
  await adicionarItem({ ncm: "84713012", cst: "000", cClassTrib: "000001", baseCalculo: 1000, quantidade: 1, unidade: "UN" });
  montarBase();
  carregarCenarios();
}

async function carregarMunicipios(selecionar) {
  const r = await api("GET", "/dados-abertos/ufs/municipios" + qs({ siglaUf: $("#op-uf").value }));
  $("#op-mun").innerHTML = r.ok ? r.dados.map((m) => `<option value="${m.codigo}">${esc(m.nome)} (${m.codigo})</option>`).join("") : "";
  if (selecionar) $("#op-mun").value = String(selecionar);
}
$("#op-uf").addEventListener("change", () => carregarMunicipios());
$("#op-ente").addEventListener("change", (e) => { $("#lbl-operGov").hidden = !e.target.value; });
$("#op-data").addEventListener("change", async () => {
  atualizarAno();
  for (const el of $$(".item")) await preencherCst(el, $(".i-cst", el).value, $(".i-ct", el).value);
});
function atualizarAno() {
  const ano = anoOp();
  $$(".aliq").forEach((a) => (a.hidden = ano < 2027));
  $("#nota-ano").textContent = ano < 2027
    ? `${ano} é ano-teste: a calculadora usa as alíquotas de referência cadastradas (CBS 0,9% e IBS 0,1%). Não informe alíquotas nominais.`
    : `A partir de 2027 as alíquotas nominais são obrigatórias em cada item; o resultado sai como cálculo simulado. Os valores sugeridos (CBS 8,8%, IBS 0,05% + 0,05%) são apenas exemplo; ajuste-os.`;
}

/* ---------------- itens ---------------- */
let nItem = 0;
$("#add-item").addEventListener("click", () => adicionarItem({}));
async function adicionarItem(d) {
  const el = $("#tpl-item").content.firstElementChild.cloneNode(true);
  el.dataset.num = ++nItem;
  $("#itens").append(el);
  renumerar();
  $(".rem", el).addEventListener("click", () => { el.remove(); renumerar(); });
  $(".i-tipo", el).addEventListener("change", (e) => { $(".i-codlbl", el).textContent = e.target.value.toUpperCase(); });
  $(".i-cst", el).addEventListener("change", () => preencherCst(el, $(".i-cst", el).value));
  $(".i-ct", el).addEventListener("change", () => mostrarCt(el));

  if (d.nbs) { $(".i-tipo", el).value = "nbs"; $(".i-codlbl", el).textContent = "NBS"; }
  $(".i-cod", el).value = d.ncm || d.nbs || "";
  if (d.baseCalculo !== undefined) $(".i-bc", el).value = d.baseCalculo;
  else if (d.impostoSeletivo || d.gComponentesBC) $(".i-bc", el).value = "";
  if (d.quantidade !== undefined) $(".i-qtd", el).value = d.quantidade;
  if (d.unidade) $(".i-un", el).value = d.unidade;
  const an = d.aliquotasNominais;
  if (an) { $(".i-acbs", el).value = an.cbs ?? ""; $(".i-aibsuf", el).value = an.ibsEstadual ?? ""; $(".i-aibsmun", el).value = an.ibsMunicipal ?? ""; }
  if (d.impostoSeletivo) {
    const is = d.impostoSeletivo; $(".i-is", el).checked = true; el.querySelector("details").open = true;
    $(".i-iscst", el).value = is.cst; $(".i-isct", el).value = is.cClassTrib; $(".i-isbc", el).value = is.baseCalculo;
    $(".i-isav", el).value = an?.impostoSeletivo?.adValorem ?? ""; $(".i-isar", el).value = an?.impostoSeletivo?.adRem ?? "";
  }
  if (d.tributacaoRegular) {
    $(".i-trcst", el).value = d.tributacaoRegular.cst; $(".i-trct", el).value = d.tributacaoRegular.cClassTrib;
    el.querySelectorAll("details")[1].open = true;
  }
  if (d.gComponentesBC) el.dataset.comp = JSON.stringify(d.gComponentesBC);
  atualizarAno();
  await preencherCst(el, d.cst || "000", d.cClassTrib || "000001");
}
function renumerar() { $$(".item").forEach((el, i) => ($(".item-num", el).textContent = "Item " + (i + 1))); }

async function preencherCst(el, cst, ct) {
  const arv = await arvoreCst(dataOp());
  $(".i-cst", el).innerHTML = arv.map((c) => `<option value="${c.codigo}">${c.codigo} – ${esc(c.descricao)}</option>`).join("");
  if (cst) $(".i-cst", el).value = cst;
  const atual = arv.find((c) => c.codigo === $(".i-cst", el).value);
  $(".i-ct", el).innerHTML = (atual?.classificacoesTributarias || [])
    .map((c) => `<option value="${c.codigo}">${c.codigo} – ${esc(c.descricao.slice(0, 90))}</option>`).join("");
  if (ct) $(".i-ct", el).value = ct;
  mostrarCt(el);
}
async function mostrarCt(el) {
  const ct = $(".i-ct", el).value;
  if (!ct) { $(".ct-desc", el).textContent = ""; return; }
  const d = await detalheCt(ct, dataOp());
  if (!d) { $(".ct-desc", el).textContent = ""; return; }
  const red = d.possuiPercentualReducao ? ` · redução CBS ${pct(d.percentualReducaoCbs)}, IBS UF ${pct(d.percentualReducaoIbsUf)}, IBS Mun ${pct(d.percentualReducaoIbsMun)}` : "";
  $(".ct-desc", el).textContent = `${d.descricaoTratamentoTributario} · alíquota ${d.tipoAliquota} · exige ${d.nomenclatura}${red}` +
    (d.exigeGrupoDesoneracao ? " · exige grupo de tributação regular" : "");
}

const num = (v) => (v === "" || v == null ? undefined : Number(v));
function montarOperacao() {
  const ano = anoOp();
  const op = {
    id: "calc-" + Date.now(), versao: "1.0.0", dhFatoGerador: dataOp() + "T10:00:00-03:00",
    municipio: Number($("#op-mun").value), uf: $("#op-uf").value,
  };
  if ($("#op-tpdoc").value) op.tpDoc = Number($("#op-tpdoc").value);
  if ($("#op-ente").value) op.gCompraGov = { tpEnteGov: Number($("#op-ente").value), tpOperGov: Number($("#op-operGov").value) };
  op.itens = $$(".item").map((el, i) => {
    const it = { numero: i + 1, cst: $(".i-cst", el).value, cClassTrib: $(".i-ct", el).value };
    const cod = $(".i-cod", el).value.trim();
    if (cod) it[$(".i-tipo", el).value] = cod;
    const bc = num($(".i-bc", el).value); if (bc !== undefined) it.baseCalculo = bc;
    const q = num($(".i-qtd", el).value); if (q !== undefined) it.quantidade = q;
    if ($(".i-un", el).value) it.unidade = $(".i-un", el).value;
    if (el.dataset.comp) it.gComponentesBC = JSON.parse(el.dataset.comp);
    if ($(".i-is", el).checked) {
      it.impostoSeletivo = { cst: $(".i-iscst", el).value, cClassTrib: $(".i-isct", el).value, baseCalculo: num($(".i-isbc", el).value), quantidade: q, unidade: it.unidade };
    }
    if ($(".i-trcst", el).value) it.tributacaoRegular = { cst: $(".i-trcst", el).value, cClassTrib: $(".i-trct", el).value };
    if (ano >= 2027) {
      it.aliquotasNominais = { cbs: num($(".i-acbs", el).value), ibsEstadual: num($(".i-aibsuf", el).value), ibsMunicipal: num($(".i-aibsmun", el).value) };
      if (it.impostoSeletivo) it.aliquotasNominais.impostoSeletivo = { adValorem: num($(".i-isav", el).value), adRem: num($(".i-isar", el).value) };
    }
    return it;
  });
  return op;
}

async function carregarOperacao(op) {
  const data = (op.dhFatoGerador || op.dataHoraEmissao || "").slice(0, 10);
  if (data) $("#op-data").value = data;
  $("#op-uf").value = op.uf; await carregarMunicipios(op.municipio);
  $("#op-tpdoc").value = op.tpDoc ? String(op.tpDoc) : "";
  $("#op-ente").value = op.gCompraGov ? String(op.gCompraGov.tpEnteGov) : "";
  $("#lbl-operGov").hidden = !op.gCompraGov;
  if (op.gCompraGov) $("#op-operGov").value = String(op.gCompraGov.tpOperGov);
  $("#itens").innerHTML = ""; nItem = 0;
  for (const it of op.itens) await adicionarItem(it);
  atualizarAno();
  $("#resultado").innerHTML = "";
  abrirAba("calc");
}

/* ---------------- cálculo ---------------- */
$("#calcular").addEventListener("click", calcular);
async function calcular() {
  const op = montarOperacao();
  const obs = $("#modo-obs").checked;
  $("#resultado").innerHTML = `<div class="cartao">Calculando…</div>`;
  const r = await api("POST", obs ? "/observabilidade/regime-geral" : "/regime-geral", op);
  $("#resultado").innerHTML = renderResultado(r, op);
  ligarXml(op);
}

function erroHtml(d) {
  if (!d || typeof d !== "object") return `<div class="msg er">${esc(d)}</div>`;
  const lista = d.erros || d.errors || [];
  return `<div class="msg er"><b>${esc(d.title || "Erro")}</b> — ${esc(d.detail || "")}` +
    (lista.length ? "<ul>" + lista.map((e) => `<li>${esc(e.code || "")} ${esc(e.title || "")}: ${esc(e.detail || e.message || "")} ${e.pointer ? "(" + esc(e.pointer) + ")" : ""}</li>`).join("") + "</ul>" : "") + "</div>";
}
const seloEstado = (e) => {
  if (!e) return "";
  const cls = e === "CALCULADO" ? "ok" : e === "CALCULO_SIMULADO" ? "av" : "er";
  const nomes = { CALCULADO: "calculado", CALCULO_SIMULADO: "cálculo simulado", INCONSISTENCIA_ENTRADA: "inconsistência de entrada", NAO_IMPLEMENTADO: "não implementado", FALHA_TECNICA: "falha técnica" };
  return `<span class="selo ${cls}">${esc(nomes[e] || e)}</span>`;
};

function renderResultado(r, op) {
  if (!r.ok) return `<div class="cartao"><h2>Resultado (HTTP ${r.status})</h2>${erroHtml(r.dados)}${rawHtml(op, r.dados)}</div>`;
  const d = r.dados;
  const tot = d.total?.tribCalc || {};
  const t = tot.IBSCBSTot || {};
  const vIS = Number(tot.ISTot?.vIS || 0);
  const vCBS = Number(t.gCBS?.vCBS || 0), vIBS = Number(t.gIBS?.vIBS || 0);
  const mono = t.gMono || {};
  const vMono = Number(mono.vIBSMono || 0) + Number(mono.vCBSMono || 0);
  let h = `<div class="cartao"><h2>Resultado</h2>`;
  if (r.aviso) h += `<div class="msg av">Cálculo simulado: as alíquotas foram informadas por você (header x-warning-dados-simulados = ${esc(r.aviso)}).</div>`;
  if (d.oper?.gCompraGov) h += `<div class="msg av">Compra governamental: redutor ${pct(d.oper.gCompraGov.pRedutor)} (ente ${esc(d.oper.gCompraGov.tpEnteGov)}).</div>`;
  h += `<div class="kpis">
    <div class="kpi"><div class="r">Base CBS/IBS</div><div class="v">${brl(t.vBCIBSCBS)}</div></div>
    <div class="kpi"><div class="r">CBS</div><div class="v">${brl(vCBS)}</div></div>
    <div class="kpi"><div class="r">IBS (UF + Mun.)</div><div class="v">${brl(vIBS)}</div></div>
    <div class="kpi"><div class="r">IBS UF / IBS Mun.</div><div class="v" style="font-size:15px">${brl(t.gIBS?.gIBSUF?.vIBSUF)} / ${brl(t.gIBS?.gIBSMun?.vIBSMun)}</div></div>
    <div class="kpi"><div class="r">Imposto Seletivo</div><div class="v">${brl(vIS)}</div></div>
    <div class="kpi"><div class="r">Total de tributos</div><div class="v">${brl(vCBS + vIBS + vIS + vMono)}</div></div>
  </div>`;
  const dif = Number(t.gCBS?.vDif || 0) + Number(t.gIBS?.gIBSUF?.vDif || 0) + Number(t.gIBS?.gIBSMun?.vDif || 0);
  const credp = Number(t.gCBS?.vCredPres || 0) + Number(t.gIBS?.vCredPres || 0);
  if (dif || credp) h += `<p class="nota">Diferido: ${brl(dif)} · Crédito presumido: ${brl(credp)}</p>`;

  h += `<div class="tabela"><table><thead><tr><th>Item</th><th>Situação</th><th>CST / cClassTrib</th><th class="n">Base</th>
        <th class="n">CBS (alíq. / efet.)</th><th class="n">IBS UF</th><th class="n">IBS Mun.</th><th class="n">IS</th></tr></thead><tbody>`;
  for (const o of d.objetos || []) {
    const tc = o.tribCalc || {};
    const ib = tc.IBSCBS || {};
    const g = ib.gIBSCBS || {};
    const is = tc.IS;
    const efet = (grp, p) => grp ? `${pct(grp[p])}${grp.gRed ? " / " + pct(grp.gRed.pAliqEfet) : ""}` : "";
    const estado = o.estadoItem || (o.calculoSimulado ? "CALCULO_SIMULADO" : "CALCULADO");
    h += `<tr><td>${o.nObj}</td><td>${seloEstado(estado)}</td><td>${esc(ib.CST || "")} / ${esc(ib.cClassTrib || "")}</td>
      <td class="n">${brl(g.vBC)}</td>
      <td class="n">${brl(g.gCBS?.vCBS)}<br><small>${efet(g.gCBS, "pCBS")}</small></td>
      <td class="n">${brl(g.gIBSUF?.vIBSUF)}<br><small>${efet(g.gIBSUF, "pIBSUF")}</small></td>
      <td class="n">${brl(g.gIBSMun?.vIBSMun)}<br><small>${efet(g.gIBSMun, "pIBSMun")}</small></td>
      <td class="n">${is ? brl(is.vIS) + "<br><small>" + pct(is.pIS) + "</small>" : "—"}</td></tr>`;
    const extras = [];
    if (g.gTribRegular) extras.push(`Tributação regular ${esc(g.gTribRegular.CSTReg)}/${esc(g.gTribRegular.cClassTribReg)}: CBS ${brl(g.gTribRegular.vTribRegCBS)}, IBS UF ${brl(g.gTribRegular.vTribRegIBSUF)}, IBS Mun ${brl(g.gTribRegular.vTribRegIBSMun)}`);
    if (g.gTribCompraGov) extras.push(`Compra governamental (valores sem redutor): CBS ${brl(g.gTribCompraGov.vTribCBS)}, IBS UF ${brl(g.gTribCompraGov.vTribIBSUF)}, IBS Mun ${brl(g.gTribCompraGov.vTribIBSMun)}`);
    if (g.gCBS?.gDif) extras.push(`Diferimento ${pct(g.gCBS.gDif.pDif)}: CBS diferida ${brl(g.gCBS.gDif.vDif)}, IBS UF diferido ${brl(g.gIBSUF?.gDif?.vDif)}`);
    if (o.erros?.length) extras.push(o.erros.map((e) => `<span style="color:var(--erro)">${esc(e.code)} ${esc(e.title)}: ${esc(e.detail)}</span>`).join("<br>"));
    const mem = ib.memoriaCalculo ? Object.entries(ib.memoriaCalculo).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join("<br>") : "";
    const memIs = is?.memoriaCalculo ? `<b>IS:</b> ${esc(is.memoriaCalculo)}` : "";
    if (extras.length || mem || memIs) h += `<tr><td></td><td colspan="7" class="memoria">${extras.join("<br>")}${extras.length && (mem || memIs) ? "<br>" : ""}
      ${mem || memIs ? `<details><summary>Memória de cálculo</summary>${mem}${memIs ? "<br>" + memIs : ""}</details>` : ""}</td></tr>`;
  }
  h += `</tbody></table></div>`;
  h += LOCAL ? `<div class="acoes"><p class="nota">Geração e validação de XML: disponível na versão com a API oficial.</p><button id="baixar" class="sec">Baixar JSON</button></div>` : `<div class="acoes"><div>
      <label class="check">Gerar XML do grupo de tributação para
      <select id="xml-tipo" style="width:auto"><option value="nfe">NF-e</option><option value="nfce">NFC-e</option><option value="cte">CT-e</option>
      <option value="cte-simplificado">CT-e Simplificado</option><option value="bpe">BP-e</option><option value="bpe-tm">BP-e TM</option><option value="nf3e">NF3-e</option></select>
      <button id="xml-gerar" class="sec">Gerar e validar XML</button></label></div>
      <button id="baixar" class="sec">Baixar JSON</button></div><div id="xml-res"></div>`;
  h += rawHtml(op, d) + "</div>";
  window.__ultimo = d;
  return h;
}
const rawHtml = (env, rec) => `<details><summary class="nota">Ver JSON enviado e recebido</summary>
  <p class="nota">Enviado:</p><pre>${esc(JSON.stringify(env, null, 2))}</pre><p class="nota">Recebido:</p><pre>${esc(typeof rec === "string" ? rec : JSON.stringify(rec, null, 2))}</pre></details>`;

function ligarXml(op) {
  const bx = $("#baixar");
  if (bx) bx.addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ entrada: op, saida: window.__ultimo }, null, 2)], { type: "application/json" }));
    a.download = "calculo-rtc.json"; a.click();
  });
  const bt = $("#xml-gerar");
  if (!bt) return;
  bt.addEventListener("click", async () => {
    const tipo = $("#xml-tipo").value;
    $("#xml-res").innerHTML = `<p class="nota">Gerando…</p>`;
    // a geração de XML usa a resposta do endpoint /regime-geral (não a da observabilidade)
    const roc = await api("POST", "/regime-geral", op);
    if (!roc.ok) { $("#xml-res").innerHTML = erroHtml(roc.dados); return; }
    const x = await api("POST", "/xml/generate" + qs({ tipo }), roc.dados);
    if (!x.ok) { $("#xml-res").innerHTML = erroHtml(x.dados); return; }
    const v = await api("POST", "/xml/validate" + qs({ tipo, subtipo: "grupo" }), x.texto, "application/xml");
    const valido = v.ok && String(v.texto).trim() === "true";
    $("#xml-res").innerHTML = `<div class="msg ${valido ? "" : "er"}" style="${valido ? "background:var(--ok-bg);color:var(--ok)" : ""}">
      ${valido ? "XML válido contra o XSD oficial" : "XML inválido: " + esc(v.dados?.detail || v.texto)}</div><pre>${esc(x.texto)}</pre>`;
  });
}

/* ---------------- cenários ---------------- */
let CENARIOS = [];
const SUPORTE_LOCAL = /regime-geral$|base-calculo-unificada$|^\/dados-abertos\/(versao|aliquota|ufs|situacoes-tributarias\/cbs-ibs|classificacoes-tributarias\/cbs-ibs\/class-trib|ncm$|nbs$|classificacoes-tributarias\/(ncm|nbs)-aplicavel|classificacoes-tributarias\/nbs$|fundamentacoes|redutores)/;
async function carregarCenarios() {
  CENARIOS = await (await fetch("cenarios.json")).json();
  let h = "", grupo = "";
  for (const c of CENARIOS) {
    if (c.grupo !== grupo) { grupo = c.grupo; h += `<div class="cen-grupo">${esc(grupo)}</div>`; }
    const abrir = c.caminho.endsWith("regime-geral") ? `<button class="sec" data-abrir="${c.id}">Abrir na calculadora</button>` : "";
    const soServidor = LOCAL && !SUPORTE_LOCAL.test(c.caminho);
    h += `<div class="cen" id="cen-${c.id}"><div class="cen-topo"><div><span class="cen-id">${c.id} · ${c.metodo} ${esc(c.caminho)}</span><br><b>${esc(c.titulo)}</b>
      <p class="nota">${esc(c.explicacao)}</p></div><div class="bts">${abrir}${soServidor ? `<span class="selo av">só na versão com servidor</span>` : `<button class="pri" data-rodar="${c.id}">Executar</button>`}</div></div>
      <div class="cen-res"></div></div>`;
  }
  $("#lista-cenarios").innerHTML = h;
  $$("[data-rodar]").forEach((b) => b.addEventListener("click", () => rodarCenario(b.dataset.rodar)));
  $$("[data-abrir]").forEach((b) => b.addEventListener("click", () => carregarOperacao(CENARIOS.find((c) => c.id === b.dataset.abrir).corpo)));
}
const respostas = {};
async function rodarCenario(id) {
  const c = CENARIOS.find((x) => x.id === id);
  let corpo = c.corpo;
  if (c.corpoDe) {
    if (!respostas[c.corpoDe]) await rodarCenario(c.corpoDe);
    corpo = respostas[c.corpoDe].texto;
  }
  const r = await api(c.metodo, c.caminho + (c.query ? qs(c.query) : ""), c.metodo === "POST" ? corpo : undefined, c.tipoConteudo);
  respostas[id] = r;
  const alvo = $(`#cen-${id} .cen-res`);
  const selo = r.ok ? `<span class="selo ok">HTTP ${r.status}</span>` : `<span class="selo er">HTTP ${r.status}</span>`;
  const av = r.aviso ? ` <span class="selo av">cálculo simulado</span>` : "";
  alvo.innerHTML = `<p>${selo}${av}</p>` +
    (corpo && c.metodo === "POST" ? `<details><summary class="nota">Requisição</summary><pre>${esc(typeof corpo === "string" ? corpo : JSON.stringify(corpo, null, 2))}</pre></details>` : "") +
    `<pre>${esc(typeof r.dados === "string" ? r.dados : JSON.stringify(r.dados, null, 2))}</pre>`;
}
$("#rodar-todos").addEventListener("click", async () => { for (const c of CENARIOS) if (!LOCAL || SUPORTE_LOCAL.test(c.caminho)) await rodarCenario(c.id); });

/* ---------------- base de cálculo ---------------- */
const CAMPOS_BASE = [
  ["anoFatoGerador", "Ano do fato gerador", 2027], ["tipoDocumento", "Tipo de documento (55 NF-e / 65 NFC-e)", 55],
  ["vProd", "Valor dos produtos", 1000], ["vFrete", "Frete", 50], ["vSeg", "Seguro", 20], ["vOutro", "Outras despesas", 10],
  ["vDesc", "Desconto incondicional", 50], ["vII", "Imposto de importação", ""], ["vIS", "Imposto Seletivo", 30],
  ["vPIS", "PIS (só 2026)", 9.25], ["vCOFINS", "COFINS (só 2026)", 46.25], ["vICMS", "ICMS (2026–2032)", 180],
  ["vICMSUFDest", "ICMS UF destino", ""], ["vFCP", "FCP", 10], ["vFCPUFDest", "FCP UF destino", ""],
  ["vICMSMono", "ICMS monofásico", ""], ["vISSQN", "ISSQN (serviço)", ""],
];
function montarBase() {
  $("#base-campos").innerHTML = `<label>Natureza<select id="b-natureza"><option value="bem">Bem</option><option value="servico">Serviço</option></select></label>` +
    CAMPOS_BASE.map(([k, r, v]) => `<label>${r}<input type="number" step="0.01" id="b-${k}" value="${v}"></label>`).join("");
}
$("#calc-base").addEventListener("click", async () => {
  const corpo = { natureza: $("#b-natureza").value };
  for (const [k] of CAMPOS_BASE) { const v = num($("#b-" + k).value); if (v !== undefined) corpo[k] = v; }
  const r = await api("POST", "/base-calculo/base-calculo-unificada", corpo);
  if (!r.ok) { $("#base-res").innerHTML = erroHtml(r.dados); return; }
  const d = r.dados;
  $("#base-res").innerHTML = `<div class="kpis">
    <div class="kpi"><div class="r">Base regime geral (CBS/IBS)</div><div class="v">${brl(d.baseRG)}</div></div>
    <div class="kpi"><div class="r">Base Imposto Seletivo</div><div class="v">${brl(d.baseIS)}</div></div>
    <div class="kpi"><div class="r">Base Simples Nacional</div><div class="v">${brl(d.baseSN)}</div></div></div>` +
    (d.avisos?.length ? `<div class="msg av">${d.avisos.map(esc).join("<br>")}</div>` : "") + rawHtml(corpo, d);
});

/* ---------------- consultas ---------------- */
$("#consultar").addEventListener("click", async () => {
  const t = $("#cq-tipo").value, cod = $("#cq-cod").value.trim(), ct = $("#cq-ct").value.trim(), data = $("#cq-data").value;
  const rotas = {
    ncm: ["/dados-abertos/ncm", { ncm: cod, data }],
    nbs: ["/dados-abertos/nbs", { nbs: cod, data }],
    ct: [`/dados-abertos/classificacoes-tributarias/cbs-ibs/class-trib/${ct || cod}`, { data }],
    ncmct: ["/dados-abertos/classificacoes-tributarias/ncm-aplicavel", { ncm: cod, cClassTrib: ct, dataOcorrenciaFatoGerador: data }],
    nbsct: ["/dados-abertos/classificacoes-tributarias/nbs-aplicavel", { nbs: cod, cClassTrib: ct, dataOcorrenciaFatoGerador: data }],
    ctnbs: ["/dados-abertos/classificacoes-tributarias/nbs", { nbs: cod, data }],
    indop: ["/nfse/indicador-operacao", { nbs: cod, dataOcorrenciaFatoGerador: data }],
    fund: ["/dados-abertos/fundamentacoes-legais", { data }],
    redgov: ["/dados-abertos/redutores-compra-governamental", {}],
    erro: ["/observabilidade/erros", { codigo: cod || "REG-011" }],
  };
  if (t === "aliq") {
    const uf = $("#op-uf").selectedOptions[0]?.dataset.cod, mun = $("#op-mun").value;
    const [a, b, c] = await Promise.all([
      api("GET", "/dados-abertos/aliquota-uniao" + qs({ data })),
      api("GET", "/dados-abertos/aliquota-uf" + qs({ codigoUf: uf, data })),
      api("GET", "/dados-abertos/aliquota-municipio" + qs({ codigoMunicipio: mun, data })),
    ]);
    const v = (r) => (r.ok ? pct(r.dados.aliquotaReferencia) : "não cadastrada (" + r.status + ")");
    $("#cq-res").innerHTML = `<p class="nota">UF e município da aba “Calcular operação”.</p><div class="kpis">
      <div class="kpi"><div class="r">CBS (União)</div><div class="v">${v(a)}</div></div>
      <div class="kpi"><div class="r">IBS estadual</div><div class="v">${v(b)}</div></div>
      <div class="kpi"><div class="r">IBS municipal</div><div class="v">${v(c)}</div></div></div>`;
    return;
  }
  const [rota, q] = rotas[t];
  const r = await api("GET", rota + qs(q));
  $("#cq-res").innerHTML = `<p>${r.ok ? `<span class="selo ok">HTTP ${r.status}</span>` : `<span class="selo er">HTTP ${r.status}</span>`}</p><pre>${esc(JSON.stringify(r.dados, null, 2))}</pre>`;
});

iniciar();
