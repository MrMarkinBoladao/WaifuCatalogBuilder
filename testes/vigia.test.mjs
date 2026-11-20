// Testes do vigia do documento, com textos inventados (nenhum trecho do documento real).
// Rodar: node --test testes/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  normalizar, lerSumario, dividir, hashTexto, montarEstado, validarDocumento, compararEstados,
  resumirSecao, relatorioMudanca, relatorioFalha, combinarCorpo, estadoUtilizavel,
  checar, gravarEstado, promoverCache, TITULO_ISSUE_MUDOU,
} from '../ferramentas/vigiar-documento.mjs';

const TITULOS = ['Prelude', 'Basic Rules', 'Costs', 'Origins', 'Bindings', 'Lures', 'Heritages', 'Talents', 'Defenses', 'Other Perks', 'Additional Rules', 'Credits'];

/** Documento inventado, grande o bastante para passar na validação. `alt` troca o corpo de uma seção. */
function documentoFalso({ alt = {}, sumarioPaginas = 0, sem = [], crlf = false, bom = false } = {}) {
  const titulos = TITULOS.filter((t) => !sem.includes(t));
  const L = ['Contents', `Contents        ${1 + sumarioPaginas}`];
  titulos.forEach((t, i) => L.push(`${t}        ${3 + i + sumarioPaginas}`));
  L.push('', '');
  for (const t of titulos) {
    L.push(t);
    const corpo = alt[t] ?? Array.from({ length: 120 }, (_, i) => `Linha ${i} inventada da seção ${t}: custa ${i % 7 + 1} créditos e dura ${i % 5 + 1} dias.`).join('\n');
    L.push(corpo, '');
  }
  let texto = L.join('\n');
  if (crlf) texto = texto.replace(/\n/g, '\r\n');
  return (bom ? '﻿' : '') + texto;
}

const resposta = (corpo, extra = {}) => ({ status: 200, tipo: 'text/plain; charset=utf-8', corpo, ...extra });
function raizTemp() { return mkdtempSync(join(tmpdir(), 'vigia-')); }

test('normalizar tira BOM, CRLF, espaços no fim e linhas em branco repetidas', () => {
  const r = normalizar('﻿a  \r\nb \r\n\r\n\r\n\r\nc\r\n');
  assert.equal(r, 'a\nb\n\nc\n');
});

test('lerSumario lê os títulos e ignora o próprio "Contents"', () => {
  const linhas = normalizar(documentoFalso()).split('\n');
  const { titulos } = lerSumario(linhas);
  assert.deepEqual(titulos, TITULOS);
});

test('dividir separa por títulos na ordem do sumário e marca título repetido', () => {
  const texto = normalizar(
    ['Contents', 'Contents        1', 'Um        2', 'Dois        3', 'Um        4', '', '', 'Um', 'a', 'Dois', 'b', 'Um', 'c', ''].join('\n'),
  );
  const { secoes } = dividir(texto);
  assert.deepEqual(secoes.map((s) => s.chave), ['Um', 'Dois', 'Um#2']);
  assert.match(secoes[0].texto, /^Um\na/);
  assert.match(secoes[2].texto, /^Um\nc/);
});

test('dividir relata título do sumário que não está no texto', () => {
  const texto = normalizar(['Contents', 'A        1', 'B        2', '', 'A', 'x', ''].join('\n'));
  const { secoes, naoLocalizadas } = dividir(texto);
  assert.deepEqual(secoes.map((s) => s.chave), ['A']);
  assert.deepEqual(naoLocalizadas, ['B']);
});

test('o número de página do sumário não muda o hash de nenhuma seção', () => {
  const a = montarEstado(documentoFalso()).estado.secoes;
  const b = montarEstado(documentoFalso({ sumarioPaginas: 4 })).estado.secoes;
  assert.deepEqual(a, b);
});

test('BOM e CRLF não mudam o hash', () => {
  const a = montarEstado(documentoFalso()).estado.secoes;
  const b = montarEstado(documentoFalso({ crlf: true, bom: true })).estado.secoes;
  assert.deepEqual(a, b);
});

test('hashTexto é estável e muda com uma letra', () => {
  assert.equal(hashTexto('abc'), hashTexto('abc'));
  assert.notEqual(hashTexto('abc'), hashTexto('abd'));
  assert.equal(hashTexto('abc').length, 32);
});

test('compararEstados acha seção mudada, nova e removida', () => {
  const antes = { secoes: { A: '1', B: '2', C: '3' } };
  const depois = { secoes: { A: '1', B: '9', D: '4' } };
  assert.deepEqual(compararEstados(antes, depois), { mudadas: ['B'], novas: ['D'], removidas: ['C'], houveMudanca: true });
  assert.equal(compararEstados(antes, antes).houveMudanca, false);
});

test('resumirSecao conta linhas e números, sem trazer texto', () => {
  const antes = 'Título\nCusta 10 créditos.\nDura 5 dias.\n';
  const depois = 'Título\nCusta 15 créditos.\nDura 5 dias.\nLinha nova sem número.\n';
  const r = resumirSecao(antes, depois);
  assert.equal(r.linhasAdicionadas, 2);
  assert.equal(r.linhasRemovidas, 1);
  assert.deepEqual(r.numerosQueSairam, ['10']);
  assert.deepEqual(r.numerosQueEntraram, ['15']);
  assert.ok(!JSON.stringify(r).includes('Custa'));
});

test('validarDocumento aceita o documento inventado', () => {
  const v = validarDocumento(resposta(documentoFalso()));
  assert.equal(v.ok, true);
  assert.equal(v.secoes, TITULOS.length);
});

test('validarDocumento recusa HTTP de erro, HTML, texto pequeno, título faltando e vazio', () => {
  assert.equal(validarDocumento({ status: 403, tipo: 'text/html', corpo: 'x' }).ok, false);
  assert.equal(validarDocumento(resposta('<!DOCTYPE html><html>Faça login</html>', { tipo: 'text/html' })).ok, false);
  assert.equal(validarDocumento(resposta('<html>' + 'x'.repeat(60_000))).ok, false);
  assert.equal(validarDocumento(resposta('curto')).ok, false);
  assert.equal(validarDocumento(resposta('')).ok, false);
  const semBindings = validarDocumento(resposta(documentoFalso({ sem: ['Bindings'] })));
  assert.equal(semBindings.ok, false);
  assert.match(semBindings.motivo, /Bindings/);
});

test('relatórios: a mudança cita seções e o da falha diz o motivo, sem texto do documento', () => {
  const quando = '2026-11-27T07:00:00.000Z';
  const rel = relatorioMudanca({
    comparacao: { mudadas: ['Talents'], novas: ['Nova'], removidas: ['Velha'], houveMudanca: true },
    resumos: { Talents: { linhasAdicionadas: 1, linhasRemovidas: 1, numerosQueSairam: ['5'], numerosQueEntraram: ['10'] } },
    quando,
  });
  assert.match(rel, /Checagem de 2026-11-27/);
  assert.match(rel, /Talents.*\+1 \/ −1/);
  assert.match(rel, /Nova/);
  assert.match(rel, /Velha/);
  assert.match(relatorioFalha({ motivo: 'HTTP 403', quando }), /HTTP 403/);
});

test('combinarCorpo põe a checagem nova no topo e guarda só as dez últimas', () => {
  let corpo = '';
  for (let i = 1; i <= 12; i++) corpo = combinarCorpo(`### Checagem de 2026-11-${String(i).padStart(2, '0')}\n\n- x\n`, corpo);
  const datas = [...corpo.matchAll(/### Checagem de (\S+)/g)].map((m) => m[1]);
  assert.equal(datas.length, 10);
  assert.equal(datas[0], '2026-11-12');
  assert.equal(datas[9], '2026-11-03');
});

test('estadoUtilizavel recusa estado vazio e estado com menos da metade das seções', () => {
  const bom = { secoes: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`S${i}`, 'h'])) };
  assert.equal(estadoUtilizavel({ secoes: {} }, bom).ok, false);
  assert.equal(estadoUtilizavel({ secoes: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`S${i}`, 'h'])) }, bom).ok, false);
  assert.equal(estadoUtilizavel(bom, bom).ok, true);
});

test('fluxo: base, sem mudança, mudança e falha; o estado do repositório só muda ao gravar', async () => {
  const raiz = raizTemp();
  try {
    const caminhoEstado = join(raiz, 'docs', 'vigia', 'secoes.json');
    const sempre = (corpo) => async () => resposta(corpo);

    // 1. Sem estado anterior: base.
    let r = await checar({ raiz, baixarFn: sempre(documentoFalso()), agora: new Date('2026-11-20T10:00:00Z') });
    assert.equal(r.resultado, 'base');
    assert.equal(existsSync(caminhoEstado), false, 'checar não grava o estado oficial');
    assert.equal(gravarEstado({ raiz }).gravado, true);
    assert.equal(promoverCache({ raiz }), true);
    const base = JSON.parse(readFileSync(caminhoEstado, 'utf8'));
    assert.equal(Object.keys(base.secoes).length, TITULOS.length);
    assert.equal(base.ultimaChecagem, '2026-11-20T10:00:00.000Z');

    // 2. Mesmo documento: sem mudança, sem issue.
    r = await checar({ raiz, baixarFn: sempre(documentoFalso()), agora: new Date('2026-11-27T10:00:00Z') });
    assert.equal(r.resultado, 'sem-mudanca');
    assert.equal(existsSync(join(raiz, '.vigia-saida', 'issue-mudou.md')), false);

    // 3. Uma seção muda e uma some: issue com as duas, e o resumo usa o texto do cache.
    const alterado = documentoFalso({
      sem: ['Credits'],
      alt: { Talents: 'Talents\nLinha 0 inventada da seção Talents: custa 777 créditos e dura 1 dias.' },
    });
    r = await checar({ raiz, baixarFn: sempre(alterado), agora: new Date('2026-12-04T10:00:00Z') });
    assert.equal(r.resultado, 'mudou');
    assert.deepEqual(r.comparacao.mudadas, ['Talents']);
    assert.deepEqual(r.comparacao.removidas, ['Credits']);
    const issue = readFileSync(join(raiz, '.vigia-saida', 'issue-mudou.md'), 'utf8');
    assert.match(issue, /Talents.*\+\d+ \/ −\d+ linhas/);
    assert.match(issue, /777/);
    assert.ok(!issue.includes('inventada'), 'a issue não leva texto do documento');
    assert.equal(JSON.parse(readFileSync(caminhoEstado, 'utf8')).ultimaChecagem, base.ultimaChecagem, 'estado oficial intocado');

    // 4. Falha de download: não mexe no estado e escreve a issue de falha.
    const antes = readFileSync(caminhoEstado, 'utf8');
    r = await checar({ raiz, baixarFn: async () => resposta('<html>login</html>', { tipo: 'text/html' }) });
    assert.equal(r.resultado, 'falhou');
    assert.match(readFileSync(join(raiz, '.vigia-saida', 'issue-falhou.md'), 'utf8'), /HTML/);
    assert.equal(readFileSync(caminhoEstado, 'utf8'), antes);
    // Em falha, `gravar` encontra o estado novo da checagem anterior; não o usa para esvaziar nada.
    assert.equal(JSON.parse(readFileSync(caminhoEstado, 'utf8')).secoes.Prelude.length, 32);

    // 5. Erro de rede.
    r = await checar({ raiz, baixarFn: async () => { throw new Error('ENOTFOUND'); } });
    assert.equal(r.resultado, 'falhou');
    assert.match(r.motivo, /ENOTFOUND/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('gravarEstado recusa um estado novo vazio e não apaga o bom', () => {
  const raiz = raizTemp();
  try {
    mkdirSync(join(raiz, 'docs', 'vigia'), { recursive: true });
    mkdirSync(join(raiz, '.vigia-saida'), { recursive: true });
    const bom = { versao: 1, ultimaChecagem: 'x', secoes: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`S${i}`, 'h'])) };
    writeFileSync(join(raiz, 'docs', 'vigia', 'secoes.json'), JSON.stringify(bom));
    writeFileSync(join(raiz, '.vigia-saida', 'secoes.novo.json'), JSON.stringify({ versao: 1, ultimaChecagem: 'y', secoes: {} }));
    const r = gravarEstado({ raiz });
    assert.equal(r.gravado, false);
    assert.deepEqual(JSON.parse(readFileSync(join(raiz, 'docs', 'vigia', 'secoes.json'), 'utf8')), bom);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('o título da issue é o combinado', () => {
  assert.equal(TITULO_ISSUE_MUDOU, 'Documento oficial mudou');
});
