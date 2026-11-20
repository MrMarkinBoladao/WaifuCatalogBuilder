import test from 'node:test';
import assert from 'node:assert/strict';
import { calcular, estadoVazio, intensityDaConta, distribuirDesconto, precoDaCompra, requisitoAtendido, REGRAS_ESPECIAIS } from '../fonte/motor.js';
import { exportarTexto, importarTexto } from '../fonte/texto.js';
import { dados, economia } from './fixtures/dados-exemplo.mjs';

function base(extra) {
  const e = estadoVazio();
  e.dr = 3;
  e.intensity = ['intensity/hardcore', 'intensity/interesting-times']; // Intensity 5
  e.origem = { id: 'origens/drop-in', escolha: '' };
  return Object.assign(e, extra || {});
}
const achar = (r, nome) => {
  for (const b of r.blocos) for (const l of b.linhas) if (l.nome === nome) return l;
  return null;
};
const avisosDe = (r, etiqueta) => r.avisos.filter((a) => a.etiqueta === etiqueta).map((a) => a.texto);

test('Intensity: 1 de base mais as cláusulas; piso 0 com erro; teto 10 só para budget e pagamentos', () => {
  assert.deepEqual(intensityDaConta(3, economia), { base: 1, conta: 4, valida: true, efetiva: 4 });
  assert.equal(intensityDaConta(-5, economia).valida, false);
  assert.equal(intensityDaConta(-5, economia).efetiva, 0);
  const i12 = intensityDaConta(12, economia);
  assert.equal(i12.conta, 13);
  assert.equal(i12.efetiva, 10);
});

test('Intensity abaixo de 0 vira [ERRO]', () => {
  const r = calcular(base({ intensity: ['intensity/open-exploration', 'intensity/open-exploration', 'intensity/is-there-anybody-out-there', '50-50'.length ? 'intensity/50-50' : ''] }), dados);
  // duplicata é ignorada: -2 -1 -1 = -4, conta -3
  assert.ok(avisosDe(r, 'ERRO').some((t) => /Intensity abaixo de 0/.test(t)));
  assert.equal(r.resumo.intensity, 0);
});

test('budget inicial vem da tabela por Intensity e DR; Cash In Hand soma ao budget', () => {
  const r = calcular(base({ dr: 5 }), dados);
  assert.equal(r.resumo.intensity, 5);
  assert.equal(r.resumo.budgetInicial, economia.budgetInicial.porIntensity['5'][4]);
  const r2 = calcular(base({ dr: 5, intensity: ['intensity/hardcore', 'intensity/interesting-times', 'intensity/cash-in-hand'] }), dados);
  assert.equal(r2.resumo.budgetInicial, r.resumo.budgetInicial + 50);
});

test('empréstimo acima do limite da build inicial é erro; limite por Intensity', () => {
  const r = calcular(base({ intensity: ['intensity/hardcore', 'intensity/open-exploration'], emprestimo: 401 }), dados);
  assert.equal(r.resumo.limiteEmprestimo, 400);
  assert.ok(avisosDe(r, 'ERRO').some((t) => /acima do limite/.test(t)));
  const ok = calcular(base({ intensity: ['intensity/hardcore', 'intensity/open-exploration'], emprestimo: 400 }), dados);
  assert.equal(avisosDe(ok, 'ERRO').length, 0);
  assert.equal(ok.conferencia.saldoFinal, ok.resumo.budgetInicial + 400);
});

test('saldo negativo é dívida e gera [ERRO]', () => {
  const r = calcular(base({ dr: 1, intensity: [], compras: [{ id: 'bindings/seal-of-approval' }, { id: 'bindings/mystic-tattoo' }, { id: 'bindings/slave-to-art' }, { id: 'talents/athletic-talent' }, { id: 'talents/martial-talent' }] }), dados);
  assert.equal(r.conferencia.divida, r.conferencia.saldoFinal < 0);
  assert.ok(r.conferencia.divida);
  assert.ok(avisosDe(r, 'ERRO').some((t) => /Saldo final negativo/.test(t)));
});

test('custo em sequência: 60, 30 e depois 10 a mais (x3 = 130)', () => {
  assert.equal(precoDaCompra(dados.categorias.bindings.opcoes[4], 1, []).creditos, 60);
  assert.equal(precoDaCompra(dados.categorias.bindings.opcoes[4], 2, []).creditos, 30);
  assert.equal(precoDaCompra(dados.categorias.bindings.opcoes[4], 3, []).creditos, 40);
  const r = calcular(base({ intensity: ['intensity/hardcore', 'intensity/open-exploration'], emprestimo: 400, compras: [
    { id: 'bindings/seal-of-approval' }, { id: 'bindings/mystic-tattoo' }, { id: 'bindings/slave-to-art' },
    { id: 'bindings/elemental-inkarnation', quantidade: 3 }] }), dados);
  assert.equal(achar(r, 'Elemental Inkarnation').custo, 130);
  assert.equal(achar(r, 'Elemental Inkarnation').quantidade, 3);
});

test('sequência sem "depois" não passa da última compra e avisa', () => {
  const r = calcular(base({ compras: [{ id: 'defenses/mind-defense', quantidade: 3 }] }), dados);
  assert.ok(avisosDe(r, 'ERRO').some((t) => /Mind Defense/.test(t)));
});

test('requisito de id, de compras repetidas e declarado', () => {
  const sem = calcular(base({ compras: [{ id: 'bindings/mystic-tattoo' }] }), dados);
  assert.ok(avisosDe(sem, 'ERRO').some((t) => /Mystic Tattoo exige Seal of Approval/.test(t)));
  const um = calcular(base({ compras: [{ id: 'outros-perks/pocket-apartment' }, { id: 'outros-perks/sweet-home' }] }), dados);
  assert.ok(avisosDe(um, 'ERRO').some((t) => /Sweet Home exige Pocket Apartment comprado 2 vezes/.test(t)));
  const dois = calcular(base({ emprestimo: 50, compras: [{ id: 'outros-perks/pocket-apartment', quantidade: 2 }, { id: 'outros-perks/sweet-home' }] }), dados);
  assert.equal(avisosDe(dois, 'ERRO').length, 0);
  const decl = calcular(base({ compras: [{ id: 'lures/dirty-minds' }] }), dados);
  assert.equal(avisosDe(decl, 'ERRO').length, 0);
  assert.ok(avisosDe(decl, 'AVISO').some((t) => /Requisito declarado.*alguém com a mente suja.*Dirty Minds/.test(t)));
});

test('exclusões: duas bindings ativas se excluem', () => {
  const r = calcular(base({ compras: [{ id: 'bindings/seal-of-approval' }, { id: 'bindings/mystic-tattoo' }, { id: 'bindings/shroud-of-power' }] }), dados);
  assert.ok(avisosDe(r, 'ERRO').some((t) => /Mystic Tattoo e Shroud of Power se excluem/.test(t)));
});

test('limite de compras: opção de uma compra só, comprada duas vezes, dá erro', () => {
  const r = calcular(base({ compras: [{ id: 'lures/sticky-fingers', quantidade: 2 }] }), dados);
  assert.ok(avisosDe(r, 'ERRO').some((t) => /Sticky Fingers comprado 2 vezes; o máximo é 1/.test(t)));
});

test('No Bindings bloqueia a categoria Bindings', () => {
  const r = calcular(base({ intensity: ['intensity/hardcore', 'intensity/no-bindings'], compras: [{ id: 'bindings/seal-of-approval' }] }), dados);
  assert.ok(avisosDe(r, 'ERRO').some((t) => /No Bindings bloqueia bindings/.test(t)));
});

test('brinde: custo 0, gratis-de, ignora requisito e entra na posse', () => {
  const r = calcular(base({ compras: [{ id: 'bindings/seal-of-approval' }, { id: 'bindings/mystic-tattoo' }] }), dados);
  const g = achar(r, 'Aesthetic Talent');
  assert.equal(g.custo, 0);
  assert.equal(g.gratisDe, 'Mystic Tattoo');
});

test('brinde duplicado: já tinha o perk, vira desconto igual ao valor do perk na compra que deu o brinde', () => {
  const r = calcular(base({ compras: [{ id: 'bindings/seal-of-approval' }, { id: 'bindings/mystic-tattoo' }, { id: 'talents/aesthetic-talent' }] }), dados);
  const m = achar(r, 'Mystic Tattoo');
  assert.equal(m.lista, 25);
  assert.equal(m.custo, 20);
  assert.deepEqual(m.descontos, [{ valor: 5, motivo: 'brinde duplicado de Aesthetic Talent' }]);
  assert.equal(r.blocos.find((b) => b.categoria === 'talents').linhas.filter((l) => l.nome === 'Aesthetic Talent').length, 1);
  assert.equal(achar(r, 'Aesthetic Talent').gratisDe, undefined);
});

test('brinde duplicado de Defense usa o preço da cópia seguinte (imunidade)', () => {
  const r = calcular(base({ compras: [{ id: 'bindings/seal-of-approval' }, { id: 'bindings/mystic-tattoo' }, { id: 'bindings/slave-to-art' }, { id: 'defenses/mind-defense' }], emprestimo: 100 }), dados);
  assert.equal(achar(r, 'Slave to Art').custo, 30);
});

test('desconto de condição declarada, com arredondamento para cima', () => {
  const r = calcular(base({ compras: [{ id: 'lures/dirty-minds', declaracoes: ['familia'] }] }), dados);
  const l = achar(r, 'Dirty Minds');
  assert.equal(l.lista, 20);
  assert.equal(l.custo, 12);
  assert.deepEqual(l.descontos, [{ valor: 8, motivo: 'condição declarada: familia' }]);
  const r2 = calcular(base({ compras: [{ id: 'lures/sticky-fingers', descontoManual: 2 }] }), dados);
  assert.equal(achar(r2, 'Sticky Fingers').custo, 3); // 5 - 2
});

test('teto de 80% nos descontos somados, exceto em Talents e Defenses', () => {
  const r = calcular(base({ compras: [{ id: 'lures/sticky-fingers', descontoManual: 5 }] }), dados);
  assert.equal(achar(r, 'Sticky Fingers').custo, 1); // preço 5, teto de 80% = 4
  assert.ok(avisosDe(r, 'AVISO').some((t) => /passam de 80%/.test(t)));
  const t = calcular(base({ compras: [{ id: 'talents/athletic-talent', descontoManual: 5 }] }), dados);
  assert.equal(achar(t, 'Athletic Talent').custo, 0);
  assert.equal(avisosDe(t, 'AVISO').length, 0);
});

test('distribuirDesconto: soma inteira e corte do teto saem dos últimos itens', () => {
  assert.deepEqual(distribuirDesconto([{ real: 1.5, motivo: 'a' }, { real: 1.5, motivo: 'b' }], 3), [{ valor: 2, motivo: 'a' }, { valor: 1, motivo: 'b' }]);
  assert.deepEqual(distribuirDesconto([{ real: 4, motivo: 'a' }, { real: 4, motivo: 'b' }], 5), [{ valor: 4, motivo: 'a' }, { valor: 1, motivo: 'b' }]);
});

test('opção paga em IMG não mexe no saldo de créditos e aparece em IMG gastos', () => {
  const r = calcular(base({ compras: [{ id: 'outros-perks/meta-shift' }] }), dados);
  const l = achar(r, 'Meta Shift');
  assert.equal(l.custo, 0);
  assert.equal(l.custoImg, 2);
  assert.equal(r.conferencia.img.gastos, 2);
  const t = exportarTexto(base({ compras: [{ id: 'outros-perks/meta-shift' }] }), dados);
  assert.match(t, /- Meta Shift \| custo-img 2\n/);
  assert.match(t, /IMG gastos: 2\nIMG ganhos: 0\nIMG saldo: -2/);
});

test('regra não implementada: Defense Rebates avisa e o desconto é informado à mão (ida e volta)', () => {
  const e = base({ compras: [{ id: 'defenses/body-defense', quantidade: 2, descontoManual: 4 }] });
  const r = calcular(e, dados);
  assert.equal(achar(r, 'Body Defense').custo, 26);
  assert.ok(avisosDe(r, 'NÃO IMPLEMENTADA').some((t) => /Defense Rebates.*Afeta: Body Defense\./.test(t)));
  const t = exportarTexto(e, dados);
  assert.equal(exportarTexto(importarTexto(t, dados).estado, dados), t);
});

test('custo que o motor não calcula (Power Swap): o custo informado vale, com aviso, e sobrevive à ida e volta', () => {
  const e = base({ compras: [{ id: 'outros-perks/power-swap', custoManual: 12 }] });
  const r = calcular(e, dados);
  assert.equal(achar(r, 'Power Swap').custo, 12);
  assert.ok(avisosDe(r, 'NÃO IMPLEMENTADA').some((t) => /Power Swap/.test(t)));
  const t = exportarTexto(e, dados);
  assert.match(t, /- Power Swap \| custo 12 \|/);
  assert.equal(exportarTexto(importarTexto(t, dados).estado, dados), t);
});

test('todo regraEspecial dos dados está na tabela de regras do motor', () => {
  for (const cat of Object.values(dados.categorias)) for (const op of cat.opcoes) if (op.regraEspecial) assert.ok(REGRAS_ESPECIAIS[op.regraEspecial], op.id);
});

test('companion comprada, capturada e vendida usa as tabelas da Intensity efetiva', () => {
  const e = base({ companions: [
    { nome: 'A', obra: 'O', tier: 4, entrada: 'compra', papel: 'companion', estado: 'no séquito' },
    { nome: 'B', obra: 'O', tier: 8, entrada: 'captura', papel: 'companion', estado: 'vendida' },
  ] });
  const r = calcular(e, dados);
  const cA = r.blocos.find((b) => b.categoria === 'companions').linhas;
  assert.equal(cA[0].custo, 10);
  assert.equal(cA[1].ganho, 40); // Intensity 5, tier 8: 40 na captura
  assert.equal(cA[1].venda, 120); // e 120 na venda (exemplo do documento)
  assert.ok(avisosDe(r, 'NÃO CONFIRMADO').some((t) => /Afeta: A\./.test(t)));
});

test('figurante: captura pelo valor de figurante e sem venda', () => {
  const e = base({ companions: [{ nome: 'F', obra: '-', tier: 7, entrada: 'captura', papel: 'figurante', estado: 'vendida' }] });
  const l = calcular(e, dados).blocos.find((b) => b.categoria === 'companions').linhas[0];
  assert.equal(l.ganho, 5);
  assert.equal(l.venda, 0);
});

test('tiers imaginários: compra em IMG e captura e venda pela tabela do documento (Intensity 5)', () => {
  const e = base({ companions: [
    { nome: 'X1', obra: 'O', tier: 'X', entrada: 'compra', papel: 'companion', estado: 'no séquito' },
    { nome: 'X2', obra: 'O', tier: 'X', entrada: 'captura', papel: 'companion', estado: 'vendida' },
    { nome: 'Z1', obra: 'O', tier: 'Z', entrada: 'captura', papel: 'companion', estado: 'vendida' },
  ] });
  const r = calcular(e, dados);
  const ls = r.blocos.find((b) => b.categoria === 'companions').linhas;
  assert.equal(ls[0].custoImg, 2);
  assert.equal(ls[1].ganho, 400);
  assert.equal(ls[1].venda, 200);
  assert.equal(ls[1].vendaImg, 2);
  assert.equal(ls[2].ganhoImg, 2);
  assert.equal(ls[2].vendaImg, 7);
  const t = exportarTexto(e, dados);
  assert.equal(exportarTexto(importarTexto(t, dados).estado, dados), t);
});

test('minion ou summon comprado de um mestre que o contractor tem custa 50%', () => {
  const e = base({ companions: [
    { nome: 'Mestre', obra: 'O', tier: 5, entrada: 'compra', papel: 'companion', estado: 'no séquito' },
    { nome: 'Bicho', obra: 'O', tier: 4, entrada: 'compra', papel: 'familiar', de: 'Mestre', estado: 'no séquito' },
  ] });
  const ls = calcular(e, dados).blocos.find((b) => b.categoria === 'companions').linhas;
  assert.equal(ls[1].custo, 5);
  assert.equal(ls[1].lista, 10);
  const t = exportarTexto(e, dados);
  assert.match(t, /- Bicho \| obra O \| tier 4 \| entrada compra \| papel familiar \| de Mestre \| estado no séquito \| custo 5 \| lista 10 \| desconto 5 \(50% do mestre Mestre\) \|/);
  assert.equal(exportarTexto(importarTexto(t, dados).estado, dados), t);
});

test('Possess exige "Nome, tier N" e cobra o preço do tier', () => {
  const ok = calcular(base({ origem: { id: 'origens/possess', escolha: 'Mika, tier 6' } }), dados);
  assert.equal(achar(ok, 'Possess').custo, 50);
  const mal = calcular(base({ origem: { id: 'origens/possess', escolha: 'Mika' } }), dados);
  assert.ok(avisosDe(mal, 'ERRO').some((t) => /Nome, tier N/.test(t)));
});

test('ordem dos avisos: ERRO, NÃO CONFIRMADO, NÃO IMPLEMENTADA, AVISO', () => {
  const e = base({ compras: [{ id: 'lures/dirty-minds' }, { id: 'defenses/body-defense' }, { id: 'bindings/mystic-tattoo' }],
    companions: [{ nome: 'A', obra: 'O', tier: 4, entrada: 'compra', papel: 'companion', estado: 'no séquito' }] });
  const ordem = calcular(e, dados).avisos.map((a) => a.etiqueta);
  const peso = { ERRO: 0, 'NÃO CONFIRMADO': 1, 'NÃO IMPLEMENTADA': 2, AVISO: 3 };
  for (let i = 1; i < ordem.length; i++) assert.ok(peso[ordem[i - 1]] <= peso[ordem[i]], ordem.join(','));
});

test('requisitoAtendido: diz o que falta antes da compra e libera depois dela', () => {
  const ix = (id) => dados.categorias[id.split('/')[0]].opcoes.find((o) => o.id === id);
  const tatuagem = ix('bindings/mystic-tattoo');
  const vazio = calcular(base(), dados);
  const antes = requisitoAtendido(tatuagem, vazio, dados);
  assert.equal(antes.ok, false);
  assert.match(antes.falta, /Seal of Approval/);
  const e = base();
  e.compras = [{ id: 'bindings/seal-of-approval' }];
  const depois = requisitoAtendido(tatuagem, calcular(e, dados), dados);
  assert.deepEqual(depois, { ok: true, falta: '' });
  // opção sem requisito está sempre liberada
  assert.deepEqual(requisitoAtendido(ix('lures/sticky-fingers'), vazio, dados), { ok: true, falta: '' });
  // requisito só declarado pelo usuário: libera, e devolve o texto declarado
  const declarado = requisitoAtendido(ix('lures/dirty-minds'), vazio, dados);
  assert.equal(declarado.ok, true);
  assert.deepEqual(declarado.declarado, ['alguém com a mente suja']);
});
