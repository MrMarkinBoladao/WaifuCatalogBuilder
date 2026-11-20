import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATO_BACKUP, MAX_SALVAMENTOS, ErroDeBackup, novoId, nomeSugerido, criarSalvamento, apagarSalvamento, acharSalvamento,
  lerListaGuardada, guardarLista, montarBackup, lerBackup, mesclarSalvamentos, nomeDeArquivoDoSalvamento, nomeDeArquivoDoBackup,
} from '../fonte/saves.js';
import { exportarTexto, importarEConferir } from '../fonte/texto.js';
import { calcular } from '../fonte/motor.js';
import { dados } from './fixtures/dados-exemplo.mjs';
import { estadoMedio } from './exemplos.mjs';

const TEXTO = 'WAIFU CATALOG BUILD\nFormato: wcb/1\n';
const dia = (n) => new Date(Date.UTC(2026, 10, n, 12, 0, 0));

test('criar salvamento põe o mais novo no começo e sugere o nome quando falta', () => {
  let lista = [];
  lista = criarSalvamento(lista, { nome: 'Primeira', texto: TEXTO }, dia(1));
  lista = criarSalvamento(lista, { nome: '  ', texto: TEXTO, resumo: { contractor: 'Aiko', intensity: 2, saldo: 25 } }, dia(2));
  assert.equal(lista.length, 2);
  assert.equal(lista[0].nome, 'Aiko 2026-11-02');
  assert.deepEqual(lista[0].resumo, { contractor: 'Aiko', intensity: 2, saldo: 25 });
  assert.equal(lista[1].nome, 'Primeira');
  assert.equal(nomeSugerido(null, dia(3)), 'Versão 2026-11-03');
});

test('criar salvamento recusa texto que não é de build e lista cheia', () => {
  assert.throws(() => criarSalvamento([], { nome: 'x', texto: 'qualquer coisa' }, dia(1)), ErroDeBackup);
  let lista = [];
  for (let i = 0; i < MAX_SALVAMENTOS; i++) lista = criarSalvamento(lista, { nome: 'v' + i, texto: TEXTO }, new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
  assert.throws(() => criarSalvamento(lista, { nome: 'a mais', texto: TEXTO }, dia(5)), /Limite/);
});

test('o id nunca repete, nem no mesmo instante', () => {
  const t = dia(4);
  let lista = criarSalvamento([], { nome: 'a', texto: TEXTO }, t);
  lista = criarSalvamento(lista, { nome: 'b', texto: TEXTO }, t);
  lista = criarSalvamento(lista, { nome: 'c', texto: TEXTO }, t);
  assert.equal(new Set(lista.map((s) => s.id)).size, 3);
  assert.notEqual(novoId(lista, t), lista[0].id);
});

test('apagar e achar salvamento', () => {
  const lista = criarSalvamento(criarSalvamento([], { nome: 'a', texto: TEXTO }, dia(1)), { nome: 'b', texto: TEXTO }, dia(2));
  const [b, a] = lista;
  assert.equal(acharSalvamento(lista, a.id).nome, 'a');
  assert.deepEqual(apagarSalvamento(lista, a.id).map((s) => s.nome), ['b']);
  assert.equal(acharSalvamento(apagarSalvamento(lista, b.id), b.id), null);
});

test('a lista guardada no navegador volta igual, e entrada estragada vira lista vazia ou perde só o item ruim', () => {
  const lista = criarSalvamento(criarSalvamento([], { nome: 'a', texto: TEXTO }, dia(1)), { nome: 'b', texto: TEXTO }, dia(2));
  assert.deepEqual(lerListaGuardada(guardarLista(lista)), lista);
  assert.deepEqual(lerListaGuardada(null), []);
  assert.deepEqual(lerListaGuardada('{não é json'), []);
  assert.deepEqual(lerListaGuardada('{"a":1}'), []);
  const mista = JSON.stringify([lista[0], { id: 'x', nome: 'sem texto' }, lista[0], 42]);
  assert.deepEqual(lerListaGuardada(mista), [lista[0]]);
});

test('backup: montar e ler dá os mesmos salvamentos, o rascunho e o idioma', () => {
  const salvamentos = criarSalvamento(criarSalvamento([], { nome: 'a', texto: TEXTO + 'x' }, dia(1)), { nome: 'b', texto: TEXTO + 'y' }, dia(2));
  const json = montarBackup({ salvamentos, rascunho: TEXTO + 'rascunho', idioma: 'en' }, '0.1.0', dia(9));
  const j = JSON.parse(json);
  assert.equal(j.formato, FORMATO_BACKUP);
  assert.equal(j.builder, '0.1.0');
  assert.equal(j.criadoEm, '2026-11-09T12:00:00.000Z');
  const lido = lerBackup(json);
  assert.deepEqual(lido.salvamentos, salvamentos);
  assert.equal(lido.rascunho, TEXTO + 'rascunho');
  assert.equal(lido.idioma, 'en');
  assert.deepEqual(lido.descartados, []);
  assert.equal(lerBackup('﻿' + json).salvamentos.length, 2);
  assert.equal(montarBackup({ salvamentos, rascunho: 'lixo' }, '0.1.0').includes('"rascunho": null'), true);
});

test('backup: arquivo que não é backup, formato desconhecido e item estragado', () => {
  assert.throws(() => lerBackup('não é json'), /não abre/);
  assert.throws(() => lerBackup('{"a":1}'), /falta o campo "formato"/);
  assert.throws(() => lerBackup('{"formato":"wcb-backup/2","salvamentos":[]}'), /desconhecido: "wcb-backup\/2"/);
  assert.throws(() => lerBackup('{"formato":"wcb-backup/1"}'), /lista "salvamentos"/);
  const ok = criarSalvamento([], { nome: 'ok', texto: TEXTO }, dia(1))[0];
  const j = JSON.stringify({ formato: FORMATO_BACKUP, salvamentos: [ok, { id: 'ruim', nome: 'Estragado', criadoEm: 'ontem', texto: TEXTO }, ok] });
  const lido = lerBackup(j);
  assert.deepEqual(lido.salvamentos, [ok]);
  assert.deepEqual(lido.descartados, ['Estragado', 'ok']);
  assert.equal(lido.idioma, 'pt');
});

test('mesclar: não duplica o igual, dá id novo ao id repetido com texto diferente, respeita o limite', () => {
  const a = criarSalvamento([], { nome: 'a', texto: TEXTO + '1' }, dia(1));
  const igual = mesclarSalvamentos(a, a);
  assert.equal(igual.novos, 0);
  assert.equal(igual.lista.length, 1);
  const mesmoIdOutroTexto = [{ ...a[0], texto: TEXTO + '2' }];
  const m = mesclarSalvamentos(a, mesmoIdOutroTexto);
  assert.equal(m.novos, 1);
  assert.equal(m.lista.length, 2);
  assert.equal(new Set(m.lista.map((s) => s.id)).size, 2);
  const muitos = [];
  for (let i = 0; i < MAX_SALVAMENTOS + 5; i++) muitos.push({ id: 'm' + i, nome: 'm' + i, criadoEm: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(), texto: TEXTO });
  const cheia = mesclarSalvamentos([], muitos);
  assert.equal(cheia.lista.length, MAX_SALVAMENTOS);
  assert.equal(cheia.lista[0].id, 'm' + (MAX_SALVAMENTOS + 4), 'ficam os mais recentes');
});

test('nomes de arquivo sem acento, sem espaço e com data', () => {
  assert.equal(nomeDeArquivoDoSalvamento({ nome: 'Aiko — Versão final!' }), 'waifu-catalog-aiko-versao-final.txt');
  assert.equal(nomeDeArquivoDoSalvamento({ nome: '???' }), 'waifu-catalog-build.txt');
  assert.equal(nomeDeArquivoDoBackup(dia(9)), 'waifu-catalog-backup-2026-11-09.json');
});

test('um salvamento reabre a mesma build: texto exportado, importado e exportado de novo é igual', () => {
  const texto = exportarTexto(estadoMedio(), dados);
  const lista = criarSalvamento([], { nome: 'médio', texto }, dia(1));
  const lido = lerBackup(montarBackup({ salvamentos: lista }, '0.1.0', dia(2)));
  const r = importarEConferir(lido.salvamentos[0].texto, dados);
  assert.equal(exportarTexto(r.estado, dados), texto);
  assert.equal(calcular(r.estado, dados).conferencia.saldoFinal, calcular(estadoMedio(), dados).conferencia.saldoFinal);
});
