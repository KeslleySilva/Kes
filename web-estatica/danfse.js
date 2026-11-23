// Gerador de DANFSe no navegador: carrega o WebAssembly oficial do repositório
// ReceitaFederal/calculadora-rtc-gerador-danfse (cmd/danfse-wasm), compilado sem
// alterações e comprimido com gzip para caber na página.
"use strict";
(function () {
  let carregando = null;
  async function carregar() {
    if (window.danfseWasm && window.danfseWasm.ready) return window.danfseWasm;
    carregando ||= (async () => {
      const resp = await fetch("danfse/danfse-gzip.wasm");
      if (!resp.ok) throw new Error("Não foi possível baixar o gerador (" + resp.status + ")");
      let bytes = await resp.arrayBuffer();
      const u8 = new Uint8Array(bytes, 0, 2);
      if (u8[0] === 0x1f && u8[1] === 0x8b) { // gzip: descomprime; se o servidor já descomprimiu, usa direto
        bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
      }
      const go = new Go();
      const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
      go.run(instance); // registra window.danfseWasm e fica rodando
      for (let i = 0; i < 100 && !window.danfseWasm; i++) await new Promise((r) => setTimeout(r, 50));
      if (!window.danfseWasm || !window.danfseWasm.ready) throw new Error((window.danfseWasm && window.danfseWasm.error) || "Gerador não inicializou");
      return window.danfseWasm;
    })();
    return carregando;
  }

  // Retorna { pdf: Uint8Array } ou lança Error com a mensagem do gerador oficial.
  async function gerarDanfse(xml, { stc = 0, canhoto = true } = {}) {
    const w = await carregar();
    const r = w.gerarPdf(JSON.stringify({ xml, stc: Number(stc), canhoto }));
    if (r && r.error) throw new Error(r.error);
    const b64 = r.pdf;
    const bin = atob(b64);
    const pdf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) pdf[i] = bin.charCodeAt(i);
    return { pdf, size: r.size };
  }

  window.DanfseRTC = { carregar, gerarDanfse };
})();
