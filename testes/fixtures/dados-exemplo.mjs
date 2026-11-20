// Conjunto pequeno de opções, com os custos e nomes reais usados nos exemplos de docs/formato-da-build.md.
// A economia vem do dados/economia.json real. Serve aos testes do motor antes e depois de dados/ estar completo.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
export const economia = JSON.parse(readFileSync(join(aqui, '..', '..', 'dados', 'economia.json'), 'utf8'));

const o = (categoria, slug, nome, extra) => ({
  id: categoria + '/' + slug, nome, categoria, custo: { tipo: 'gratis' }, resumo: 'x', verificado: true, ...extra,
});

export const categorias = {
  intensity: { opcoes: [
    o('intensity', 'hardcore', 'Hardcore', { efeitos: [{ tipo: 'intensity', valor: 3 }] }),
    o('intensity', 'open-exploration', 'Open Exploration', { efeitos: [{ tipo: 'intensity', valor: -2 }] }),
    o('intensity', 'is-there-anybody-out-there', 'Is There Anybody Out There?', { efeitos: [{ tipo: 'intensity', valor: -1 }] }),
    o('intensity', '50-50', '50%/50%', { efeitos: [{ tipo: 'intensity', valor: -1 }] }),
    o('intensity', 'interesting-times', 'Interesting Times', { efeitos: [{ tipo: 'intensity', valor: 1 }] }),
    o('intensity', 'intact-weaknesses', 'Intact Weaknesses', { efeitos: [{ tipo: 'intensity', valor: 1 }] }),
    o('intensity', 'no-bindings', 'No Bindings', { efeitos: [{ tipo: 'intensity', valor: -2 }, { tipo: 'regra', id: 'bloqueia-categoria', categoria: 'bindings' }] }),
    o('intensity', 'cash-in-hand', 'Cash In Hand', { efeitos: [{ tipo: 'intensity', valor: 0 }, { tipo: 'budget', valor: 50 }] }),
  ] },
  origens: { opcoes: [
    o('origens', 'drop-in', 'Drop-In'),
    o('origens', 'possess', 'Possess', { custo: { tipo: 'precoDoTier' } }),
  ] },
  bindings: { opcoes: [
    o('bindings', 'seal-of-approval', 'Seal of Approval'),
    o('bindings', 'mystic-tattoo', 'Mystic Tattoo', {
      custo: { tipo: 'fixo', valor: 25 }, requisitos: { id: 'bindings/seal-of-approval' },
      gratis: [{ id: 'talents/aesthetic-talent', quantidade: 1 }], grupoExclusivo: 'binding-ativa',
    }),
    o('bindings', 'shroud-of-power', 'Shroud of Power', {
      custo: { tipo: 'fixo', valor: 25 }, requisitos: { id: 'bindings/seal-of-approval' }, grupoExclusivo: 'binding-ativa',
    }),
    o('bindings', 'slave-to-art', 'Slave to Art', {
      custo: { tipo: 'fixo', valor: 50 }, requisitos: { id: 'bindings/mystic-tattoo' },
      gratis: [{ id: 'defenses/mind-defense', quantidade: 1 }],
    }),
    o('bindings', 'elemental-inkarnation', 'Elemental Inkarnation', {
      custo: { tipo: 'sequencia', valores: [60, 30], depois: { incremento: 10 } },
      repeticao: { max: null }, requisitos: { id: 'bindings/slave-to-art' },
    }),
  ] },
  lures: { opcoes: [
    o('lures', 'sticky-fingers', 'Sticky Fingers', { custo: { tipo: 'fixo', valor: 5 } }),
    o('lures', 'dirty-minds', 'Dirty Minds', {
      custo: { tipo: 'fixo', valor: 20 }, requisitos: { declarado: 'alguém com a mente suja' },
      descontos: [{ id: 'familia', tipo: 'condicao', percentual: 40, condicao: 'condição de história' }],
    }),
  ] },
  talents: { opcoes: [
    o('talents', 'aesthetic-talent', 'Aesthetic Talent', { custo: { tipo: 'fixo', valor: 5 } }),
    o('talents', 'athletic-talent', 'Athletic Talent', { custo: { tipo: 'fixo', valor: 5 } }),
    o('talents', 'martial-talent', 'Martial Talent', { custo: { tipo: 'fixo', valor: 10 } }),
  ] },
  defenses: { opcoes: [
    o('defenses', 'mind-defense', 'Mind Defense', { custo: { tipo: 'porCompra', valores: [10, 20] }, repeticao: { max: 2 } }),
    o('defenses', 'body-defense', 'Body Defense', {
      custo: { tipo: 'porCompra', valores: [10, 20] }, repeticao: { max: 2 },
      regraEspecial: 'defense-rebates', descontos: [{ id: 'rebates', tipo: 'porMembro' }],
    }),
  ] },
  'outros-perks': { opcoes: [
    o('outros-perks', 'body-tune-up', 'Body Tune-Up', { custo: { tipo: 'fixo', valor: 5 } }),
    o('outros-perks', 'power-swap', 'Power Swap', { custo: { tipo: 'diferencaDeTier' }, regraEspecial: 'diferenca-de-tier' }),
    o('outros-perks', 'pocket-apartment', 'Pocket Apartment', { custo: { tipo: 'fixo', valor: 10 }, repeticao: { max: 3 } }),
    o('outros-perks', 'sweet-home', 'Sweet Home', {
      custo: { tipo: 'fixo', valor: 20 }, requisitos: { compras: { id: 'outros-perks/pocket-apartment', minimo: 2 } },
    }),
    o('outros-perks', 'meta-shift', 'Meta Shift', { custo: { tipo: 'fixo', valor: 2, moeda: 'IMG' } }),
  ] },
};

export const dados = { versaoDocumento: economia.versaoDocumento, economia, categorias };
