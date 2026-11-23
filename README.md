# Calculadora da Reforma Tributária (CBS, IBS e IS)

Ferramenta web para calcular CBS, IBS e Imposto Seletivo (LC 214/2025) no regime regular, usando a **API oficial da Receita Federal**:
[ReceitaFederal/calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular). Testada com a versão 1.7.2, base V0073 de 09/11/2026.

A ferramenta não reimplementa as regras. Todo cálculo é feito pela calculadora oficial, e a ferramenta cuida da interface, dos formulários, dos cenários prontos e da apresentação dos resultados.

```
navegador ──► ferramenta/servidor.py (porta 8000) ──► API oficial (porta 8080)
              interface web + repasse /api                Java + SQLite com as tabelas oficiais
```

## Como usar

```bash
# 1. Baixar, compilar e subir a API oficial (requer git e Java 21+)
scripts/instalar_api_oficial.sh            # deixa a API em http://localhost:8080/api

# 2. Em outro terminal, subir a interface (apenas Python 3, sem dependências)
python3 ferramenta/servidor.py             # abra http://localhost:8000
```

Se a API estiver em outro endereço: `python3 ferramenta/servidor.py --api http://servidor:8080/api`.

## Versão web (sem servidor)

A pasta `web-estatica/` tem a mesma interface, mas o cálculo roda no navegador:
- **`motor.js`**: tradução para JavaScript dos serviços Java de cálculo da calculadora oficial.
- **`dados/`**: as tabelas oficiais, extraídas do banco por `gerar_dados.py`.

O motor não tem fórmulas próprias. Ele avalia as expressões guardadas na tabela oficial `TRATAMENTO_TRIBUTARIO`, com aritmética decimal e arredondamento HALF_EVEN, como a API.

**Conferência com a API oficial:** `web-estatica/testes/comparar_com_api.js` envia os mesmos casos ao motor e à API v1.7.2 e compara as respostas campo a campo. São 1.219 casos: todas as cClassTribs em 2026 e 2027, compras governamentais, tributação regular, Imposto Seletivo, arredondamento, bases de cálculo e erros. **Todos deram resultado idêntico.**

```bash
NODE_PATH=<pasta com decimal.js> node web-estatica/testes/comparar_com_api.js http://localhost:8080/api/calculadora
```

O que fica só na versão com servidor: XML, pedágio, funções de NFS-e e alguns detalhes de validação de nomenclatura por tipo de documento.

### Simples Nacional e DANFSe (versão web)

- **Simples Nacional:** `web-estatica/motor-simples.js` traduz o cálculo "não assistido" da API oficial [calculadora-rtc-simples-nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional) (`POST /calculadora/observabilidade/simples-nacional/nao-assistido`). O motor escolhe o anexo, o par de alíquotas com ou sem redistribuição do ISS, aplica o regime de apuração e a compra governamental. Os parâmetros vêm das tabelas oficiais. A comparação com a API v1.0.2 (`web-estatica/testes/comparar_simples_com_api.js`) cobriu 2.289 casos, todos idênticos: documentos com CRT e NFS-e, regimes, atividades, campos do ISS, compra governamental de 2027 a 2033, todas as cClassTribs, nomenclatura e erros.
- **DANFSe:** `web-estatica/danfse/` traz o próprio gerador oficial [calculadora-rtc-gerador-danfse](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse), compilado sem alterações pelo ponto de entrada WebAssembly do projeto (`cmd/danfse-wasm`) e comprimido com gzip. O PDF gerado no navegador é idêntico, byte a byte, ao do serviço HTTP oficial. Para recompilar: `GOOS=js GOARCH=wasm go build -ldflags="-s -w" -o danfse.wasm ./cmd/danfse-wasm` (Go 1.27) e depois `gzip -9`.
- `web-estatica/exemplos/nfse-exemplo.xml`: NFS-e de exemplo com dados fictícios.

## Publicar na web (servidor com a API oficial)

O `Dockerfile` monta uma imagem única com a API oficial (Java 25, baixada do repositório da Receita na hora do build) e a interface web. Ela responde em uma só porta (`$PORT`, padrão 8000). Foi testada com 512 MB de memória: sobe em cerca de 12 segundos e aguenta os 1.219 casos de teste em sequência. Os limites de memória do Java em `JAVA_OPTS` são necessários: sem eles, o processo era encerrado por falta de memória com carga.

**Render (plano gratuito):**
1. Crie uma conta em https://render.com e conecte seu GitHub.
2. Clique em **New + → Blueprint** e escolha este repositório e o branch. O Render lê o `render.yaml`.
3. Clique em **Apply**. O primeiro build leva de 5 a 10 minutos. Depois disso, a ferramenta fica em `https://calculadora-rtc-XXXX.onrender.com`.

No plano gratuito, o serviço "dorme" após 15 minutos sem acesso. O primeiro acesso depois disso leva cerca de 1 minuto.

**Qualquer outro serviço com Docker (Railway, Fly.io, VPS):**
```bash
docker build -t calculadora-rtc .
docker run -p 8000:8000 calculadora-rtc        # http://localhost:8000
```
Para fixar uma versão da calculadora oficial, use `docker build --build-arg RTC_REF=<tag-ou-commit> .`.

## O que a ferramenta faz

| Aba | O que faz |
|---|---|
| **Calcular operação** | Formulário com data, UF/município, tipo de documento, compra governamental e vários itens (NCM/NBS, CST e cClassTrib carregados das tabelas oficiais, base, alíquotas, IS e tributação regular). Mostra os totais, o resultado por item, a alíquota efetiva, o diferimento e a memória de cálculo. Gera e valida o XML do grupo de tributação (NF-e, NFC-e, CT-e, BP-e, NF3-e). |
| **Cenários prontos** | 55 cenários que cobrem os endpoints da API, com explicação. Cada um pode ser executado ou aberto na calculadora para edição. |
| **Base de cálculo** | Base unificada da NF-e/NFC-e: regime geral, IS e Simples Nacional, com a vigência de cada componente. |
| **Consultas** | NCM, NBS, cClassTrib, vínculo NCM/NBS × cClassTrib, indicadores de operação da NFS-e, alíquotas de referência, fundamentação legal, redutores de compra governamental e códigos de erro. |

## Demonstração e cobertura

```bash
python3 demo/executar_cenarios.py   # roda os 55 cenários e grava as respostas reais em demo/resultados/
python3 demo/mapa_cobertura.py      # testa cada cClassTrib e lista o que a calculadora oficial ainda não implementa
```

O catálogo de cenários fica em `cenarios/cenarios.json`. A interface e a demonstração usam o mesmo arquivo.

## Regras importantes da API oficial

- **2026 (ano-teste):** a API usa as alíquotas de referência cadastradas (CBS 0,9% e IBS 0,1%). O campo `aliquotasNominais` é proibido.
- **A partir de 2027:** `aliquotasNominais` é obrigatório em cada item. O resultado sai como *cálculo simulado* (header `x-warning-dados-simulados`).
- `/regime-geral` rejeita a operação inteira (HTTP 422) se um item tiver erro. `/observabilidade/regime-geral` devolve o erro por item e calcula os demais.
- **Ainda não implementado na v1.7.2** (resposta "Classificação tributária em desenvolvimento"): monofasia de combustíveis (620001 a 620007), incorporação/parcelamento imobiliário (221002 a 221004), transferência de crédito (800001 e 800002), ajustes (810001, 811001 a 811003) e 830001.
- O resultado é uma simulação de apoio. Não substitui a apuração oficial nem a análise tributária do caso concreto.
