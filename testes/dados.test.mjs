import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validar } from '../ferramentas/validar-dados.mjs';
import { BLOCOS, REGRAS_ESPECIAIS } from '../fonte/motor.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const economia = JSON.parse(readFileSync(join(raiz, 'dados', 'economia.json'), 'utf8'));

const op = (categoria, slug, nome, extra) => ({
  id: categoria + '/' + slug, nome, categoria, custo: { tipo: 'fixo', valor: 5 },
  resumo: 'Ele ganha um poder de teste, com limite curto.', verificado: true, referencia: categoria + '.md', ...extra,
});

// Monta um conjunto mínimo válido: uma opção por categoria. `mexer` altera o conjunto antes de gravar.
function montar(mexer = () => {}, { pendencias = '', regras = '', referencia = null, esquema = null } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'wcb-validar-'));
  const dados = join(base, 'dados');
  const docs = join(base, 'docs');
  mkdirSync(dados);
  mkdirSync(docs);
  const conjunto = {};
  for (const b of BLOCOS) conjunto[b.categoria] = [op(b.categoria, 'exemplo', 'Exemplo ' + b.titulo)];
  mexer(conjunto);
  writeFileSync(join(dados, 'economia.json'), JSON.stringify(economia));
  for (const b of BLOCOS) {
    writeFileSync(join(dados, b.categoria + '.json'), JSON.stringify({
      categoria: b.categoria, titulo: b.titulo, versaoDocumento: economia.versaoDocumento, opcoes: conjunto[b.categoria],
    }));
  }
  const ids = Object.keys(REGRAS_ESPECIAIS).map((i) => '`' + i + '`').join('\n');
  writeFileSync(join(docs, 'pendencias-de-dados.md'), pendencias || '`economia/precoPorTier`\n');
  writeFileSync(join(docs, 'regras-especiais.md'), regras || ids + '\n');
  if (esquema) writeFileSync(join(docs, 'esquema-de-dados.md'), esquema);
  let pastaRef = null;
  if (referencia) {
    pastaRef = join(base, 'referencia');
    mkdirSync(pastaRef);
    for (const [arq, txt] of Object.entries(referencia)) writeFileSync(join(pastaRef, arq), txt);
  }
  return { dados, docs, referencia: pastaRef, limpar: () => rmSync(base, { recursive: true, force: true }) };
}

function rodar(mexer, opcoes) {
  const m = montar(mexer, opcoes);
  try {
    return validar({ dados: m.dados, docs: m.docs, referencia: m.referencia });
  } finally {
    m.limpar();
  }
}
const temErro = (r, trecho) => r.erros.some((e) => e.includes(trecho));

test('um conjunto mínimo válido passa sem erro', () => {
  const r = rodar();
  assert.deepEqual(r.erros, []);
  assert.equal(r.opcoes.length, BLOCOS.length);
});

test('campo desconhecido, campo que falta e id fora do formato são erro', () => {
  assert.ok(temErro(rodar((c) => { c.talents[0].gratisTexto = 'x'; }), 'campo desconhecido: gratisTexto'));
  assert.ok(temErro(rodar((c) => { delete c.talents[0].resumo; }), 'falta o campo resumo'));
  assert.ok(temErro(rodar((c) => { c.talents[0].id = 'Talents/Exemplo'; }), 'id fora do formato'));
  assert.ok(temErro(rodar((c) => { c.talents[0].id = 'defenses/exemplo-x'; }), 'prefixo do id'));
});

test('id repetido é erro', () => {
  const r = rodar((c) => { c.talents.push(op('talents', 'exemplo', 'Outro')); });
  assert.ok(temErro(r, 'id repetido'));
});

test('custo: valor não inteiro, sequência sem lista e fórmula sem regra especial são erro', () => {
  assert.ok(temErro(rodar((c) => { c.talents[0].custo = { tipo: 'fixo', valor: '5' }; }), 'precisa de "valor" inteiro'));
  assert.ok(temErro(rodar((c) => { c.talents[0].custo = { tipo: 'sequencia', valores: [] }; }), 'precisa de "valores"'));
  assert.ok(temErro(rodar((c) => { c.talents[0].custo = { tipo: 'formula', descricao: 'x' }; }), 'exige regraEspecial'));
  assert.ok(temErro(rodar((c) => { c.talents[0].custo = { tipo: 'porEscolha' }; }), 'exige escolha do tipo lista'));
  const ok = rodar((c) => { c.talents[0].custo = { tipo: 'formula', descricao: 'x' }; c.talents[0].regraEspecial = 'custo-textual'; });
  assert.deepEqual(ok.erros, []);
});

test('requisito, brinde e exclusão apontam só para ids que existem', () => {
  assert.ok(temErro(rodar((c) => { c.talents[0].requisitos = { id: 'talents/nao-existe' }; }), 'id inexistente'));
  assert.ok(temErro(rodar((c) => { c.talents[0].gratis = [{ id: 'talents/nao-existe' }]; }), 'gratis aponta para id inexistente'));
  assert.ok(temErro(rodar((c) => { c.talents[0].exclusoes = ['talents/nao-existe']; }), 'exclusoes aponta para id inexistente'));
  assert.ok(temErro(rodar((c) => { c.talents[0].requisitos = { id: 'defenses/exemplo', minimo: 2 }; }), 'minimo'));
  const ok = rodar((c) => {
    c.talents[0].requisitos = { todos: [{ id: 'defenses/exemplo' }, { nao: { origem: 'extra' } }, { declarado: 'conhece alguém' }] };
    c.talents[0].gratis = [{ id: 'defenses/exemplo', quantidade: 2 }];
  });
  assert.deepEqual(ok.erros, []);
});

test('requisito com forma desconhecida ou com duas formas é erro', () => {
  assert.ok(temErro(rodar((c) => { c.talents[0].requisitos = { origem: 'nunca-existiu' }; }), 'origem desconhecida'));
  assert.ok(temErro(rodar((c) => { c.talents[0].requisitos = { id: 'talents/exemplo', origem: 'extra' }; }), 'uma forma só'));
  assert.ok(temErro(rodar((c) => { c.talents[0].requisitos = { grupo: 'grupo-que-nao-existe' }; }), 'grupo inexistente'));
});

test('o mesmo grupo em duas categorias é erro', () => {
  const r = rodar((c) => { c.talents[0].grupo = 'grupo-x'; c.defenses[0].grupo = 'grupo-x'; });
  assert.ok(temErro(r, 'usado em duas categorias'));
});

test('verificado false exige linha em pendencias-de-dados.md', () => {
  const sem = rodar((c) => { c.talents[0].verificado = false; });
  assert.ok(temErro(sem, 'verificado false sem linha'));
  const com = rodar((c) => { c.talents[0].verificado = false; }, { pendencias: '`economia/precoPorTier`\n- `talents/exemplo`: valor numa imagem.\n' });
  assert.deepEqual(com.erros, []);
});

test('regraEspecial precisa existir no motor e em docs/regras-especiais.md', () => {
  assert.ok(temErro(rodar((c) => { c.talents[0].regraEspecial = 'regra-inventada'; }), 'não existe em REGRAS_ESPECIAIS'));
  const r = rodar((c) => { c.talents[0].regraEspecial = 'custo-textual'; }, { regras: '`defense-rebates`\n' });
  assert.ok(temErro(r, 'não está em docs/regras-especiais.md'));
  assert.ok(temErro(r, 'existe no motor e falta em docs/regras-especiais.md'));
});

test('desconto por arquétipo e por membro exigem a regra especial certa', () => {
  const d = { id: 'a', tipo: 'porArquetipo' };
  assert.ok(temErro(rodar((c) => { c.talents[0].descontos = [d]; }), 'exige regraEspecial desconto-por-arquetipo'));
  assert.deepEqual(rodar((c) => { c.talents[0].descontos = [d]; c.talents[0].regraEspecial = 'desconto-por-arquetipo'; }).erros, []);
  assert.ok(temErro(rodar((c) => { c.talents[0].descontos = [{ id: 'c', tipo: 'condicao', percentual: 150, condicao: 'x' }]; }), 'percentual inteiro entre 1 e 100'));
});

test('resumo em inglês ou grande demais é erro', () => {
  assert.ok(temErro(rodar((c) => { c.talents[0].resumo = 'He can use the power when your friend will agree.'; }), 'parece estar em inglês'));
  assert.ok(temErro(rodar((c) => { c.talents[0].resumo = 'x'.repeat(421); }), 'resumo grande demais'));
});

test('categoria com título errado ou sem arquivo é erro', () => {
  const m = montar();
  try {
    writeFileSync(join(m.dados, 'talents.json'), JSON.stringify({ categoria: 'talents', titulo: 'Outro', versaoDocumento: economia.versaoDocumento, opcoes: [op('talents', 'x', 'X')] }));
    const r = validar({ dados: m.dados, docs: m.docs });
    assert.ok(temErro(r, 'titulo" precisa ser "Talents"'));
    rmSync(join(m.dados, 'defenses.json'));
    assert.ok(temErro(validar({ dados: m.dados, docs: m.docs }), 'falta dados/defenses.json'));
  } finally {
    m.limpar();
  }
});

test('economia: bloco não confirmado exige aviso e linha em pendencias-de-dados.md', () => {
  const m = montar();
  try {
    const eco = JSON.parse(JSON.stringify(economia));
    eco.venda.verificado = false;
    writeFileSync(join(m.dados, 'economia.json'), JSON.stringify(eco));
    const r = validar({ dados: m.dados, docs: m.docs });
    assert.ok(temErro(r, 'economia.json/venda: verificado false exige "aviso"'));
    assert.ok(temErro(r, 'economia.json/venda: verificado false sem linha'));
  } finally {
    m.limpar();
  }
});

test('referência: nome precisa bater com um título, e título de opção sem opção em dados/ é erro', () => {
  const ref = {};
  for (const b of BLOCOS) ref[b.categoria + '.md'] = '# ' + b.titulo + '\n\n## Exemplo ' + b.titulo + '\n\n- **Custo:** 5.\n';
  ref['talents.md'] += '\n## Talento Esquecido\n\n- **Custo:** 10.\n';
  const mexer = () => {};
  const r = rodar(mexer, { referencia: ref });
  assert.ok(temErro(r, 'o título "Talento Esquecido" descreve uma opção e não tem opção'));
  const justificado = rodar(mexer, { referencia: ref, pendencias: '`economia/precoPorTier`\n`sem-opcao: talents.md#Talento Esquecido`\n' });
  assert.deepEqual(justificado.erros, []);
  const errado = rodar((c) => { c.talents[0].nome = 'Nome Que Não Existe'; }, { referencia: ref });
  assert.ok(temErro(errado, 'não bate com nenhum título'));
});

test('o exemplo de docs/esquema-de-dados.md precisa ser igual à opção de dados/', () => {
  const o = op('talents', 'exemplo', 'Exemplo Talents');
  const doc = (x) => '## Exemplo\n\n```json\n' + JSON.stringify({ opcoes: [x] }, null, 2) + '\n```\n';
  assert.deepEqual(rodar(() => {}, { esquema: doc(o) }).erros, []);
  assert.ok(temErro(rodar(() => {}, { esquema: doc({ ...o, custo: { tipo: 'fixo', valor: 6 } }) }), 'diverge de dados/'));
});
