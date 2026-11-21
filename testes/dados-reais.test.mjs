// Testes do motor e do texto sobre os dados reais de dados/ (não sobre o conjunto pequeno de testes/fixtures).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { calcular, estadoVazio } from '../fonte/motor.js';
import { exportarTexto, importarTexto } from '../fonte/texto.js';
import { carregarDados } from '../ferramentas/montar.mjs';
import { validar } from '../ferramentas/validar-dados.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dados = carregarDados();
const todas = Object.values(dados.categorias).flatMap((c) => c.opcoes);

function base(extra) {
  const e = estadoVazio();
  e.dr = 3;
  e.intensity = ['intensity/hardcore', 'intensity/interesting-times']; // Intensity 5
  e.origem = { id: 'origens/drop-in', escolha: '' };
  e.emprestimo = 100;
  return Object.assign(e, extra || {});
}
const achar = (r, nome) => {
  for (const b of r.blocos) for (const l of b.linhas) if (l.nome === nome) return l;
  return null;
};
const linhas = (r, nome) => r.blocos.flatMap((b) => b.linhas).filter((l) => l.nome === nome);
const avisosDe = (r, etiqueta) => r.avisos.filter((a) => a.etiqueta === etiqueta).map((a) => a.texto);
const errosSemDivida = (r) => avisosDe(r, 'ERRO').filter((t) => !/Saldo final negativo/.test(t));
const gastoDe = (r, cat) => r.blocos.find((b) => b.categoria === cat).subtotal.gastos;

test('os arquivos de dados/ passam no conferidor de dados', () => {
  const r = validar({ dados: join(raiz, 'dados'), docs: join(raiz, 'docs') });
  assert.deepEqual(r.erros, []);
  assert.equal(r.opcoes.length, todas.length);
});

test('os dados têm as 330 opções esperadas, sem id repetido', () => {
  assert.equal(todas.length, 330);
  assert.equal(new Set(todas.map((o) => o.id)).size, todas.length);
});

test('nenhum resumo ou campo da página traz texto longo demais ou o campo "referencia"', () => {
  for (const o of todas) {
    assert.ok(o.resumo.length <= 420, o.id + ': resumo longo demais');
    assert.equal(o.referencia, undefined, o.id + ': referencia não vai para a página');
  }
});

// ---------------------------------------------------------------------------
// Ida e volta do texto para toda opção

function escolhaPadrao(op) {
  const e = op.escolha;
  if (!e) return undefined;
  if (e.tipo === 'texto') return 'Exemplo';
  if (e.tipo === 'lista' || e.tipo === 'opcao') {
    const v = (e.opcoes || [])[0];
    return v ? v.valor : undefined;
  }
  return undefined;
}

test('toda opção, comprada sozinha, calcula, exporta e importa de volta sem mudar o texto', () => {
  for (const op of todas) {
    if (op.categoria === 'intensity') {
      const e = base({ intensity: [op.id] });
      const t1 = exportarTexto(e, dados);
      const { estado } = importarTexto(t1, dados);
      assert.equal(exportarTexto(estado, dados), t1, op.id);
      continue;
    }
    const e = base();
    if (op.categoria === 'origens') e.origem = { id: op.id, escolha: op.id.endsWith('possess') || op.id.endsWith('substitute') ? 'Exemplo, tier 3' : escolhaPadrao(op) || '' };
    else {
      const c = { id: op.id };
      const esc = escolhaPadrao(op);
      if (esc !== undefined) c.escolha = [esc];
      e.compras = [c];
    }
    let r;
    assert.doesNotThrow(() => { r = calcular(e, dados); }, op.id);
    const t1 = exportarTexto(e, dados);
    const { estado } = importarTexto(t1, dados);
    assert.equal(exportarTexto(estado, dados), t1, op.id + ': ida e volta mudou o texto');
    assert.ok(Number.isFinite(r.conferencia.saldoFinal), op.id + ': saldo não é número');
  }
});

// ---------------------------------------------------------------------------
// Custos e brindes conferidos com o documento

test('Mystic Tattoo, Slave to Art e três Elemental Inkarnation somam 205; o brinde de Mystic Tattoo é de graça', () => {
  const r = calcular(base({
    compras: [
      { id: 'bindings/seal-of-approval' },
      { id: 'bindings/mystic-tattoo' },
      { id: 'bindings/slave-to-art' },
      { id: 'bindings/elemental-inkarnation', quantidade: 3, escolha: ['Luminal', 'Umbral', 'Volcanic'] },
    ],
  }), dados);
  assert.equal(gastoDe(r, 'bindings'), 205);
  assert.equal(achar(r, 'Aesthetic Talent').custo, 0);
  assert.equal(achar(r, 'Aesthetic Talent').gratisDe, 'Mystic Tattoo');
  assert.deepEqual(errosSemDivida(r), []);
});

test('Luxury Goods tem no máximo 5 compras de 5; a sexta é erro', () => {
  const ok = calcular(base({ compras: [{ id: 'bindings/seal-of-approval' }, { id: 'bindings/mystic-tattoo' }, { id: 'bindings/luxury-goods', quantidade: 5, escolha: ['Ouro', 'Prata', 'Platina', 'Diamante', 'Rubi'] }] }), dados);
  assert.equal(achar(ok, 'Luxury Goods').lista, 25);
  const seis = calcular(base({ compras: [{ id: 'bindings/seal-of-approval' }, { id: 'bindings/mystic-tattoo' }, { id: 'bindings/luxury-goods', quantidade: 6, escolha: ['Ouro', 'Prata', 'Platina', 'Diamante', 'Rubi', 'Jade'] }] }), dados);
  assert.ok(avisosDe(seis, 'ERRO').some((t) => /Luxury Goods comprado 6 vezes; o máximo é 5/.test(t)));
});

test('Pocket Star II: Voyages, 13 compras somam 400 em créditos', () => {
  const r = calcular(base({ compras: [{ id: 'sanctuaries-e-strongholds/pocket-star-ii-voyages', quantidade: 13 }] }), dados);
  assert.equal(achar(r, 'Pocket Star II: Voyages').lista, 400);
});

test('Extra: o poder do local de partida escolhido define o custo; sem escolha custa 0', () => {
  const com = calcular(base({ origem: { id: 'origens/extra', escolha: 'Silver-star (tier 7)' } }), dados);
  assert.equal(achar(com, 'Extra').custo, 100);
  const sem = calcular(base({ origem: { id: 'origens/extra', escolha: '' } }), dados);
  assert.equal(achar(sem, 'Extra').custo, 0);
});

test('Possess custa o preço do tier da companion, sem aviso de preço não confirmado', () => {
  const r = calcular(base({ origem: { id: 'origens/possess', escolha: 'Mika Exemplo, tier 6' } }), dados);
  assert.equal(achar(r, 'Possess').custo, 50);
  assert.deepEqual(avisosDe(r, 'NÃO CONFIRMADO'), []);
});

test('Dragon Break dá duas cópias grátis de Paradox Defense, sem desconto de brinde duplicado', () => {
  const r = calcular(base({
    emprestimo: 400,
    compras: [{ id: 'heritages/scaleborn-majesty' }, { id: 'heritages/dragon-break' }, { id: 'outros-perks/bifurcation' }],
  }), dados);
  const copias = linhas(r, 'Paradox Defense');
  assert.equal(copias.length, 2);
  assert.ok(copias.every((l) => l.gratisDe === 'Dragon Break' && l.custo === 0));
  assert.equal(achar(r, 'Dragon Break').desconto, 0);
});

test('brinde de um perk que já foi comprado vira desconto na compra que o deu', () => {
  const r = calcular(base({ emprestimo: 400, compras: [{ id: 'talents/aesthetic-talent' }, { id: 'bindings/seal-of-approval' }, { id: 'bindings/mystic-tattoo' }] }), dados);
  const mt = achar(r, 'Mystic Tattoo');
  assert.equal(mt.lista, 25);
  assert.equal(mt.custo, 15);
  assert.equal(linhas(r, 'Aesthetic Talent').length, 1);
});

// ---------------------------------------------------------------------------
// Requisitos, exclusões e bloqueios

test('Calming Up sem Interesting Times é erro; com ele, não', () => {
  const sem = calcular(base({ intensity: ['intensity/hardcore', 'intensity/calming-up'] }), dados);
  assert.ok(avisosDe(sem, 'ERRO').some((t) => /Calming Up exige/.test(t)));
  const com = calcular(base({ intensity: ['intensity/hardcore', 'intensity/interesting-times', 'intensity/calming-up'] }), dados);
  assert.ok(!avisosDe(com, 'ERRO').some((t) => /Calming Up/.test(t)));
});

test('No Bindings recusa qualquer binding, menos o Empty Hand', () => {
  const nb = ['intensity/hardcore', 'intensity/no-bindings'];
  const r = calcular(base({ intensity: nb, compras: [{ id: 'bindings/seal-of-approval' }] }), dados);
  assert.ok(avisosDe(r, 'ERRO').some((t) => /No Bindings bloqueia bindings/.test(t)));
  const eh = calcular(base({ intensity: nb, compras: [{ id: 'bindings/empty-hand' }] }), dados);
  assert.ok(!avisosDe(eh, 'ERRO').some((t) => /bloqueia/.test(t)));
});

test('Heritages Banned recusa heritages', () => {
  const r = calcular(base({ intensity: ['intensity/hardcore', 'intensity/heritages-banned'], compras: [{ id: 'heritages/dragon-heart' }] }), dados);
  assert.ok(avisosDe(r, 'ERRO').some((t) => /Heritages Banned bloqueia heritages/.test(t)));
});

test('uma opção de Intensity que exclui uma compra (Twilight Zone e Extra, Power Swap Banned e Power Swap) vira erro', () => {
  const tz = calcular(base({ intensity: ['intensity/hardcore', 'intensity/twilight-zone'], origem: { id: 'origens/extra', escolha: 'Padrão (tier 2)' } }), dados);
  assert.ok(avisosDe(tz, 'ERRO').some((t) => /não podem estar na mesma build/.test(t)));
  const ps = calcular(base({ intensity: ['intensity/hardcore', 'intensity/power-swap-banned'], compras: [{ id: 'outros-perks/power-swap', custoManual: 5 }] }), dados);
  assert.ok(avisosDe(ps, 'ERRO').some((t) => /Power Swap Banned e Power Swap/.test(t)));
});

test('duas raízes de binding juntas dão erro de exclusão', () => {
  const r = calcular(base({ compras: [{ id: 'bindings/seal-of-approval' }, { id: 'bindings/empty-hand' }] }), dados);
  assert.ok(avisosDe(r, 'ERRO').some((t) => /se excluem/.test(t)));
});

test('Elder Dragon sem as três heritages exigidas é erro', () => {
  const r = calcular(base({ emprestimo: 400, compras: [{ id: 'heritages/elder-dragon' }] }), dados);
  assert.ok(avisosDe(r, 'ERRO').some((t) => /Requisito não atendido: Elder Dragon/.test(t)));
});

test('Memoria só vale com a origem Possess', () => {
  const sem = calcular(base({ compras: [{ id: 'outros-perks/memoria' }] }), dados);
  assert.ok(avisosDe(sem, 'ERRO').some((t) => /Memoria exige/.test(t)));
  const com = calcular(base({ origem: { id: 'origens/possess', escolha: 'Mika Exemplo, tier 6' }, compras: [{ id: 'outros-perks/memoria' }] }), dados);
  assert.ok(!avisosDe(com, 'ERRO').some((t) => /Memoria/.test(t)));
});

// ---------------------------------------------------------------------------
// Avisos honestos

test('Space Truckin’ não traz [NÃO CONFIRMADO] e traz os requisitos declarados', () => {
  const r = calcular(base({ compras: [{ id: 'lures/space-truckin', declaracoes: [] }] }), dados);
  assert.deepEqual(avisosDe(r, 'NÃO CONFIRMADO'), []);
  const av = avisosDe(r, 'AVISO').filter((t) => /Space Truckin/.test(t));
  assert.equal(av.length, 3);
  assert.ok(av.some((t) => /Scanned land Ride/.test(t)));
});

test('Defenses trazem o aviso de Defense Rebates não implementada', () => {
  const r = calcular(base({ compras: [{ id: 'defenses/body-defense' }] }), dados);
  assert.ok(avisosDe(r, 'NÃO IMPLEMENTADA').some((t) => /Defense Rebates/.test(t) && /Body Defense/.test(t)));
});

test('Heritage com arquétipo traz o aviso de desconto por arquétipo não implementado', () => {
  const r = calcular(base({ emprestimo: 200, compras: [{ id: 'heritages/dragon-heart' }] }), dados);
  assert.ok(avisosDe(r, 'NÃO IMPLEMENTADA').some((t) => /arquétipo/i.test(t) && /Dragon Heart/.test(t)));
});

test('Power Swap e Yoink pedem o custo à mão, e o custo informado vale', () => {
  const r = calcular(base({ compras: [{ id: 'outros-perks/power-swap', custoManual: 12 }, { id: 'outros-perks/yoink', custoManual: 6 }] }), dados);
  assert.equal(achar(r, 'Power Swap').custo, 12);
  assert.equal(achar(r, 'Yoink').custo, 6);
  assert.ok(avisosDe(r, 'NÃO IMPLEMENTADA').length >= 1);
});

// ---------------------------------------------------------------------------
// Achados da auditoria independente

test('duas raízes de Heritage dão erro, e Ancestral Diversity libera', () => {
  const duas = [{ id: 'heritages/dragon-heart' }, { id: 'heritages/its-alive' }];
  const sem = calcular(base({ emprestimo: 400, compras: duas }), dados);
  assert.ok(avisosDe(sem, 'ERRO').some((t) => /se excluem \(grupo heritages-raiz\)/.test(t)));
  const com = calcular(base({ emprestimo: 400, intensity: ['intensity/hardcore', 'intensity/ancestral-diversity'], compras: duas }), dados);
  assert.ok(!avisosDe(com, 'ERRO').some((t) => /heritages-raiz/.test(t)));
});

test('Mother, Mighty dá Talent Sharing de todos os 11 Talents da Lunarian', () => {
  const r = calcular(base({ emprestimo: 400, compras: [{ id: 'heritages/mother-mighty' }] }), dados);
  assert.equal(linhas(r, 'Talent Sharing').filter((l) => l.gratisDe === 'Mother, Mighty').length, 11);
  assert.ok(linhas(r, 'Talent Sharing').every((l) => l.custo === 0));
});

test('Nomad: Pocket Apartment e Stronghold ficam fora, mas All Roads Lead to Home, Sweet Home e Sanctuary continuam à venda', () => {
  const nomad = ['intensity/hardcore', 'intensity/nomad'];
  const ok = calcular(base({
    emprestimo: 400,
    intensity: nomad,
    compras: [
      { id: 'sanctuaries-e-strongholds/all-roads-lead-to-home' },
      { id: 'sanctuaries-e-strongholds/sweet-home', quantidade: 1 },
      { id: 'sanctuaries-e-strongholds/sanctuary', escolha: ['15 créditos'] },
    ],
  }), dados);
  assert.deepEqual(avisosDe(ok, 'ERRO').filter((t) => /Requisito não atendido/.test(t)), []);
  const pa = calcular(base({ intensity: nomad, compras: [{ id: 'sanctuaries-e-strongholds/pocket-apartment' }] }), dados);
  assert.ok(avisosDe(pa, 'ERRO').some((t) => /não podem estar na mesma build/.test(t)));
  const st = calcular(base({ emprestimo: 400, intensity: nomad, compras: [{ id: 'sanctuaries-e-strongholds/sweet-home' }, { id: 'sanctuaries-e-strongholds/stronghold', escolha: ['15 créditos'] }] }), dados);
  assert.ok(avisosDe(st, 'ERRO').some((t) => /Nomad e Stronghold não podem estar na mesma build/.test(t)));
  const lw = calcular(base({ emprestimo: 400, intensity: ['intensity/hardcore', 'intensity/lawless'], compras: [{ id: 'sanctuaries-e-strongholds/sweet-home' }, { id: 'sanctuaries-e-strongholds/sanctuary', escolha: ['15 créditos'] }] }), dados);
  assert.ok(avisosDe(lw, 'ERRO').some((t) => /Lawless e Sanctuary não podem estar na mesma build/.test(t)));
});

test('cláusula de divisão entre captura e venda avisa só quando há captura ou venda', () => {
  const comCaptura = base({
    intensity: ['intensity/hardcore', 'intensity/50-50'],
    companions: [{ nome: 'Taro Exemplo', obra: 'Obra Exemplo', tier: 4, entrada: 'captura', papel: 'companion', estado: 'vendida' }],
  });
  const r = calcular(comCaptura, dados);
  assert.ok(avisosDe(r, 'NÃO IMPLEMENTADA').some((t) => /Divisão entre captura e venda/.test(t) && /50%\/50%/.test(t)));
  const semCaptura = calcular(base({ intensity: ['intensity/hardcore', 'intensity/50-50'] }), dados);
  assert.ok(!avisosDe(semCaptura, 'NÃO IMPLEMENTADA').some((t) => /Divisão entre captura e venda/.test(t)));
  const padrao = calcular({ ...comCaptura, intensity: ['intensity/hardcore'] }, dados);
  assert.ok(!avisosDe(padrao, 'NÃO IMPLEMENTADA').some((t) => /Divisão entre captura e venda/.test(t)));
});
