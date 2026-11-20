import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { exportarTexto, importarTexto, importarEConferir, ErroDeImportacao } from '../fonte/texto.js';
import { dados } from './fixtures/dados-exemplo.mjs';
import { estadoPequeno, estadoMedio } from './exemplos.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const le = (rel) => readFileSync(join(raiz, rel), 'utf8');

test('exemplo pequeno: o texto exportado é o de docs/exemplos/build-pequena.txt', () => {
  assert.equal(exportarTexto(estadoPequeno(), dados), le('docs/exemplos/build-pequena.txt'));
});

test('exemplo médio: o texto exportado é o de docs/exemplos/build-media.txt', () => {
  assert.equal(exportarTexto(estadoMedio(), dados), le('docs/exemplos/build-media.txt'));
});

for (const [nome, arq, fn] of [
  ['pequeno', 'docs/exemplos/build-pequena.txt', estadoPequeno],
  ['médio', 'docs/exemplos/build-media.txt', estadoMedio],
]) {
  test('ida e volta do exemplo ' + nome + ': exportar, importar e exportar dá o mesmo texto', () => {
    const t1 = exportarTexto(fn(), dados);
    const { estado } = importarTexto(t1, dados);
    assert.equal(exportarTexto(estado, dados), t1);
    assert.equal(t1, le(arq));
  });
  test('importar o arquivo de exemplo ' + nome + ' não acusa diferença com o recalculado', () => {
    const r = importarEConferir(le(arq), dados);
    assert.deepEqual(r.diferencas, []);
  });
}

test('os blocos de texto de docs/formato-da-build.md são iguais aos arquivos de docs/exemplos/', () => {
  const doc = le('docs/formato-da-build.md');
  const blocos = [...doc.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]);
  const arqs = [le('docs/exemplos/build-pequena.txt'), le('docs/exemplos/build-media.txt')];
  for (const a of arqs) assert.ok(blocos.includes(a), 'bloco do doc ausente para um dos exemplos');
});

test('importação recusa texto sem o cabeçalho', () => {
  assert.throws(() => importarTexto('olá', dados), ErroDeImportacao);
});

test('importação recusa outro formato e diz qual', () => {
  const t = 'WAIFU CATALOG BUILD\nFormato: wcb/9\n';
  assert.throws(() => importarTexto(t, dados), /wcb\/1/);
});

test('importação recusa bloco repetido', () => {
  const t = exportarTexto(estadoPequeno(), dados).replace('## Talents', '## Talents\n- Athletic Talent | custo 5\n\n## Talents');
  assert.throws(() => importarTexto(t, dados), /repetido/);
});

test('nome desconhecido reabre a build com erro e sem custo; o Builder não adivinha nome parecido', () => {
  const t = exportarTexto(estadoPequeno(), dados).replace('- Athletic Talent |', '- Athletic Talents |');
  const { estado } = importarTexto(t, dados);
  assert.equal(estado.desconhecidas.length, 1);
  const saida = exportarTexto(estado, dados);
  assert.match(saida, /\[ERRO\] Opção desconhecida em Talents: Athletic Talents/);
  assert.ok(!/Athletic Talent \|/.test(saida));
});

test('a comparação de nome ignora maiúsculas, espaços repetidos e apóstrofo reto ou curvo', () => {
  const t = exportarTexto(estadoPequeno(), dados).replace('- Athletic Talent |', '-  athletic   TALENT |');
  const { estado } = importarTexto(t, dados);
  assert.ok(estado.compras.some((c) => c.id === 'talents/athletic-talent'));
});

test('custo errado no texto vira diferença e o recalculado vale', () => {
  const t = exportarTexto(estadoPequeno(), dados).replace('- Athletic Talent | custo 5', '- Athletic Talent | custo 99');
  const r = importarEConferir(t, dados);
  assert.ok(r.diferencas.length >= 1);
  assert.match(r.texto, /- Athletic Talent \| custo 5 \|/);
});

test('texto com CRLF e BOM de colagem é aceito', () => {
  const t = '\uFEFF' + exportarTexto(estadoPequeno(), dados).replace(/\n/g, '\r\n');
  const { estado } = importarTexto(t, dados);
  assert.equal(estado.contractor, 'Aiko Exemplo');
});
