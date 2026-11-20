#!/usr/bin/env node
// Vigia do documento: avisa quais seções do Main Sourcebook mudaram. Só avisa; não altera dados.
//
// Uso (a partir da raiz do repositório):
//   node ferramentas/vigiar-documento.mjs                  baixa o documento, compara com docs/vigia/secoes.json
//   node ferramentas/vigiar-documento.mjs --arquivo f.txt  usa um .txt local em vez de baixar (teste à mão)
//   node ferramentas/vigiar-documento.mjs gravar           grava o estado novo em docs/vigia/secoes.json (com salvaguardas)
//   node ferramentas/vigiar-documento.mjs promover         guarda o texto novo no cache para a próxima comparação
//   node ferramentas/vigiar-documento.mjs combinar R [A]   junta o relatório R ao corpo antigo A da issue e imprime o corpo novo
//
// Códigos de saída: 0 = checou (com ou sem mudança), 2 = o download não devolveu o documento, 3 = estado recusado.
// O texto do documento nunca vai para o repositório: só o hash de cada seção (docs/vigia/secoes.json).
// O texto anterior fica numa pasta de cache (.cache-vigia/), que o GitHub Actions guarda com actions/cache.
// Sem dependências: só o Node (24 ou mais novo).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const URL_DOCUMENTO =
  'https://docs.google.com/document/d/1ILzH_MYYTsS40Dx4YnnqbGiFaHiqVRZD-yJBEz4CnEg/export?format=txt';
export const TITULO_ISSUE_MUDOU = 'Documento oficial mudou';
export const TITULO_ISSUE_FALHOU = 'Vigia do documento falhou';

// Um documento que passa deste tamanho e traz estes títulos é, com folga, o Main Sourcebook.
const TAMANHO_MINIMO = 50_000;
const TITULOS_ESPERADOS = ['Prelude', 'Basic Rules', 'Origins', 'Bindings', 'Heritages'];
const MIN_SECOES = 10;
const LIMITE_LISTA = 12;

// ───────────────────────────── normalização ─────────────────────────────

/** Tira BOM, troca CRLF por LF, apara espaços no fim das linhas e junta linhas em branco repetidas. */
export function normalizar(texto) {
  return String(texto)
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

// ───────────────────────────── divisão por títulos ─────────────────────────────

const RE_SUMARIO = /^(.+?)[ \t]{2,}(\d+)$/;

/** Lê o sumário do começo do documento (linhas "Título   página"). Devolve { titulos, fim }. */
export function lerSumario(linhas) {
  let i = linhas.findIndex((l) => l.trim() === 'Contents');
  if (i < 0) return { titulos: [], fim: 0 };
  const titulos = [];
  i += 1;
  for (; i < linhas.length; i++) {
    const m = linhas[i].match(RE_SUMARIO);
    if (!m) {
      if (titulos.length && linhas[i].trim() === '') break;
      if (!titulos.length && linhas[i].trim() === '') continue;
      break;
    }
    const titulo = m[1].trim();
    if (titulo !== 'Contents') titulos.push(titulo);
  }
  return { titulos, fim: i };
}

/**
 * Divide o texto normalizado em seções, na ordem do sumário.
 * Devolve { secoes: [{ chave, titulo, texto }], naoLocalizadas: [titulo] }.
 * A chave é o título; título repetido ganha "#2", "#3"…
 */
export function dividir(textoNormalizado) {
  const linhas = textoNormalizado.split('\n');
  const { titulos, fim } = lerSumario(linhas);
  const achados = [];
  const naoLocalizadas = [];
  let pos = fim;
  for (const titulo of titulos) {
    let j = -1;
    for (let k = pos; k < linhas.length; k++) {
      if (linhas[k].trim() === titulo) { j = k; break; }
    }
    if (j < 0) { naoLocalizadas.push(titulo); continue; }
    achados.push({ titulo, linha: j });
    pos = j + 1;
  }
  const vistos = new Map();
  const secoes = achados.map((a, idx) => {
    const ate = idx + 1 < achados.length ? achados[idx + 1].linha : linhas.length;
    const n = (vistos.get(a.titulo) ?? 0) + 1;
    vistos.set(a.titulo, n);
    return {
      chave: n === 1 ? a.titulo : `${a.titulo}#${n}`,
      titulo: a.titulo,
      texto: linhas.slice(a.linha, ate).join('\n').trim() + '\n',
    };
  });
  return { secoes, naoLocalizadas };
}

export function hashTexto(texto) {
  return createHash('sha256').update(texto, 'utf8').digest('hex').slice(0, 32);
}

/** Estado novo: { versao, ultimaChecagem, secoes: { chave: hash } } e o texto de cada seção (para o cache). */
export function montarEstado(textoBruto, agora = new Date()) {
  const texto = normalizar(textoBruto);
  const { secoes, naoLocalizadas } = dividir(texto);
  const hashes = {};
  for (const s of secoes) hashes[s.chave] = hashTexto(s.texto);
  return {
    estado: { versao: 1, ultimaChecagem: agora.toISOString(), secoes: hashes },
    secoes,
    naoLocalizadas,
    texto,
  };
}

// ───────────────────────────── validação do download ─────────────────────────────

/** Confere se o que voltou do download é mesmo o documento. */
export function validarDocumento({ status = 200, tipo = '', corpo = '' } = {}) {
  if (status !== 200) return { ok: false, motivo: `o download devolveu HTTP ${status}` };
  if (/text\/html/i.test(tipo)) return { ok: false, motivo: 'o download devolveu uma página HTML (login, aviso ou erro), não o texto do documento' };
  const texto = normalizar(corpo);
  if (Buffer.byteLength(texto, 'utf8') < TAMANHO_MINIMO) {
    return { ok: false, motivo: `o texto devolvido é pequeno demais (${Buffer.byteLength(texto, 'utf8')} bytes; esperado pelo menos ${TAMANHO_MINIMO})` };
  }
  if (/<html[\s>]|<!doctype html/i.test(texto.slice(0, 2000))) {
    return { ok: false, motivo: 'o texto começa como HTML, não como o documento' };
  }
  const { secoes, naoLocalizadas } = dividir(texto);
  const faltam = TITULOS_ESPERADOS.filter((t) => !secoes.some((s) => s.titulo === t));
  if (faltam.length) return { ok: false, motivo: `faltam títulos que o documento sempre teve: ${faltam.join(', ')}` };
  if (secoes.length < MIN_SECOES) return { ok: false, motivo: `só ${secoes.length} seção(ões) localizada(s); esperado pelo menos ${MIN_SECOES}` };
  return { ok: true, secoes: secoes.length, naoLocalizadas };
}

// ───────────────────────────── comparação ─────────────────────────────

/** Compara os hashes de dois estados. */
export function compararEstados(anterior, atual) {
  const a = anterior?.secoes ?? {};
  const b = atual?.secoes ?? {};
  const mudadas = Object.keys(b).filter((k) => k in a && a[k] !== b[k]);
  const novas = Object.keys(b).filter((k) => !(k in a));
  const removidas = Object.keys(a).filter((k) => !(k in b));
  return { mudadas, novas, removidas, houveMudanca: Boolean(mudadas.length || novas.length || removidas.length) };
}

function contar(linhas) {
  const m = new Map();
  for (const l of linhas) { const k = l.trim(); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}
function diferenca(de, para) {
  const r = [];
  for (const [k, n] of de) { const resto = n - (para.get(k) ?? 0); for (let i = 0; i < resto; i++) r.push(k); }
  return r;
}
const RE_NUM = /\d[\d.,]*%?/g;
function numerosDistintos(linhas) {
  const s = new Set();
  for (const l of linhas) for (const n of l.match(RE_NUM) ?? []) s.add(n.replace(/[.,]+$/, ''));
  return s;
}

/**
 * Resumo curto da diferença entre duas versões de uma seção. Só contagens e números, nunca trechos do texto.
 * Os números são os valores distintos que só aparecem de um lado (até 12 de cada lado; `outros` conta o resto).
 */
export function resumirSecao(textoAnterior, textoAtual) {
  const antes = textoAnterior.split('\n');
  const depois = textoAtual.split('\n');
  const removidas = diferenca(contar(antes), contar(depois));
  const adicionadas = diferenca(contar(depois), contar(antes));
  const nAntes = numerosDistintos(removidas);
  const nDepois = numerosDistintos(adicionadas);
  const saiu = [...nAntes].filter((n) => !nDepois.has(n));
  const entrou = [...nDepois].filter((n) => !nAntes.has(n));
  return {
    linhasAdicionadas: adicionadas.length,
    linhasRemovidas: removidas.length,
    numerosQueSairam: saiu.slice(0, LIMITE_LISTA),
    numerosQueEntraram: entrou.slice(0, LIMITE_LISTA),
    outros: Math.max(0, saiu.length - LIMITE_LISTA) + Math.max(0, entrou.length - LIMITE_LISTA),
  };
}

function linhaResumo(chave, r) {
  if (!r) return `- **${chave}**: mudou (sem o texto anterior no cache, não há detalhe).`;
  const partes = [`+${r.linhasAdicionadas} / −${r.linhasRemovidas} linhas`];
  if (r.numerosQueSairam.length || r.numerosQueEntraram.length) {
    const resto = r.outros ? ` (e mais ${r.outros})` : '';
    partes.push(`números: saíram ${r.numerosQueSairam.join(', ') || '—'}; entraram ${r.numerosQueEntraram.join(', ') || '—'}${resto}`);
  }
  return `- **${chave}**: ${partes.join('; ')}.`;
}

// ───────────────────────────── relatórios (issues) ─────────────────────────────

const dataCurta = (iso) => iso.slice(0, 10);

/** Texto de uma checagem que achou mudança. `resumos` mapeia chave → resumo (ou null sem texto anterior). */
export function relatorioMudanca({ comparacao, resumos = {}, quando, naoLocalizadas = [] }) {
  const L = [`### Checagem de ${dataCurta(quando)}`, ''];
  if (comparacao.mudadas.length) {
    L.push(`**Seções mudadas (${comparacao.mudadas.length})**`, '', ...comparacao.mudadas.map((k) => linhaResumo(k, resumos[k])), '');
  }
  if (comparacao.novas.length) {
    L.push(`**Seções novas (${comparacao.novas.length})**`, '', ...comparacao.novas.map((k) => `- **${k}**`), '');
  }
  if (comparacao.removidas.length) {
    L.push(`**Seções removidas (${comparacao.removidas.length})**`, '', ...comparacao.removidas.map((k) => `- **${k}**`), '');
  }
  if (naoLocalizadas.length) {
    L.push(`Títulos do sumário que não foram achados no texto: ${naoLocalizadas.join(', ')}.`, '');
  }
  return L.join('\n').trimEnd() + '\n';
}

const CABECALHO_MUDOU = [
  'O vigia comparou o documento oficial (Main Sourcebook) com a última versão registrada e achou diferenças.',
  'O vigia só avisa: ele não altera dados nem a referência. Para tratar uma seção, refaça a conferência dela e feche esta issue quando terminar.',
  '',
].join('\n');

const MAX_HISTORICO = 10;

/** Junta a checagem nova ao corpo que a issue já tem (a mais nova no topo; guarda as últimas 10). */
export function combinarCorpo(relatorioNovo, corpoAntigo = '') {
  const blocos = corpoAntigo
    ? corpoAntigo.split(/\n(?=### Checagem de )/).filter((b) => b.startsWith('### Checagem de '))
    : [];
  return CABECALHO_MUDOU + '\n' + [relatorioNovo.trimEnd(), ...blocos.map((b) => b.trimEnd())].slice(0, MAX_HISTORICO).join('\n\n') + '\n';
}

export function relatorioFalha({ motivo, quando }) {
  return [
    `O vigia não conseguiu ler o documento em ${dataCurta(quando)}.`,
    '',
    `**Motivo:** ${motivo}.`,
    '',
    'O estado guardado (`docs/vigia/secoes.json`) **não** foi alterado. Rode o workflow de novo à mão (aba Actions → "Vigia do documento" → Run workflow) quando o documento estiver acessível. Se o documento mudou de endereço ou deixou de ser público para leitura por link, ajuste `URL_DOCUMENTO` em `ferramentas/vigiar-documento.mjs`.',
    '',
    'Esta issue é fechada sozinha na próxima checagem que der certo.',
    '',
  ].join('\n');
}

// ───────────────────────────── estado em disco ─────────────────────────────

export function estadoUtilizavel(estado, anterior) {
  const n = Object.keys(estado?.secoes ?? {}).length;
  if (n < MIN_SECOES) return { ok: false, motivo: `o estado novo só tem ${n} seção(ões)` };
  const nAnt = Object.keys(anterior?.secoes ?? {}).length;
  if (nAnt && n < nAnt / 2) return { ok: false, motivo: `o estado novo (${n}) tem menos da metade das seções do estado anterior (${nAnt})` };
  return { ok: true };
}

function lerJson(caminho) {
  if (!existsSync(caminho)) return null;
  try { return JSON.parse(readFileSync(caminho, 'utf8')); } catch { return null; }
}

function escreverJson(caminho, obj) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/** Guarda o texto de cada seção no cache (uma pasta com um arquivo por seção) para a próxima comparação. */
export function gravarCache(pasta, secoes) {
  const mapa = {};
  for (const s of secoes) mapa[s.chave] = s.texto;
  escreverJson(join(pasta, 'secoes-texto.json'), mapa);
}

export function lerCache(pasta) {
  return lerJson(join(pasta, 'secoes-texto.json')) ?? {};
}

// ───────────────────────────── execução ─────────────────────────────

async function baixar(url) {
  const resp = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'WaifuCatalogBuilder-vigia' } });
  return { status: resp.status, tipo: resp.headers.get('content-type') ?? '', corpo: await resp.text() };
}

function argumento(args, nome, padrao) {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
}

export async function checar({ raiz, arquivoLocal, agora = new Date(), baixarFn = baixar }) {
  const caminhoEstado = join(raiz, 'docs', 'vigia', 'secoes.json');
  const pastaCache = join(raiz, '.cache-vigia');
  const pastaSaida = join(raiz, '.vigia-saida');
  mkdirSync(pastaSaida, { recursive: true });
  const quando = agora.toISOString();

  let resposta;
  try {
    resposta = arquivoLocal
      ? { status: 200, tipo: 'text/plain', corpo: readFileSync(arquivoLocal, 'utf8') }
      : await baixarFn(URL_DOCUMENTO);
  } catch (e) {
    resposta = { status: 0, tipo: '', corpo: '', erro: e.message };
  }
  const valido = resposta.erro
    ? { ok: false, motivo: `o download falhou (${resposta.erro})` }
    : validarDocumento(resposta);

  if (!valido.ok) {
    writeFileSync(join(pastaSaida, 'issue-falhou.md'), relatorioFalha({ motivo: valido.motivo, quando }), 'utf8');
    escreverJson(join(pastaSaida, 'resultado.json'), { resultado: 'falhou', motivo: valido.motivo, quando });
    return { resultado: 'falhou', motivo: valido.motivo };
  }

  const novo = montarEstado(resposta.corpo, agora);
  const anterior = lerJson(caminhoEstado);
  const semBase = !anterior || !Object.keys(anterior.secoes ?? {}).length;
  const comparacao = semBase
    ? { mudadas: [], novas: [], removidas: [], houveMudanca: false }
    : compararEstados(anterior, novo.estado);

  escreverJson(join(pastaSaida, 'secoes.novo.json'), novo.estado);
  gravarCache(join(pastaSaida, 'cache-novo'), novo.secoes);

  let resultado = semBase ? 'base' : comparacao.houveMudanca ? 'mudou' : 'sem-mudanca';
  if (resultado === 'mudou') {
    const cache = lerCache(pastaCache);
    const resumos = {};
    for (const s of novo.secoes) {
      if (comparacao.mudadas.includes(s.chave)) resumos[s.chave] = s.chave in cache ? resumirSecao(cache[s.chave], s.texto) : null;
    }
    writeFileSync(
      join(pastaSaida, 'issue-mudou.md'),
      relatorioMudanca({ comparacao, resumos, quando, naoLocalizadas: novo.naoLocalizadas }),
      'utf8',
    );
  }
  escreverJson(join(pastaSaida, 'resultado.json'), { resultado, quando, ...comparacao, secoes: novo.secoes.length });
  return { resultado, comparacao, secoes: novo.secoes.length };
}

/** Copia o estado novo sobre o estado do repositório, se passar nas salvaguardas. */
export function gravarEstado({ raiz }) {
  const novo = lerJson(join(raiz, '.vigia-saida', 'secoes.novo.json'));
  const caminho = join(raiz, 'docs', 'vigia', 'secoes.json');
  const anterior = lerJson(caminho);
  const veredito = estadoUtilizavel(novo, anterior);
  if (!veredito.ok) return { gravado: false, motivo: veredito.motivo };
  escreverJson(caminho, novo);
  return { gravado: true };
}

/** Depois que o estado foi gravado, o texto novo vira o "anterior" da próxima semana. */
export function promoverCache({ raiz }) {
  const origem = join(raiz, '.vigia-saida', 'cache-novo', 'secoes-texto.json');
  if (!existsSync(origem)) return false;
  mkdirSync(join(raiz, '.cache-vigia'), { recursive: true });
  copyFileSync(origem, join(raiz, '.cache-vigia', 'secoes-texto.json'));
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const raiz = resolve(argumento(args, '--raiz', join(dirname(fileURLToPath(import.meta.url)), '..')));
  const comando = args[0] && !args[0].startsWith('--') ? args[0] : 'checar';
  if (comando === 'gravar') {
    const r = gravarEstado({ raiz });
    console.log(r.gravado ? 'Estado gravado em docs/vigia/secoes.json.' : `Estado NÃO gravado: ${r.motivo}.`);
    process.exit(r.gravado ? 0 : 3);
  } else if (comando === 'combinar') {
    const relatorio = readFileSync(args[1], 'utf8');
    const antigo = args[2] && existsSync(args[2]) ? readFileSync(args[2], 'utf8') : '';
    process.stdout.write(combinarCorpo(relatorio, antigo));
  } else if (comando === 'promover') {
    console.log(promoverCache({ raiz }) ? 'Cache atualizado.' : 'Nada para promover.');
  } else {
    const r = await checar({ raiz, arquivoLocal: argumento(args, '--arquivo') });
    if (r.resultado === 'falhou') { console.error(`Falhou: ${r.motivo}.`); process.exit(2); }
    console.log(`Resultado: ${r.resultado} (${r.secoes} seções).`);
    if (r.resultado === 'mudou') {
      const c = r.comparacao;
      console.log(`Mudadas: ${c.mudadas.length}; novas: ${c.novas.length}; removidas: ${c.removidas.length}.`);
    }
  }
}
