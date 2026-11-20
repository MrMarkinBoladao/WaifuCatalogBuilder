// Estados de entrada dos dois exemplos de docs/formato-da-build.md (os textos estão em docs/exemplos/).
import { estadoVazio } from '../fonte/motor.js';

export function estadoPequeno() {
  const e = estadoVazio();
  e.contractor = 'Aiko Exemplo';
  e.mundo = 'Mundo Exemplo';
  e.dr = 3;
  e.intensity = ['intensity/hardcore', 'intensity/open-exploration'];
  e.origem = { id: 'origens/drop-in', escolha: '' };
  e.compras = [
    { id: 'talents/athletic-talent' },
    { id: 'talents/martial-talent' },
    { id: 'outros-perks/body-tune-up' },
  ];
  e.companions = [
    { nome: 'Hoshi Mirei', obra: 'Obra Exemplo', tier: 3, entrada: 'compra', papel: 'companion', estado: 'no séquito' },
    { nome: 'Ren Tachibana', obra: 'Obra Exemplo', tier: 4, entrada: 'compra', papel: 'companion', estado: 'no séquito' },
  ];
  return e;
}

export function estadoMedio() {
  const e = estadoVazio();
  e.contractor = 'Kenji Exemplo';
  e.mundo = 'Mundo Exemplo';
  e.condicao = 'Canon';
  e.dr = 5;
  e.emprestimo = 100;
  e.intensity = [
    'intensity/hardcore', 'intensity/is-there-anybody-out-there', 'intensity/50-50',
    'intensity/interesting-times', 'intensity/intact-weaknesses',
  ];
  e.origem = { id: 'origens/possess', escolha: 'Mika Exemplo, tier 6' };
  e.compras = [
    { id: 'bindings/seal-of-approval' },
    { id: 'bindings/mystic-tattoo' },
    { id: 'bindings/slave-to-art' },
    { id: 'lures/sticky-fingers' },
    { id: 'talents/athletic-talent' },
    { id: 'defenses/body-defense', quantidade: 2 },
    { id: 'outros-perks/body-tune-up' },
  ];
  e.companions = [
    { nome: 'Sora Exemplo', obra: 'Obra Exemplo', tier: 5, entrada: 'compra', papel: 'companion', estado: 'no séquito' },
    { nome: 'Taro Exemplo', obra: 'Obra Exemplo', tier: 4, entrada: 'captura', papel: 'companion', estado: 'vendida' },
  ];
  return e;
}
