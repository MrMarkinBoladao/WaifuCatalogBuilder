import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { montarPagina, montarScript, limparModulo, declaracoesDeTopo, carregarDados, MODULOS } from '../ferramentas/montar.mjs';
import { exportarTexto } from '../fonte/texto.js';
import { calcular } from '../fonte/motor.js';
import { TEXTOS, IDIOMAS, t, definirIdioma } from '../fonte/idiomas.js';
import { economia, categorias, dados } from './fixtures/dados-exemplo.mjs';
import { estadoMedio } from './exemplos.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const le = (rel) => readFileSync(join(raiz, rel), 'utf8');

function dadosDaPagina() {
  const cats = {};
  for (const [k, v] of Object.entries(categorias)) {
    cats[k] = { titulo: k, opcoes: v.opcoes.map((o) => ({ ...o, referencia: 'trecho que não pode ir para a página' })) };
  }
  return { versaoDocumento: economia.versaoDocumento, economia, categorias: cats };
}

// ---------------------------------------------------------------------------
// A página montada

test('carregarDados tira o campo "referencia" das opções antes de ir para a página', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'wcb-dados-'));
  try {
    writeFileSync(join(pasta, 'economia.json'), JSON.stringify(economia));
    writeFileSync(join(pasta, '_pendencias.json'), '[]');
    writeFileSync(join(pasta, 'talents.json'), JSON.stringify({
      categoria: 'talents', titulo: 'Talents',
      opcoes: [{ id: 'talents/x', nome: 'X', categoria: 'talents', custo: { tipo: 'gratis' }, resumo: 'r', verificado: true, referencia: 'referencia/talents.md#x' }],
    }));
    const d = carregarDados(pasta);
    assert.deepEqual(Object.keys(d.categorias), ['talents']);
    assert.equal('referencia' in d.categorias.talents.opcoes[0], false);
    assert.equal(d.categorias.talents.opcoes[0].nome, 'X');
    const html = montarPagina(d);
    assert.ok(!html.includes('referencia/talents.md'));
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('o JSON da página não quebra o <script> mesmo com "<" e separadores de linha nos dados', () => {
  const d = dadosDaPagina();
  d.categorias.talents.opcoes[0].resumo = 'abre </script><b> e separador   e  ';
  const html = montarPagina(d);
  const m = html.match(/<script id="dados" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'bloco de dados presente');
  const lido = JSON.parse(m[1]);
  assert.equal(lido.categorias.talents.opcoes[0].resumo, 'abre </script><b> e separador   e  ');
  assert.equal((html.match(/<\/script>/g) || []).length, 2, 'só os dois </script> da própria página');
});

test('a montagem recusa nome repetido entre módulos', () => {
  assert.deepEqual(declaracoesDeTopo('export const a = 1;\nfunction b() {}\nlet c;\nclass D {}\n  const dentro = 1;'), ['a', 'b', 'c', 'D']);
  const nomes = new Map();
  for (const m of MODULOS) {
    for (const n of declaracoesDeTopo(le('fonte/' + m))) {
      assert.ok(!nomes.has(n), n + ' repetido em ' + nomes.get(n) + ' e ' + m);
      nomes.set(n, m);
    }
  }
});

test('limparModulo tira import e export e deixa o resto', () => {
  const src = "import { a } from './x.js';\nexport function f() { return 1; }\nexport const g = 2;\nexport { f, g };\n";
  const out = limparModulo(src);
  assert.ok(!/import|export/.test(out));
  assert.ok(out.includes('function f()') && out.includes('const g = 2'));
});

test('o script montado roda sem document e dá os mesmos resultados dos módulos', () => {
  const script = montarScript();
  const contexto = vm.createContext({ console });
  // Sem `document` o final do script não inicia a interface; devolvemos o objeto WCB para conferir.
  vm.runInContext(script + '\nglobalThis.__WCB = WCB;', contexto);
  const W = contexto.__WCB;
  for (const nome of ['calcular', 'exportarTexto', 'importarTexto', 'estadoVazio', 'iniciar', 't', 'definirIdioma']) {
    assert.equal(typeof W[nome], 'function', nome + ' exportado pelo script');
  }
  const estado = estadoMedio();
  const direto = exportarTexto(estado, dados);
  const noScript = W.exportarTexto(JSON.parse(JSON.stringify(estado)), JSON.parse(JSON.stringify(dados)));
  assert.equal(noScript, direto);
  const r1 = calcular(estado, dados);
  const r2 = W.calcular(JSON.parse(JSON.stringify(estado)), JSON.parse(JSON.stringify(dados)));
  assert.equal(r2.conferencia.saldoFinal, r1.conferencia.saldoFinal);
});

// ---------------------------------------------------------------------------
// Idiomas

function chavesDaInterface() {
  const src = le('fonte/interface.js');
  const fixas = new Set();
  const prefixos = new Set();
  for (const m of src.matchAll(/\bt\('([^']+)'/g)) {
    // 't('cp.entrada.' + x)' deixa um prefixo que termina em ponto.
    if (m[1].endsWith('.')) prefixos.add(m[1]);
    else fixas.add(m[1]);
  }
  return { fixas, prefixos };
}

test('todo texto que a interface pede existe em português e em inglês', () => {
  const { fixas, prefixos } = chavesDaInterface();
  assert.ok(fixas.size > 100, 'achou as chaves da interface (' + fixas.size + ')');
  for (const idioma of IDIOMAS) {
    for (const k of fixas) assert.ok(k in TEXTOS[idioma], idioma + ' sem a chave ' + k);
    for (const p of prefixos) assert.ok(Object.keys(TEXTOS[idioma]).some((k) => k.startsWith(p)), idioma + ' sem chaves de ' + p);
  }
});

test('as chaves que a interface monta por prefixo cobrem todos os valores possíveis', () => {
  const esperados = [
    ...['compra', 'captura', 'gratis', 'origem', 'yeet'].map((x) => 'cp.entrada.' + x),
    ...['companion', 'follower', 'familiar', 'figurante'].map((x) => 'cp.papel.' + x),
    ...['no séquito', 'vendida'].map((x) => 'cp.estado.' + x),
    ...['NÃO CONFIRMADO', 'NÃO IMPLEMENTADA', 'ERRO', 'AVISO'].map((x) => 'etiqueta.' + x),
  ];
  for (const idioma of IDIOMAS) for (const k of esperados) assert.ok(k in TEXTOS[idioma], idioma + ' sem ' + k);
});

test('português e inglês têm as mesmas chaves, os mesmos {n} e a mesma forma plural', () => {
  const pt = Object.keys(TEXTOS.pt).sort();
  const en = Object.keys(TEXTOS.en).sort();
  assert.deepEqual(en, pt);
  const marcadores = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const k of pt) {
    assert.equal(marcadores(TEXTOS.en[k]), marcadores(TEXTOS.pt[k]), 'marcadores de ' + k);
    assert.equal(TEXTOS.en[k].includes('|'), TEXTOS.pt[k].includes('|'), 'plural de ' + k);
    assert.ok(TEXTOS.pt[k].trim() && TEXTOS.en[k].trim(), 'texto vazio em ' + k);
  }
});

test('t() troca marcadores, escolhe singular ou plural e cai no português', () => {
  definirIdioma('pt');
  assert.equal(t('topo.erros', 1), '1 erro');
  assert.equal(t('topo.erros', 3), '3 erros');
  assert.equal(t('contrato.limite', 400), 'Limite de empréstimo para esta Intensity: 400.');
  definirIdioma('en');
  assert.equal(t('topo.erros', 1), '1 error');
  assert.equal(t('topo.erros', 0), '0 errors');
  assert.equal(t('chave.que.nao.existe'), 'chave.que.nao.existe');
  definirIdioma('xx');
  assert.equal(t('topo.saldo'), 'Saldo');
});

test('os textos do idioma que o motor produz (etiquetas dos avisos) existem para toda etiqueta do formato', () => {
  const etiquetas = new Set();
  for (const m of le('docs/formato-da-build.md').matchAll(/`\[([A-ZÃÇ ]+)\]`/g)) etiquetas.add(m[1]);
  assert.deepEqual([...etiquetas].sort(), ['AVISO', 'ERRO', 'NÃO CONFIRMADO', 'NÃO IMPLEMENTADA']);
  for (const e of etiquetas) for (const i of IDIOMAS) assert.ok(('etiqueta.' + e) in TEXTOS[i]);
});
