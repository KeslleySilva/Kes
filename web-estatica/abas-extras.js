// Abas "Simples Nacional" e "Gerar DANFSe" da versão web.
// - Simples Nacional: motor-simples.js (cálculo não assistido da API oficial do Simples Nacional).
// - DANFSe: WebAssembly oficial do gerador de DANFSe (danfse.js).
"use strict";
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const brl = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const pctTxt = (v) => (v == null || v === "" ? "—" : String(v).replace(".", ",") + "%");

  async function salvarArquivo(nome, dados) {
    let dl = null;
    try { dl = window.claude && (await window.claude.use("downloads")); } catch (_) { dl = null; }
    if (dl) {
      try { await dl.save({ filename: nome, data: dados }); return "ok"; }
      catch (e) { return e && e.code === "declined" ? "recusado" : "erro"; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(dados instanceof Blob ? dados : new Blob([dados]));
    a.download = nome; a.click();
    return "ok";
  }
  window.RTCSalvarArquivo = salvarArquivo;

  /* ---------- montar abas ---------- */
  const nav = $(".abas");
  const main = $("main");
  const novaAba = (id, rotulo, html) => {
    const b = document.createElement("button");
    b.className = "aba"; b.dataset.aba = id; b.textContent = rotulo;
    nav.append(b);
    b.addEventListener("click", () => abrirAba(id));
    const s = document.createElement("section");
    s.id = "aba-" + id; s.className = "painel"; s.innerHTML = html;
    main.append(s);
  };

  novaAba("simples", "Simples Nacional", `
    <div class="cartao">
      <h2>Simples Nacional: IBS e CBS do optante</h2>
      <p class="nota">Cálculo não assistido da NT 2026.005: você informa as alíquotas efetivas do contribuinte no período (uma por anexo) e a calculadora escolhe o anexo e o par de alíquotas de cada item, com ou sem redistribuição do ISS. Vale a partir de 2027. Os valores de alíquota já preenchidos são apenas exemplo.</p>
      <div class="grade">
        <label>Data do fato gerador<input type="date" id="sn-data" value="2027-03-15"></label>
        <label>Documento fiscal<select id="sn-tpdoc"></select></label>
        <label class="sn-crt">CRT do emitente<select id="sn-crt">
          <option value="1">1 – Simples Nacional</option><option value="2">2 – Simples, excesso de sublimite</option>
          <option value="3">3 – Regime normal</option><option value="4">4 – MEI</option></select></label>
        <label class="sn-crt">Regime do IBS/CBS (tpRegimeIBSCBS)<select id="sn-tpreg">
          <option value="">Não informar</option><option value="1">1 – Optou pelo regime regular</option><option value="2">2 – Opção pelo Simples pendente</option></select></label>
        <label class="sn-nfse" hidden>Situação no Simples (opSimpNac)<select id="sn-opsimp">
          <option value="3">3 – Optante ME/EPP</option><option value="4">4 – Opção pendente</option><option value="1">1 – Não optante</option><option value="2">2 – MEI</option></select></label>
        <label class="sn-nfse" hidden>IBS/CBS (regApIBSCBSSN)<select id="sn-regap">
          <option value="1">1 – IBS e CBS pelo Simples</option><option value="2">2 – CBS pelo Simples, IBS regular</option><option value="3">3 – Ambos pelo regime regular</option></select></label>
        <label class="sn-nfse" hidden>Tributos (regApTribSN)<select id="sn-regtrib">
          <option value="1">1 – Federais e ISS pelo Simples</option><option value="2">2 – ISS fora do Simples</option><option value="3">3 – Federais e ISS fora</option></select></label>
        <label>Compra governamental<select id="sn-ente"><option value="">Não</option><option value="1">União</option><option value="2">Estado</option><option value="3">Distrito Federal</option><option value="4">Município</option></select></label>
      </div>
    </div>
    <div class="cartao">
      <h2>Alíquotas efetivas do contribuinte (% , por anexo)</h2>
      <div class="grade">
        <label>Fator "r" ≥ 28%?<select id="sn-fatorr"><option value="">Não informar</option><option value="true">Sim (atividade 09 no Anexo III)</option><option value="false">Não (atividade 09 no Anexo V)</option></select></label>
        <label class="check"><input type="checkbox" id="sn-impedido"> Impedido pelo sublimite (IBS e ISS fora do Simples)</label>
      </div>
      <div class="tabela"><table id="sn-anexos"><thead><tr><th>Anexo</th><th>CBS</th><th>IBS</th><th>CBS sem redistribuição do ISS</th><th>IBS sem redistribuição do ISS</th></tr></thead><tbody></tbody></table></div>
    </div>
    <div class="cartao">
      <div class="linha-titulo"><h2>Itens</h2><button id="sn-add" class="sec">+ Adicionar item</button></div>
      <div id="sn-itens"></div>
    </div>
    <div class="acoes"><span class="nota">Conferido com a API oficial do Simples Nacional v1.0.2 em 2.289 casos, todos idênticos.</span><button id="sn-calc" class="pri">Calcular</button></div>
    <div id="sn-res"></div>`);

  novaAba("danfse", "Gerar DANFSe", `
    <div class="cartao">
      <h2>DANFSe: PDF da NFS-e a partir do XML</h2>
      <p class="nota">Usa o gerador oficial da Receita (calculadora-rtc-gerador-danfse) compilado para rodar no navegador. O XML não sai do seu computador. Na primeira geração o gerador é baixado (cerca de 7,6 MB).</p>
      <div class="grade">
        <label>Arquivo XML da NFS-e<input type="file" id="df-arquivo" accept=".xml,text/xml,application/xml"></label>
        <label>Situação da nota<select id="df-stc"><option value="0">Válida</option><option value="1">Substituída</option><option value="2">Cancelada</option></select></label>
        <label class="check"><input type="checkbox" id="df-canhoto" checked> Incluir canhoto (recibo)</label>
      </div>
      <label style="margin-top:10px">Ou cole o XML aqui<textarea id="df-xml" rows="8" spellcheck="false" style="font:12.5px ui-monospace,monospace;padding:8px;border:1px solid var(--borda);border-radius:6px;background:var(--card);color:var(--tx);width:100%"></textarea></label>
      <div class="acoes"><button id="df-exemplo" class="sec">Carregar NFS-e de exemplo (dados fictícios)</button><span><button id="df-salvar" class="sec" hidden>Salvar PDF</button> <button id="df-gerar" class="pri">Gerar DANFSe</button></span></div>
      <div id="df-msg"></div>
      <div id="df-preview"></div>
    </div>`);

  /* ---------- Buscar por descrição (CNAE, NCM, NBS, cClassTrib) ---------- */
  novaAba("busca", "Buscar por descrição", `
    <div class="cartao">
      <h2>Buscar por descrição do produto ou serviço</h2>
      <p class="nota">Dica: as tabelas usam termos técnicos; se não encontrar, tente sinônimos (ex.: <i>sacos plásticos</i> em vez de <i>sacola</i>). Digite o que você vende ou presta (ex.: <i>sacola plástica</i>, <i>máquina para plástico</i>, <i>educação infantil</i>, <i>arroz</i>). A busca procura nas tabelas oficiais de CNAE (IBGE), NCM, NBS e cClassTrib. O cálculo usa NCM para bens e NBS para serviços; o CNAE serve para identificar a atividade.</p>
      <div class="grade"><label style="grid-column:1/-1">Descrição<input id="bq-texto" placeholder="ex.: sacola plástica" autocomplete="off"></label></div>
      <div class="acoes"><span class="nota" id="bq-status"></span><button id="bq-buscar" class="pri">Buscar</button></div>
    </div>
    <div id="bq-res"></div>`);

  nav.insertBefore(nav.querySelector('[data-aba="busca"]'), nav.querySelector('[data-aba="simples"]'));
  let BQ = null;
  const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // texto de busca: sem acento, só letras/dígitos separados por espaço, com espaço inicial (casa início de palavra)
  const textoBusca = (t) => " " + semAcento(t).replace(/[^a-z0-9]+/g, " ");
  async function carregarBusca() {
    if (BQ) return BQ;
    $("#bq-status").textContent = "Carregando tabelas…";
    const j = (u) => fetch(u).then((r) => r.json());
    const [cnae, ncm, R] = await Promise.all([j("dados/cnae.json"), j("dados/ncm.json"), j("dados/regras.json")]);
    const hoje = new Date().toISOString().slice(0, 10);
    const vig = (ini, fim, d) => String(ini).slice(0, 10) <= d && (!fim || String(fim).slice(0, 10) >= d);
    // NCM: descrição completa = cadeia de ancestrais (capítulo > posição > subposição > item)
    const descNcm = new Map(ncm.filter((x) => vig(x[2], x[3], hoje)).map((x) => [x[0], String(x[1]).replace(/<\/?[a-z]+>/gi, "")]));
    const ncms = [...descNcm.keys()].filter((c) => c.length === 8).map((c) => {
      const cadeia = [2, 4, 5, 6, 7].map((n) => descNcm.get(c.slice(0, n))).filter(Boolean);
      return { cod: c, desc: descNcm.get(c), cadeia, busca: textoBusca(cadeia.join(" ") + " " + descNcm.get(c)), propria: textoBusca(descNcm.get(c)) };
    });
    const descNbs = new Map(R.nbs.filter((x) => vig(x.ini, x.fim, hoje)).map((x) => [x.cd, x.descricao]));
    const nbss = [...descNbs.keys()].filter((c) => c.length === 9).map((c) => {
      const cadeia = [3, 5, 6, 7, 8].map((n) => descNbs.get(c.slice(0, n))).filter((d, i, a) => d && a.indexOf(d) === i);
      return { cod: c, desc: descNbs.get(c), cadeia, busca: textoBusca(cadeia.join(" ") + " " + descNbs.get(c)), propria: textoBusca(descNbs.get(c)) };
    });
    const sit = new Map(R.situacoes.map((s) => [s.id, s]));
    const cts = R.classificacoes.filter((c) => vig(c.ini, c.fim, hoje) && String((sit.get(c.sitr) || {}).tributos || "").split(",").includes("2"))
      .map((c) => ({ cod: c.cd, cst: (sit.get(c.sitr) || {}).cd, desc: c.descricao, id: c.id, busca: textoBusca(c.descricao) }));
    const ctPorId = new Map(cts.map((c) => [c.id, c]));
    const cnaes = cnae.map((x) => ({ cod: x[0], desc: x[1], classe: x[2], divisao: x[3], secao: x[4], atividades: x[5], compreende: x[6], nao: x[7],
      propria: textoBusca(x[1]), ativ: textoBusca(x[5].join(" | ")), obs: textoBusca(x[6]) }));
    // classificações com anexo que alcançam uma NCM/NBS (ex.: cesta básica, reduções do Anexo)
    const classifNcm = (cod) => {
      const out = new Map();
      for (const n of R.ncmAplicavel) {
        if (!vig(n.ini, n.fim, hoje) || !cod.startsWith(n.ncm)) continue;
        if (R.excecaoNcm.some((e) => e.ncma === n.id && cod.startsWith(e.ncm) && vig(e.ini, e.fim, hoje))) continue;
        const c = ctPorId.get(n.cl); if (c) out.set(c.cod, c);
      }
      return [...out.values()];
    };
    const classifNbs = (cod) => {
      const out = new Map();
      for (const n of R.nbsAplicavel) { if (vig(n.ini, n.fim, hoje) && cod.startsWith(n.nbs)) { const c = ctPorId.get(n.cl); if (c) out.set(c.cod, c); } }
      return [...out.values()];
    };
    $("#bq-status").textContent = "";
    BQ = { ncms, nbss, cts, cnaes, classifNcm, classifNbs, isNcm: new Set(R.isNcm) };
    return BQ;
  }

  function pontuar(itens, palavras, campos) {
    const out = [];
    for (const it of itens) {
      let s = 0;
      for (const [campo, peso] of campos) { const t = it[campo]; if (t && palavras.every((w) => t.includes(" " + w))) { s = peso; break; } }
      if (s) out.push([s, it]);
    }
    return out.sort((a, b) => b[0] - a[0] || a[1].cod.localeCompare(b[1].cod)).map((x) => x[1]);
  }

  async function usarNaCalculadora({ ncm, nbs, cst, ct }) {
    abrirAba("calc");
    const el = document.querySelector("#itens .item");
    if (!el) return;
    if (ncm || nbs) {
      el.querySelector(".i-tipo").value = ncm ? "ncm" : "nbs";
      el.querySelector(".i-tipo").dispatchEvent(new Event("change"));
      el.querySelector(".i-cod").value = ncm || nbs;
    }
    if (cst && ct) {
      el.querySelector(".i-cst").value = cst;
      el.querySelector(".i-cst").dispatchEvent(new Event("change"));
      for (let i = 0; i < 40 && ![...el.querySelector(".i-ct").options].some((o) => o.value === ct); i++) await new Promise((r) => setTimeout(r, 50));
      el.querySelector(".i-ct").value = ct;
      el.querySelector(".i-ct").dispatchEvent(new Event("change"));
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function buscar() {
    const q = $("#bq-texto").value.trim();
    // radical simples: tolera plural e gênero (plástica/plásticos, máquina/máquinas)
    const radical = (w) => (w.length > 4 ? w.replace(/(oes|aes|ais|eis|as|os|es|a|o|e|s)$/, "") : w);
    const palavras = semAcento(q).split(/\s+/).filter((w) => w.length > 1 && !["de", "da", "do", "das", "dos", "para", "com", "em", "e"].includes(w)).map(radical);
    if (!palavras.length) { $("#bq-res").innerHTML = ""; return; }
    const B = await carregarBusca();
    const LIM = 15;
    const rCnae = pontuar(B.cnaes, palavras, [["propria", 3], ["ativ", 2], ["obs", 1]]);
    const rNcm = pontuar(B.ncms, palavras, [["propria", 2], ["busca", 1]]);
    const rNbs = pontuar(B.nbss, palavras, [["propria", 2], ["busca", 1]]);
    const rCt = pontuar(B.cts, palavras, [["busca", 1]]);
    const bloco = (titulo, total, linhas, nota) => `<div class="cartao"><h2>${titulo} <span class="nota">${total ? total + " encontrado(s)" + (total > LIM ? `, mostrando ${LIM}` : "") : "nenhum resultado"}</span></h2>${nota ? `<p class="nota">${nota}</p>` : ""}${linhas}</div>`;
    const chips = (lista) => lista.length ? `<div style="margin-top:6px">${lista.map((c) => `<button class="sec bq-ct" data-cst="${c.cst}" data-ct="${c.cod}" title="Usar esta classificação na calculadora" style="padding:3px 8px;font-size:12.5px;margin:2px 4px 2px 0">${c.cod} – ${esc(c.desc.slice(0, 60))}</button>`).join("")}</div>` : "";
    const marca = (txt) => {
      const chars = [...String(txt || "")];
      const norm = chars.map((c) => { const n = semAcento(c); return n.length === 1 ? n : c.toLowerCase(); }).join("");
      const on = new Array(chars.length).fill(false);
      for (const w of palavras) { let i = norm.indexOf(w); while (i >= 0) { if (i === 0 || !/[a-z0-9]/.test(norm[i - 1])) for (let k = i; k < i + w.length; k++) on[k] = true; i = norm.indexOf(w, i + 1); } }
      let h = "", aberto = false;
      chars.forEach((c, k) => { if (on[k] && !aberto) { h += "<mark>"; aberto = true; } if (!on[k] && aberto) { h += "</mark>"; aberto = false; } h += esc(c); });
      return aberto ? h + "</mark>" : h;
    };
    let h = "";
    h += bloco("CNAE (atividade econômica)", rCnae.length, rCnae.slice(0, LIM).map((c) => {
      const ativ = c.atividades.filter((a) => palavras.every((w) => textoBusca(a).includes(" " + w))).slice(0, 4);
      return `<div class="cen"><div class="cen-topo"><div><span class="cen-id">${esc(c.cod)} · ${esc(c.secao)}</span><br><b>${marca(c.desc)}</b>
        <p class="nota">Classe: ${esc(c.classe)} · Divisão: ${esc(c.divisao)}</p>
        ${ativ.length ? `<p class="nota">Atividades do índice IBGE: ${ativ.map(marca).join("; ")}</p>` : ""}</div></div>
        ${c.compreende || c.nao ? `<details><summary class="nota">O que compreende e o que não compreende</summary><pre>${esc([c.compreende, c.nao].filter(Boolean).join("\n\n"))}</pre></details>` : ""}</div>`;
    }).join(""), "Fonte: IBGE/CONCLA, CNAE 2.3. O CNAE identifica a atividade, mas não entra no cálculo do IBS e da CBS.");
    h += bloco("NCM (mercadorias)", rNcm.length, rNcm.slice(0, LIM).map((n) => {
      const cls = B.classifNcm(n.cod);
      return `<div class="cen"><div class="cen-topo"><div><span class="cen-id">NCM ${n.cod.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3")}</span>${B.isNcm.has(n.cod) ? ' <span class="selo av">sujeita ao Imposto Seletivo</span>' : ""}<br><b>${marca(n.desc)}</b>
        <p class="nota">${n.cadeia.map(marca).join(" › ")}</p></div><div class="bts"><button class="pri bq-usar" data-ncm="${n.cod}">Usar na calculadora</button></div></div>
        ${cls.length ? `<p class="nota" style="margin-top:6px">Classificações com tratamento específico que alcançam esta NCM:</p>${chips(cls)}` : `<p class="nota">Nenhum anexo de redução ou tratamento específico alcança esta NCM; em regra, tributação integral (CST 000, cClassTrib 000001).</p>`}</div>`;
    }).join(""));
    h += bloco("NBS (serviços)", rNbs.length, rNbs.slice(0, LIM).map((n) => {
      const cls = B.classifNbs(n.cod);
      return `<div class="cen"><div class="cen-topo"><div><span class="cen-id">NBS ${n.cod.replace(/^(\d)(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3.$4")}</span><br><b>${marca(n.desc)}</b>
        <p class="nota">${n.cadeia.map(marca).join(" › ")}</p></div><div class="bts"><button class="pri bq-usar" data-nbs="${n.cod}">Usar na calculadora</button></div></div>
        ${cls.length ? `<p class="nota" style="margin-top:6px">Classificações com tratamento específico que alcançam esta NBS:</p>${chips(cls)}` : `<p class="nota">Nenhum anexo de redução ou tratamento específico alcança esta NBS; em regra, tributação integral (CST 000, cClassTrib 000001).</p>`}</div>`;
    }).join(""));
    h += bloco("Classificação tributária (cClassTrib)", rCt.length, `<div>${chips(rCt.slice(0, LIM))}</div>`);
    $("#bq-res").innerHTML = h;
    $$("#bq-res .bq-usar").forEach((b) => b.addEventListener("click", () => usarNaCalculadora({ ncm: b.dataset.ncm, nbs: b.dataset.nbs })));
    $$("#bq-res .bq-ct").forEach((b) => b.addEventListener("click", () => usarNaCalculadora({ cst: b.dataset.cst, ct: b.dataset.ct })));
  }
  $("#bq-buscar").addEventListener("click", buscar);
  $("#bq-texto").addEventListener("keydown", (e) => { if (e.key === "Enter") buscar(); });

  /* ---------- Simples Nacional ---------- */
  let motorSN = null;
  const prontoSN = (async () => {
    const j = (u) => fetch(u).then((r) => r.json());
    const [R, NCM] = await Promise.all([j("dados/regras.json"), j("dados/ncm.json")]);
    motorSN = MotorSimplesRTC.criar(R, NCM);
  })();

  const EXEMPLO_ANEXOS = { I: ["1.1612", "0.0129"], II: ["1.3000", "0.0200"], III: ["2.3874", "0.0263", "2.3591", "0.0260"], IV: ["3.5000", "0.0400", "3.4100", "0.0390"], V: ["4.2555", "0.0555", "4.1000", "0.0540"] };
  $("#sn-anexos tbody").innerHTML = Object.entries(EXEMPLO_ANEXOS).map(([k, v]) => `<tr data-anexo="${k}"><td><b>${k}</b></td>
    <td><input class="a-cbs" value="${v[0]}" inputmode="decimal"></td><td><input class="a-ibs" value="${v[1]}" inputmode="decimal"></td>
    <td>${v[2] ? `<input class="a-cbs-sem" value="${v[2]}" inputmode="decimal">` : "—"}</td><td>${v[3] ? `<input class="a-ibs-sem" value="${v[3]}" inputmode="decimal">` : "—"}</td></tr>`).join("");

  const vocabNfse = () => $("#sn-tpdoc").value === "91";
  function atualizarRegime() {
    const n = vocabNfse();
    $$(".sn-crt").forEach((e) => (e.hidden = n));
    $$(".sn-nfse").forEach((e) => (e.hidden = !n));
    $$(".sn-iss").forEach((e) => (e.hidden = !n));
    $$(".sn-is").forEach((e) => (e.hidden = n));
    $("#sn-add").hidden = n;
    if (n) $$("#sn-itens .item").slice(1).forEach((e) => e.remove());
    preencherAtividades();
  }
  function preencherAtividades() {
    if (!motorSN) return;
    const ats = motorSN.atividades($("#sn-data").value, Number($("#sn-tpdoc").value));
    for (const sel of $$(".s-ativ")) {
      const atual = sel.value;
      sel.innerHTML = `<option value="">Não informar</option>` + ats.map((a) => `<option value="${a.codigo}">${a.codigo} – ${esc(a.descricao.slice(0, 70))} (Anexo ${esc(a.rotuloAnexo)})</option>`).join("");
      if ([...sel.options].some((o) => o.value === atual)) sel.value = atual; else if (ats[0]) sel.value = ats[0].codigo;
    }
  }
  function addItem(d = {}) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `<div class="item-topo"><b class="item-num"></b><button class="rem link">remover</button></div>
      <div class="grade">
        <label>Atividade do Simples (cAtivSN)<select class="s-ativ"></select></label>
        <label>cClassTrib<input class="s-ct" value="${d.cClassTrib || "000001"}"></label>
        <label>NCM ou NBS (opcional)<input class="s-nom" value="${d.nom || ""}" placeholder="8 dígitos NCM ou 9 NBS"></label>
        <label>Base de cálculo / receita (R$)<input class="s-bc" type="number" step="0.01" value="${d.bc || "10000.00"}"></label>
        <label class="sn-is">Imposto Seletivo já calculado (R$)<input class="s-is" type="number" step="0.01" value="0.00"></label>
        <label class="sn-iss" hidden>Tributação do ISSQN<select class="s-trib"><option value="">Não informar</option><option value="1" selected>1 – Tributável</option><option value="2">2 – Imunidade</option><option value="3">3 – Exportação</option><option value="4">4 – Não incidência</option></select></label>
        <label class="sn-iss" hidden>Retenção do ISSQN<select class="s-ret"><option value="">Não informar</option><option value="1" selected>1 – Não retido</option><option value="2">2 – Retido pelo tomador</option><option value="3">3 – Retido pelo intermediário</option></select></label>
        <label class="sn-iss" hidden>Benefício municipal<select class="s-bm"><option value="">Nenhum</option><option value="1">1 – Isenção</option><option value="2">2 – Redução da base (%)</option><option value="3">3 – Redução da base (R$)</option><option value="4">4 – Alíquota diferenciada</option></select></label>
      </div>`;
    $("#sn-itens").append(el);
    $(".rem", el).addEventListener("click", () => { el.remove(); renum(); });
    renum(); atualizarRegime();
    if (d.ativ) $(".s-ativ", el).value = d.ativ;
  }
  const renum = () => $$("#sn-itens .item").forEach((e, i) => ($(".item-num", e).textContent = "Item " + (i + 1)));

  function montarOperacaoSN() {
    const n = vocabNfse();
    const op = { id: "web-" + Date.now(), versao: "3.0.0", data: $("#sn-data").value, tpDoc: $("#sn-tpdoc").value };
    if (n) { op.opSimpNac = $("#sn-opsimp").value; if (["3", "4"].includes(op.opSimpNac)) { op.regApIBSCBSSN = $("#sn-regap").value; op.regApTribSN = $("#sn-regtrib").value; } }
    else { op.CRT = $("#sn-crt").value; if ($("#sn-tpreg").value) op.tpRegimeIBSCBS = $("#sn-tpreg").value; }
    if ($("#sn-ente").value) op.tpEnteGov = $("#sn-ente").value;
    const ae = { impedimentoSublimite: $("#sn-impedido").checked };
    if ($("#sn-fatorr").value) ae.fatorR = $("#sn-fatorr").value === "true";
    for (const tr of $$("#sn-anexos tbody tr")) {
      const k = tr.dataset.anexo, v = (c) => { const i = $(c, tr); return i && i.value.trim() ? i.value.trim().replace(",", ".") : null; };
      const o = { pCBSSN: v(".a-cbs"), pIBSSN: v(".a-ibs") };
      if (v(".a-cbs-sem") || v(".a-ibs-sem")) o.semRedistribuicaoISS = { pCBSSN: v(".a-cbs-sem"), pIBSSN: v(".a-ibs-sem") };
      if (o.pCBSSN || o.pIBSSN || o.semRedistribuicaoISS) ae["anexo" + k] = o;
    }
    op.aliquotasEfetivas = ae;
    op.itens = $$("#sn-itens .item").map((el, i) => {
      const it = { numero: i + 1, cAtivSN: $(".s-ativ", el).value || null, cClassTrib: $(".s-ct", el).value.trim(), baseCalculo: Number($(".s-bc", el).value || 0).toFixed(2) };
      const nom = $(".s-nom", el).value.trim();
      if (nom) it[nom.length === 9 ? "nbs" : "ncm"] = nom;
      if (n) { if ($(".s-trib", el).value) it.tribISSQN = $(".s-trib", el).value; if ($(".s-ret", el).value) it.tpRetISSQN = $(".s-ret", el).value; if ($(".s-bm", el).value) it.tpBM = $(".s-bm", el).value; }
      else it.valorImpostoSeletivo = Number($(".s-is", el).value || 0).toFixed(2);
      return it;
    });
    return op;
  }
  const seloEstado = (e) => `<span class="selo ${e === "CALCULADO" ? "ok" : e === "NAO_CALCULADO" ? "av" : "er"}">${esc({ CALCULADO: "calculado", NAO_CALCULADO: "não calculado", INCONSISTENCIA_ENTRADA: "inconsistência de entrada", NAO_IMPLEMENTADO: "não implementado", FALHA_TECNICA: "falha técnica" }[e] || e)}</span>`;
  const REGRAS = { ANEXO_SEM_ISS: "anexo sem ISS", PADRAO: "padrão (com redistribuição do ISS)", ISS_FORA_DO_SIMPLES: "ISS fora do Simples", ATIVIDADE_SEM_ISS: "atividade sem ISS", ISS_NAO_INCIDE: "ISS não incide", ISENCAO_MUNICIPAL: "isenção municipal", ISS_RETIDO: "ISS retido", ATIVIDADE_NAO_TRIBUTADA: "atividade não tributada", DOCUMENTO: "atividade não admitida no documento" };

  async function calcularSN() {
    await prontoSN;
    const op = montarOperacaoSN();
    const r = motorSN.calcular(op);
    const raw = `<details><summary class="nota">Ver JSON enviado e recebido</summary><p class="nota">Enviado:</p><pre>${esc(JSON.stringify(op, null, 2))}</pre><p class="nota">Recebido:</p><pre>${esc(JSON.stringify(r.corpo, null, 2))}</pre></details>`;
    if (r.status !== 200) {
      $("#sn-res").innerHTML = `<div class="cartao"><h2>Operação recusada</h2><div class="msg er"><b>${esc(r.corpo.title)}</b><ul>${r.corpo.errors.map((e) => `<li>${esc(e.code)} ${esc(e.title)}: ${esc(e.detail)} <small>(${esc(e.pointer)})</small></li>`).join("")}</ul></div>${raw}</div>`;
      return;
    }
    const c = r.corpo, t = c.total || {};
    const res = (c.resolucaoAliquotas && c.resolucaoAliquotas.itens) || [];
    let h = `<div class="cartao"><h2>Resultado</h2><p class="nota">Regime de apuração: <b>${esc(c.oper.regimeApuracao)}</b></p>
      <div class="kpis">
        <div class="kpi"><div class="r">Receita bruta (vRBSN)</div><div class="v">${brl(t.vRBSNtot)}</div></div>
        <div class="kpi"><div class="r">CBS devida</div><div class="v">${brl(t.vCBSSNtot)}</div></div>
        <div class="kpi"><div class="r">IBS devido</div><div class="v">${brl(t.vIBSSNtot)}</div></div>
        <div class="kpi"><div class="r">Pendente/suspenso</div><div class="v">${brl((Number(t.vCBSSNtotPendSusp || 0) + Number(t.vIBSSNtotPendSusp || 0)) || null)}</div></div>
        <div class="kpi"><div class="r">Total de tributos</div><div class="v">${brl(t.totalTributos)}</div></div>
      </div>`;
    const av = (c.resolucaoAliquotas && c.resolucaoAliquotas.avisos) || [];
    if (av.length) h += `<div class="msg av">${av.map(esc).join("<br>")}</div>`;
    h += `<div class="tabela"><table><thead><tr><th>Item</th><th>Situação</th><th>Anexo e par de alíquotas</th><th class="n">Receita</th><th class="n">CBS</th><th class="n">IBS</th><th class="n">Total</th></tr></thead><tbody>`;
    for (const o of c.objetos) {
      const ri = res.find((x) => x.numero === o.nObj) || {};
      const tc = o.tribCalc || {};
      const anexo = ri.anexoAplicado ? `Anexo ${esc(ri.anexoAplicado)} · ${esc(REGRAS[ri.regraAliquota] || ri.regraAliquota || "")}` : esc(ri.motivo ? ri.motivo.replace(/_/g, " ").toLowerCase() : "");
      h += `<tr><td>${o.nObj}</td><td>${seloEstado(o.estadoItem)}</td><td>${anexo}</td><td class="n">${brl(tc.vRBSNitem)}</td>
        <td class="n">${brl(tc.vCBSSN)}<br><small>${pctTxt(tc.pCBSSN)}</small></td><td class="n">${brl(tc.vIBSSN)}<br><small>${pctTxt(tc.pIBSSN)}</small></td><td class="n">${brl(tc.totalItem)}</td></tr>`;
      const extra = [];
      if (o.motivoEstado) extra.push(esc(o.motivoEstado.descricao));
      for (const e of o.erros || []) extra.push(`<span style="color:var(--erro)">${esc(e.code)} ${esc(e.title)}: ${esc(e.detail)}</span>`);
      for (const a of ri.avisos || []) extra.push(`<span style="color:var(--aviso)">${esc(a)}</span>`);
      if (tc.memoriaCalculo) extra.push(`<details><summary>Memória de cálculo</summary><b>CBS:</b> ${esc(tc.memoriaCalculo.cbs)}${tc.memoriaCalculo.ibs ? "<br><b>IBS:</b> " + esc(tc.memoriaCalculo.ibs) : ""}</details>`);
      if (extra.length) h += `<tr><td></td><td colspan="6" class="memoria">${extra.join("<br>")}</td></tr>`;
    }
    h += `</tbody></table></div>${raw}</div>`;
    $("#sn-res").innerHTML = h;
  }

  prontoSN.then(() => {
    const docs = motorSN.tiposDoc($("#sn-data").value);
    $("#sn-tpdoc").innerHTML = docs.map((d) => `<option value="${d.modelo}">${d.modelo} – ${esc(d.descricao)}</option>`).join("");
    $("#sn-tpdoc").value = "55";
    addItem({ ativ: "01", nom: "84713012" });
    atualizarRegime();
  });
  $("#sn-tpdoc").addEventListener("change", atualizarRegime);
  $("#sn-data").addEventListener("change", preencherAtividades);
  $("#sn-add").addEventListener("click", () => addItem({ ativ: "01" }));
  $("#sn-calc").addEventListener("click", calcularSN);

  /* ---------- DANFSe ---------- */
  let ultimoPdf = null;
  $("#df-arquivo").addEventListener("change", async (e) => { const f = e.target.files[0]; if (f) $("#df-xml").value = await f.text(); });
  $("#df-exemplo").addEventListener("click", async () => { $("#df-xml").value = await (await fetch("exemplos/nfse-exemplo.xml")).text(); });
  $("#df-gerar").addEventListener("click", async () => {
    const xml = $("#df-xml").value.trim();
    if (!xml) { $("#df-msg").innerHTML = `<div class="msg er">Escolha um arquivo XML ou cole o conteúdo da NFS-e.</div>`; return; }
    $("#df-msg").innerHTML = `<p class="nota">Gerando… (na primeira vez o gerador é baixado)</p>`;
    $("#df-preview").innerHTML = ""; $("#df-salvar").hidden = true;
    try {
      const { pdf } = await DanfseRTC.gerarDanfse(xml, { stc: $("#df-stc").value, canhoto: $("#df-canhoto").checked });
      ultimoPdf = pdf;
      $("#df-msg").innerHTML = `<div class="msg" style="background:var(--ok-bg);color:var(--ok)">DANFSe gerado (${(pdf.length / 1024).toFixed(0)} KB). Use “Salvar PDF” para guardar o arquivo.</div>`;
      $("#df-salvar").hidden = false;
      await mostrarPdf(pdf);
    } catch (e) {
      $("#df-msg").innerHTML = `<div class="msg er"><b>Não foi possível gerar o DANFSe.</b> ${esc(e.message)}</div>`;
    }
  });
  $("#df-salvar").addEventListener("click", async () => {
    if (!ultimoPdf) return;
    const r = await salvarArquivo("danfse.pdf", new Blob([ultimoPdf], { type: "application/pdf" }));
    if (r === "erro") $("#df-msg").insertAdjacentHTML("beforeend", `<div class="msg er">Não foi possível salvar o arquivo nesta visualização.</div>`);
  });
  async function mostrarPdf(bytes) {
    const lib = window.pdfjsLib;
    if (!lib) return;
    const doc = await lib.getDocument({ data: bytes.slice(0) }).promise;
    const alvo = $("#df-preview");
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const vp = pg.getViewport({ scale: 2 });
      const cv = document.createElement("canvas");
      cv.width = vp.width; cv.height = vp.height;
      cv.style.cssText = "width:100%;max-width:820px;display:block;margin:12px auto;border:1px solid var(--borda);background:#fff";
      alvo.append(cv);
      await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    }
  }
})();
