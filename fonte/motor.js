// Motor de cálculo do Waifu Catalog Builder.
// Puro: recebe o estado da build e os dados, devolve o resultado. Sem DOM, sem rede, sem relógio.
// Roda em Node (testes) e dentro da página (montada por ferramentas/montar.mjs).
// Contrato dos dados: docs/esquema-de-dados.md. Formato do texto: docs/formato-da-build.md.

export const VERSAO_BUILDER = '0.1.0';

// Ordem fixa dos blocos de opção no texto (blocos 2 a 13 do formato).
export const BLOCOS = [
  { categoria: 'intensity', titulo: 'Intensity' },
  { categoria: 'origens', titulo: 'Origin' },
  { categoria: 'heritages', titulo: 'Heritage' },
  { categoria: 'bindings', titulo: 'Bindings' },
  { categoria: 'lures', titulo: 'Lures' },
  { categoria: 'outros-controles', titulo: 'Other Controls' },
  { categoria: 'sanctuaries-e-strongholds', titulo: 'Sanctuaries & Strongholds' },
  { categoria: 'talents', titulo: 'Talents' },
  { categoria: 'defenses', titulo: 'Defenses' },
  { categoria: 'outros-perks', titulo: 'Other Perks' },
  { categoria: 'servicos-e-missoes', titulo: 'Company Services' },
];

// Regras especiais conhecidas pelo motor. `implementada: false` faz o app e o texto avisarem.
// Todo id usado em `regraEspecial` nos dados precisa estar aqui e em docs/regras-especiais.md.
export const REGRAS_ESPECIAIS = {
  'defense-rebates': {
    implementada: false,
    titulo: 'Defense Rebates',
    aviso: 'o Builder não calcula o desconto de Defenses por traços da origem do séquito.',
  },
  'desconto-por-arquetipo': {
    implementada: false,
    titulo: 'Desconto por arquétipo',
    aviso: 'o Builder não calcula o desconto de heritage por arquétipo compartilhado.',
  },
  'custo-textual': {
    implementada: false,
    titulo: 'Custo descrito em texto',
    aviso: 'o custo desta opção depende de uma regra que o Builder não calcula; informe o custo à mão.',
  },
  'diferenca-de-tier': {
    implementada: false,
    titulo: 'Diferença de tier (Power Swap)',
    aviso: 'o Builder não calcula o preço pela diferença de tier; informe o custo à mão.',
  },
  'divisao-captura-venda': {
    implementada: false,
    titulo: 'Divisão entre captura e venda',
    aviso: 'o Builder calcula o ganho e a venda de cada companion pela divisão padrão; com esta cláusula, informe os valores à mão.',
  },
  'requisito-textual': {
    implementada: false,
    titulo: 'Requisito descrito em texto',
    aviso: 'o requisito desta opção é uma condição que o Builder não verifica.',
  },
};

export function regraImplementada(id) {
  const r = REGRAS_ESPECIAIS[id];
  return !!(r && r.implementada);
}

// ---------------------------------------------------------------------------
// Texto

export function normalizarNome(s) {
  return String(s == null ? '' : s)
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function teto(x) {
  // Todo preço de compra é arredondado para cima. Evita ruído de ponto flutuante (ex.: 20*0.6 = 12.000000000000002).
  return Math.ceil(Math.round(x * 1e6) / 1e6);
}

function sinal(n) {
  return n >= 0 ? '+' + n : String(n);
}

// ---------------------------------------------------------------------------
// Índice dos dados

export function indexarDados(dados) {
  if (dados && dados.__indice) return dados.__indice;
  const porId = new Map();
  const porCategoria = new Map();
  const porNome = new Map(); // categoria -> Map(nome normalizado -> opcao)
  const ordem = new Map(); // id -> posição global (ordem do documento)
  let pos = 0;
  const cats = dados.categorias || {};
  for (const cat of Object.keys(cats)) {
    const lista = cats[cat].opcoes || [];
    porCategoria.set(cat, lista);
    const m = new Map();
    for (const op of lista) {
      porId.set(op.id, op);
      ordem.set(op.id, pos++);
      const chave = normalizarNome(op.nome);
      if (!m.has(chave)) m.set(chave, op);
    }
    porNome.set(cat, m);
  }
  const indice = { porId, porCategoria, porNome, ordem };
  try {
    Object.defineProperty(dados, '__indice', { value: indice, enumerable: false });
  } catch (e) {
    /* objeto congelado: sem cache */
  }
  return indice;
}

// ---------------------------------------------------------------------------
// Economia

export function intensityDaConta(soma, economia) {
  const base = (economia && economia.intensity && economia.intensity.base) ?? 1;
  const conta = base + soma;
  const minimo = (economia && economia.intensity && economia.intensity.minimo) ?? 0;
  const teto = (economia && economia.intensity && economia.intensity.tetoParaBudget) ?? 10;
  return { base, conta, valida: conta >= minimo, efetiva: Math.min(teto, Math.max(minimo, conta)) };
}

function linhaDaTabela(tabela, intensity) {
  if (!tabela) return null;
  const p = tabela.porIntensity || tabela;
  return p[String(intensity)] || null;
}

export function budgetInicial(economia, intensityEfetiva, dr) {
  const linha = linhaDaTabela(economia.budgetInicial, intensityEfetiva);
  if (!linha) return null;
  const v = linha[dr - 1];
  return typeof v === 'number' ? v : null;
}

export function limiteEmprestimoInicial(economia, intensityEfetiva) {
  const e = economia.emprestimo;
  if (!e) return null;
  const linha = e.limiteBuildInicial || {};
  const v = linha[String(intensityEfetiva)];
  return typeof v === 'number' ? v : null;
}

export function ehTierImaginario(t) {
  return t === 'X' || t === 'Y' || t === 'Z';
}

export function normalizarTier(t) {
  if (t == null) return null;
  const s = String(t).trim().toUpperCase();
  if (s === 'X' || s === 'Y' || s === 'Z') return s;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

// Preço de compra de um tier: { creditos, img } (um dos dois é 0).
export function precoDoTier(economia, tier) {
  const t = normalizarTier(tier);
  if (t == null) return null;
  if (ehTierImaginario(t)) {
    const v = economia.tiersImaginarios && economia.tiersImaginarios.img && economia.tiersImaginarios.img[t];
    return typeof v === 'number' ? { creditos: 0, img: v } : null;
  }
  const v = economia.precoPorTier && economia.precoPorTier.tier && economia.precoPorTier.tier[String(t)];
  return typeof v === 'number' ? { creditos: v, img: 0 } : null;
}

// Pagamento de captura ou venda: { creditos, img }. `quando` = 'captura' | 'venda'.
export function pagamento(economia, quando, tier, intensityEfetiva, figurante) {
  const t = normalizarTier(tier);
  if (t == null) return null;
  if (ehTierImaginario(t)) {
    const tab = economia.tiersImaginarios && economia.tiersImaginarios[quando];
    const linha = tab && (tab.porIntensity || tab)[String(intensityEfetiva)];
    const cel = linha && linha[t];
    if (!cel) return null;
    const par = figurante && quando === 'captura' && cel.figurante ? cel.figurante : cel;
    return { creditos: par.creditos || 0, img: par.img || 0 };
  }
  if (quando === 'captura') {
    const tab = figurante ? economia.captura && economia.captura.figurante : economia.captura && economia.captura.regular;
    const linha = linhaDaTabela(tab, intensityEfetiva);
    const v = linha && linha[t - 1];
    return typeof v === 'number' ? { creditos: v, img: 0 } : null;
  }
  if (figurante) return { creditos: 0, img: 0 }; // figurante não tem valor de venda
  const linha = linhaDaTabela(economia.venda, intensityEfetiva);
  const v = linha && linha[t - 1];
  return typeof v === 'number' ? { creditos: v, img: 0 } : null;
}

// ---------------------------------------------------------------------------
// Custo de uma opção

// Preço de lista da k-ésima compra (k começa em 1). Devolve { creditos, img, ok, motivo }.
export function precoDaCompra(op, k, escolhas) {
  const c = op.custo || { tipo: 'gratis' };
  const moeda = c.moeda === 'IMG' ? 'img' : 'creditos';
  const out = (v) => ({ ok: true, creditos: moeda === 'creditos' ? v : 0, img: moeda === 'img' ? v : 0 });
  switch (c.tipo) {
    case 'gratis':
      return out(0);
    case 'fixo':
      return out(c.valor);
    case 'sequencia':
    case 'porCompra': {
      const vs = c.valores || [];
      if (k <= vs.length) return out(vs[k - 1]);
      if (c.depois && typeof c.depois.incremento === 'number' && vs.length > 0) {
        return out(vs[vs.length - 1] + c.depois.incremento * (k - vs.length));
      }
      return { ok: false, creditos: 0, img: 0, motivo: 'além da última compra possível' };
    }
    case 'porEscolha': {
      const lista = (op.escolha && op.escolha.opcoes) || [];
      let soma = 0;
      for (const e of escolhas || []) {
        const alt = lista.find((a) => normalizarNome(a.valor) === normalizarNome(e));
        if (alt && typeof alt.custo === 'number') soma += alt.custo;
      }
      return out(soma);
    }
    default:
      return { ok: false, creditos: 0, img: 0, motivo: 'custo não calculável: ' + c.tipo, manual: true };
  }
}

// ---------------------------------------------------------------------------
// Requisitos

export function descreverRequisito(r, indice) {
  if (!r) return '';
  if (r.id) {
    const o = indice.porId.get(r.id);
    return o ? o.nome : r.id;
  }
  if (r.todos) return r.todos.map((x) => descreverRequisito(x, indice)).join(' e ');
  if (r.qualquerDe) return r.qualquerDe.map((x) => descreverRequisito(x, indice)).join(' ou ');
  if (r.grupo) return (r.minimo || 1) + ' do grupo ' + r.grupo;
  if (r.compras) {
    const o = indice.porId.get(r.compras.id);
    return (o ? o.nome : r.compras.id) + ' comprado ' + r.compras.minimo + ' vezes';
  }
  if (r.origem) return 'origem ' + r.origem;
  if (r.intensity) {
    const a = r.intensity;
    return 'Intensity ' + (a.min != null ? 'mínima ' + a.min : '') + (a.max != null ? ' máxima ' + a.max : '');
  }
  if (r.nao) return 'não ter (' + descreverRequisito(r.nao, indice) + ')';
  if (r.declarado) return r.declarado;
  return '?';
}

// Avalia a expressão. `ctx` = { contagem: Map id->n, intensity, origemSlug, grupos(opcao)->.., declarados: Set }
// `declarado` decide o valor das folhas { declarado }.
function dispensado(ctx, proprio, id) {
  const d = ctx.dispensas && ctx.dispensas.get(proprio);
  return !!(d && d.has(id));
}

function avaliar(r, ctx, indice, proprio, declarado) {
  if (!r) return true;
  if (r.id) return (ctx.contagem.get(r.id) || 0) >= 1 || dispensado(ctx, proprio, r.id);
  if (r.todos) return r.todos.every((x) => avaliar(x, ctx, indice, proprio, declarado));
  if (r.qualquerDe) return r.qualquerDe.some((x) => avaliar(x, ctx, indice, proprio, declarado));
  if (r.grupo) {
    let n = 0;
    for (const [id, q] of ctx.contagem) {
      if (q < 1) continue;
      if (r.exceto === 'self' && id === proprio) continue;
      const o = indice.porId.get(id);
      if (o && o.grupo === r.grupo) n += 1;
    }
    return n >= (r.minimo || 1);
  }
  if (r.compras) return (ctx.contagem.get(r.compras.id) || 0) >= r.compras.minimo || dispensado(ctx, proprio, r.compras.id);
  if (r.origem) return ctx.origemSlug === r.origem;
  if (r.intensity) {
    const a = r.intensity;
    return (a.min == null || ctx.intensity >= a.min) && (a.max == null || ctx.intensity <= a.max);
  }
  if (r.nao) return !avaliar(r.nao, ctx, indice, proprio, declarado);
  if (r.declarado) return declarado;
  return false;
}

function temDeclarado(r) {
  if (!r) return false;
  if (r.declarado) return true;
  if (r.todos) return r.todos.some(temDeclarado);
  if (r.qualquerDe) return r.qualquerDe.some(temDeclarado);
  if (r.nao) return temDeclarado(r.nao);
  return false;
}

function textosDeclarados(r, acc) {
  if (!r) return acc;
  if (r.declarado) acc.push(r.declarado);
  if (r.todos) r.todos.forEach((x) => textosDeclarados(x, acc));
  if (r.qualquerDe) r.qualquerDe.forEach((x) => textosDeclarados(x, acc));
  if (r.nao) textosDeclarados(r.nao, acc);
  return acc;
}

// Efeitos de regra das opções de Intensity que mexem em requisitos e exclusões de grupo.
// `libera-grupo-exclusivo` (grupo): o grupo deixa de excluir (Ancestral Diversity e as raízes de Heritage).
// `dispensa-requisito` (requisito, em): o requisito de `em` pelo id `requisito` vale como atendido (Nomad e Pocket Apartment).
export function efeitosDeRegra(idsIntensity, indice) {
  const liberados = new Set();
  const dispensas = new Map();
  for (const id of idsIntensity) {
    const op = indice.porId.get(id);
    if (!op) continue;
    for (const ef of op.efeitos || []) {
      if (ef.tipo !== 'regra') continue;
      if (ef.id === 'libera-grupo-exclusivo') liberados.add(ef.grupo);
      if (ef.id === 'dispensa-requisito') {
        for (const em of ef.em || []) {
          if (!dispensas.has(em)) dispensas.set(em, new Set());
          dispensas.get(em).add(ef.requisito);
        }
      }
    }
  }
  return { liberados, dispensas };
}

// Diz se uma opção que ainda não está na build teria o requisito atendido com a posse atual.
// Devolve { ok, falta } em que `falta` descreve o que falta (texto para a interface).
export function requisitoAtendido(op, resultado, dados) {
  if (!op.requisitos) return { ok: true, falta: '' };
  const ix = indexarDados(dados);
  const contagem = new Map(Object.entries(resultado.posse || {}));
  const idsIntensity = Object.keys(resultado.posse || {}).filter((id) => id.startsWith('intensity/'));
  const { dispensas } = efeitosDeRegra(idsIntensity, ix);
  const ctx = { contagem, intensity: resultado.resumo.intensityConta, origemSlug: resultado.origemSlug, dispensas };
  if (avaliar(op.requisitos, ctx, ix, op.id, false)) return { ok: true, falta: '' };
  if (temDeclarado(op.requisitos) && avaliar(op.requisitos, ctx, ix, op.id, true)) {
    return { ok: true, falta: '', declarado: textosDeclarados(op.requisitos, []) };
  }
  return { ok: false, falta: descreverRequisito(op.requisitos, ix) };
}

// ---------------------------------------------------------------------------
// Estado

export function estadoVazio() {
  return {
    contractor: '',
    mundo: '',
    condicao: '',
    dr: 1,
    emprestimo: 0,
    intensity: [],
    origem: null, // { id, escolha }
    compras: [], // { id, escolha, quantidade, descontoManual, custoManual, declaracoes }
    companions: [],
  };
}

function lista(x) {
  if (x == null || x === '') return [];
  return Array.isArray(x) ? x.map(String) : [String(x)];
}

// ---------------------------------------------------------------------------
// Cálculo principal

export function calcular(estado, dados) {
  const ix = indexarDados(dados);
  const eco = dados.economia;
  const avisos = []; // { etiqueta, texto }
  const aviso = (etiqueta, texto) => avisos.push({ etiqueta, texto });

  for (const d of estado.desconhecidas || []) {
    aviso('ERRO', 'Opção desconhecida em ' + d.bloco + ': ' + d.texto + '. O Builder não adivinha o nome mais parecido.');
  }

  // --- Intensity
  const intensityLinhas = [];
  let soma = 0;
  const efeitosRegra = []; // { op, efeito }
  let efeitoBudget = 0;
  let efeitoLimite = 0;
  const idsIntensity = [];
  for (const id of estado.intensity || []) {
    const op = ix.porId.get(id);
    if (!op) {
      aviso('ERRO', 'Opção de Intensity desconhecida: ' + id + '.');
      continue;
    }
    if (idsIntensity.includes(id)) continue;
    idsIntensity.push(id);
    let valor = 0;
    for (const ef of op.efeitos || []) {
      if (ef.tipo === 'intensity') valor += ef.valor;
      else if (ef.tipo === 'budget') efeitoBudget += ef.valor;
      else if (ef.tipo === 'limiteEmprestimo') efeitoLimite += ef.valor;
      else if (ef.tipo === 'regra') efeitosRegra.push({ op, efeito: ef });
    }
    soma += valor;
    intensityLinhas.push({ id, nome: op.nome, valor, op });
  }
  intensityLinhas.sort((a, b) => ix.ordem.get(a.id) - ix.ordem.get(b.id));
  const it = intensityDaConta(soma, eco);
  if (!it.valida) {
    aviso(
      'ERRO',
      'Intensity abaixo de 0 (conta ' + it.conta + '): escolha mais opções que somem até a conta chegar a 0 ou mais.'
    );
  }
  const intensity = it.efetiva;


  // --- Budget e empréstimo
  const dr = Number.isInteger(estado.dr) ? estado.dr : parseInt(estado.dr, 10);
  let budget = null;
  if (!(dr >= 1 && dr <= 10)) aviso('ERRO', 'DR fora da faixa de 1 a 10.');
  else {
    budget = budgetInicial(eco, intensity, dr);
    if (budget == null) aviso('ERRO', 'Sem valor de budget para Intensity ' + intensity + ' e DR ' + dr + ' nos dados.');
  }
  if (budget != null) budget += efeitoBudget;
  const limiteBase = limiteEmprestimoInicial(eco, intensity);
  const limite = limiteBase == null ? null : limiteBase + efeitoLimite;
  const emprestimo = Math.max(0, Math.trunc(Number(estado.emprestimo) || 0));
  if (limite != null && emprestimo > limite) {
    aviso('ERRO', 'Empréstimo na criação (' + emprestimo + ') acima do limite da build inicial (' + limite + ').');
  }

  // --- Posse: compras explícitas + origem
  const contagem = new Map();
  const cont = (id, n) => contagem.set(id, (contagem.get(id) || 0) + n);
  for (const l of intensityLinhas) cont(l.id, 1);
  const comprasValidas = [];
  for (const c of estado.compras || []) {
    const op = ix.porId.get(c.id);
    if (!op) {
      aviso('ERRO', 'Opção desconhecida: ' + c.id + '.');
      continue;
    }
    const q = Math.max(1, Math.trunc(Number(c.quantidade) || 1));
    comprasValidas.push({ c, op, q });
  }
  let origemOp = null;
  let origemSlug = null;
  if (estado.origem && estado.origem.id) {
    origemOp = ix.porId.get(estado.origem.id);
    if (!origemOp) aviso('ERRO', 'Origem desconhecida: ' + estado.origem.id + '.');
    else {
      origemSlug = origemOp.id.split('/')[1];
      cont(origemOp.id, 1);
    }
  }

  // contagem das compras explícitas por opção (para brindes duplicados e requisitos)
  const explicitas = new Map();
  for (const { op, q, c } of comprasValidas) {
    const escolhas = lista(c.escolha);
    const n = op.escolha && op.escolha.multipla ? Math.max(1, escolhas.length) : q;
    explicitas.set(op.id, (explicitas.get(op.id) || 0) + n);
  }

  // --- Brindes
  // Cada compra explícita pode dar opções de graça. Brinde ignora requisito. Se o contractor já tem o perk
  // (compra explícita ou brinde anterior), o brinde vira desconto na compra que o deu.
  const gifts = []; // { op (gifted), de (gifter op), q }
  const descontoDeBrinde = new Map(); // chave da compra -> [{ valor, de }]
  const posse = new Map(explicitas); // contagem explícita + brindes aceitos
  for (const [id, n] of explicitas) cont(id, n);

  const ordenadas = comprasValidas.slice().sort((a, b) => ix.ordem.get(a.op.id) - ix.ordem.get(b.op.id));
  for (const { c, op, q } of ordenadas) {
    const lista_ = [];
    for (const g of op.gratis || []) lista_.push(g);
    const escolhas = lista(c.escolha);
    if (op.escolha && Array.isArray(op.escolha.opcoes)) {
      for (const e of escolhas) {
        const alt = op.escolha.opcoes.find((a) => normalizarNome(a.valor) === normalizarNome(e));
        if (alt && Array.isArray(alt.gratis)) for (const g of alt.gratis) lista_.push(g);
      }
    }
    for (const g of lista_) {
      const alvo = ix.porId.get(g.id);
      if (!alvo) {
        aviso('ERRO', 'Brinde de ' + op.nome + ' aponta para opção desconhecida: ' + g.id + '.');
        continue;
      }
      const copias = (g.quantidade || 1) * (op.escolha && op.escolha.multipla ? 1 : q);
      for (let i = 0; i < copias; i++) {
        const jaTem = posse.get(alvo.id) || 0;
        // O documento só dá desconto se o perk foi comprado antes do brinde. Um perk repetível (ex.: estágios
        // de uma Defense) que só veio de brindes recebe a cópia grátis normalmente, até o limite de repetição.
        const maxAlvo = alvo.repeticao ? (alvo.repeticao.max === undefined ? 1 : alvo.repeticao.max) : 1;
        const cabeMais = maxAlvo === null || jaTem < maxAlvo;
        const compradoAntes = (explicitas.get(alvo.id) || 0) >= 1;
        if (jaTem >= 1 && (compradoAntes || !cabeMais)) {
          // brinde duplicado: desconto igual ao valor do perk grátis, na compra que o deu
          const preco = precoDaCompra(alvo, jaTem + 1, []);
          const valor = preco.ok ? preco.creditos : 0;
          const chave = c;
          if (!descontoDeBrinde.has(chave)) descontoDeBrinde.set(chave, []);
          descontoDeBrinde.get(chave).push({ valor, de: alvo.nome });
        } else {
          gifts.push({ op: alvo, de: op, c });
          posse.set(alvo.id, jaTem + 1);
          cont(alvo.id, 1);
        }
      }
    }
  }

  // --- Requisitos, exclusões e limites das compras explícitas
  const { liberados, dispensas } = efeitosDeRegra(idsIntensity, ix);
  const ctx = { contagem, intensity: it.conta, origemSlug, dispensas };
  const ctxIntensity = { ...ctx, intensity: it.conta };
  for (const l of intensityLinhas) {
    if (l.op.requisitos && !avaliar(l.op.requisitos, ctxIntensity, ix, l.op.id, false)) {
      aviso('ERRO', 'Requisito não atendido: ' + l.op.nome + ' exige ' + descreverRequisito(l.op.requisitos, ix) + '.');
    }
  }
  for (const { c, op, q } of ordenadas) {
    if (op.requisitos) {
      const ok = avaliar(op.requisitos, ctxIntensity, ix, op.id, false);
      if (!ok) {
        if (temDeclarado(op.requisitos) && avaliar(op.requisitos, ctxIntensity, ix, op.id, true)) {
          for (const t of textosDeclarados(op.requisitos, [])) {
            aviso('AVISO', 'Requisito declarado, que o Builder não verifica: ' + t + '. Afeta: ' + op.nome + '.');
          }
        } else {
          aviso(
            'ERRO',
            'Requisito não atendido: ' + op.nome + ' exige ' + descreverRequisito(op.requisitos, ix) + '.'
          );
        }
      }
    }
    const max = op.repeticao ? (op.repeticao.max === undefined ? 1 : op.repeticao.max) : 1;
    const total = explicitas.get(op.id) || 0;
    if (max !== null && total > max && !(op.escolha && op.escolha.multipla)) {
      aviso('ERRO', op.nome + ' comprado ' + total + ' vezes; o máximo é ' + max + '.');
    }
    if (op.soNaCriacao) {
      /* a build é só o estado de criação: nada a avisar */
    }
  }
  const vistos = new Set();
  const opsCompradas = [];
  for (const { op } of ordenadas) {
    if (!vistos.has(op.id)) {
      vistos.add(op.id);
      opsCompradas.push(op);
    }
  }
  if (origemOp) opsCompradas.push(origemOp);
  for (const g of gifts) if (!vistos.has(g.op.id)) opsCompradas.push(g.op);
  // exclusões entre opções de Intensity e entre estas e as compras (Nomad, Twilight Zone, No Templates etc.)
  checarExclusoes([...intensityLinhas.map((l) => l.op), ...opsCompradas], ix, aviso, liberados);

  // opções de Intensity que bloqueiam categorias
  for (const { op: opInt, efeito } of efeitosRegra) {
    if (efeito.id === 'bloqueia-categoria') {
      const excecoes = efeito.exceto || [];
      for (const o of opsCompradas) {
        if (o.categoria === efeito.categoria && !excecoes.includes(o.id)) {
          aviso('ERRO', opInt.nome + ' bloqueia ' + efeito.categoria + ', mas a build tem ' + o.nome + '.');
        }
      }
    }
  }

  // --- Linhas de opção
  // montar por categoria, em ordem do documento
  const linhasPorCat = new Map();
  const empurra = (cat, linha) => {
    if (!linhasPorCat.has(cat)) linhasPorCat.set(cat, []);
    linhasPorCat.get(cat).push(linha);
  };
  const naoConfirmadas = new Map(); // nome -> true
  const regrasUsadas = new Map(); // id regra -> Set(nomes)
  const usaRegra = (id, nome) => {
    if (!regrasUsadas.has(id)) regrasUsadas.set(id, new Set());
    regrasUsadas.get(id).add(nome);
  };

  function linhaDeCompra(op, c, q) {
    const escolhas = lista(c.escolha);
    const multipla = !!(op.escolha && op.escolha.multipla);
    const nCompras = multipla ? 1 : q;
    const inicio = (op.__iniciais && op.__iniciais) || 0;
    let lista_ = 0;
    let img = 0;
    let fatal = null;
    let manual = false;
    const base = precosAnteriores.get(op.id) || 0;
    for (let k = 1; k <= nCompras; k++) {
      const p = precoDaCompra(op, base + k, escolhas);
      if (!p.ok) {
        if (p.manual) manual = true;
        else fatal = p.motivo;
        break;
      }
      lista_ += p.creditos;
      img += p.img;
    }
    precosAnteriores.set(op.id, base + nCompras);
    return { lista: lista_, img, fatal, manual, escolhas, q: nCompras };
  }
  const precosAnteriores = new Map();

  // Origem
  if (origemOp) {
    const c = { id: origemOp.id, escolha: estado.origem.escolha, quantidade: 1 };
    let custoCred = 0;
    let custoImg = 0;
    let rotuloEscolha = lista(estado.origem.escolha);
    const linha = { tipo: 'opcao', nome: origemOp.nome, escolha: rotuloEscolha, quantidade: 1, op: origemOp, categoria: 'origens' };
    if (origemOp.custo && origemOp.custo.tipo === 'precoDoTier') {
      const m = /^(.*?),\s*tier\s+([0-9]+|[xyzXYZ])\s*$/.exec(rotuloEscolha[0] || '');
      if (!m) {
        aviso('ERRO', origemOp.nome + ': informe o nome e o tier da companion, no formato "Nome, tier N".');
      } else {
        const p = precoDoTier(eco, m[2]);
        if (!p) aviso('ERRO', origemOp.nome + ': tier inválido (' + m[2] + ').');
        else {
          custoCred = p.creditos;
          custoImg = p.img;
          linha.companion = { nome: m[1].trim(), tier: normalizarTier(m[2]) };
          if (!(eco.precoPorTier && eco.precoPorTier.verificado)) naoConfirmadas.set('precoPorTier', true);
        }
      }
    } else {
      const p = precoDaCompra(origemOp, 1, rotuloEscolha);
      if (p.ok) {
        custoCred = p.creditos;
        custoImg = p.img;
      } else if (p.manual) {
        custoCred = Math.trunc(Number(estado.origem.custoManual) || 0);
        linha.manual = true;
        usaRegra(origemOp.regraEspecial || 'custo-textual', origemOp.nome);
      }
    }
    linha.lista = custoCred;
    linha.custo = custoCred;
    linha.custoImg = custoImg;
    if (origemOp.regraEspecial && !regraImplementada(origemOp.regraEspecial)) usaRegra(origemOp.regraEspecial, origemOp.nome);
    if (origemOp.verificado === false) naoConfirmadas.set(origemOp.nome, true);
    empurra('origens', linha);
  }

  // Intensity: linhas próprias
  // Compras explícitas, na ordem do documento
  for (const { c, op, q } of ordenadas) {
    const r = linhaDeCompra(op, c, q);
    const linha = {
      tipo: 'opcao',
      nome: op.nome,
      escolha: r.escolhas,
      quantidade: r.q > 1 ? r.q : 1,
      op,
      categoria: op.categoria,
      lista: r.lista,
      custoImg: r.img,
    };
    if (r.fatal) aviso('ERRO', op.nome + ': ' + r.fatal + '.');
    // regras especiais
    const itens = []; // { real, motivo }
    if (op.regraEspecial && !regraImplementada(op.regraEspecial)) usaRegra(op.regraEspecial, op.nome);
    if (r.manual) {
      linha.manual = true;
      linha.lista = Math.trunc(Number(c.custoManual) || 0);
      usaRegra(op.regraEspecial || 'custo-textual', op.nome);
    }
    // descontos de condição declarada
    const decl = new Set(lista(c.declaracoes));
    for (const d of op.descontos || []) {
      if (d.tipo === 'condicao') {
        if (decl.has(d.id)) itens.push({ real: (linha.lista * d.percentual) / 100, motivo: 'condição declarada: ' + d.id });
      } else {
        const rid = d.tipo === 'porMembro' ? 'defense-rebates' : d.tipo === 'porArquetipo' ? 'desconto-por-arquetipo' : 'custo-textual';
        usaRegra(rid, op.nome);
      }
    }
    if (typeof c.descontoManual === 'number' && c.descontoManual > 0) {
      itens.push({ real: c.descontoManual, motivo: 'informado pelo usuário' });
    }
    // brinde duplicado
    for (const d of descontoDeBrinde.get(c) || []) {
      itens.push({ real: d.valor, motivo: 'brinde duplicado de ' + d.de });
    }
    // teto de 80% (exceto Talents e Defenses)
    const semTeto = (eco.tetoDescontos && eco.tetoDescontos.semTeto) || ['talents', 'defenses'];
    const tetoPct = (eco.tetoDescontos && eco.tetoDescontos.percentual) || 80;
    let total = itens.reduce((a, i) => a + i.real, 0);
    if (!semTeto.includes(op.categoria)) {
      const max = (linha.lista * tetoPct) / 100;
      if (total > max + 1e-9) {
        aviso('AVISO', 'Descontos de ' + op.nome + ' passam de ' + tetoPct + '% do preço de lista; o motor limitou a ' + tetoPct + '%.');
        total = max;
      }
    }
    if (total > linha.lista) total = linha.lista;
    const custo = Math.max(0, teto(linha.lista - total));
    linha.custo = custo;
    linha.desconto = linha.lista - custo;
    linha.descontos = distribuirDesconto(itens, linha.desconto);
    if (op.verificado === false) naoConfirmadas.set(op.nome, true);
    empurra(op.categoria, linha);
  }
  // Brindes
  for (const g of gifts) {
    const linha = {
      tipo: 'opcao',
      nome: g.op.nome,
      escolha: [],
      quantidade: 1,
      op: g.op,
      categoria: g.op.categoria,
      lista: 0,
      custo: 0,
      custoImg: 0,
      gratisDe: g.de.nome,
    };
    if (g.op.verificado === false) naoConfirmadas.set(g.op.nome, true);
    empurra(g.op.categoria, linha);
  }

  // ordenar linhas de cada categoria pela ordem do documento (brindes e compras na mesma ordem)
  for (const [, ls] of linhasPorCat) {
    ls.sort((a, b) => {
      if (a.categoria === 'origens' && b.categoria === 'origens') return 0;
      const d = ix.ordem.get(a.op.id) - ix.ordem.get(b.op.id);
      if (d !== 0) return d;
      // compra antes do brinde da mesma opção
      return (a.gratisDe ? 1 : 0) - (b.gratisDe ? 1 : 0);
    });
  }

  // --- Companions
  const companions = [];
  for (const cp of estado.companions || []) {
    const t = normalizarTier(cp.tier);
    const linha = {
      tipo: 'companion',
      nome: cp.nome,
      obra: cp.obra || '-',
      tier: t,
      entrada: cp.entrada || 'compra',
      papel: cp.papel || 'companion',
      de: cp.de || '',
      estado: cp.estado || 'no séquito',
      custo: 0,
      custoImg: 0,
      ganho: 0,
      ganhoImg: 0,
      venda: 0,
      vendaImg: 0,
      desconto: 0,
      lista: 0,
      gratisDe: cp.gratisDe || '',
    };
    if (t == null) {
      aviso('ERRO', 'Companion ' + cp.nome + ': tier inválido (' + cp.tier + ').');
      companions.push(linha);
      continue;
    }
    const figurante = linha.papel === 'figurante';
    const p = precoDoTier(eco, t);
    if (linha.entrada === 'compra') {
      if (!p) aviso('ERRO', 'Companion ' + cp.nome + ': sem preço para o tier ' + t + '.');
      else {
        linha.lista = p.creditos;
        linha.listaImg = p.img;
        let cred = p.creditos;
        let img = p.img;
        if ((linha.papel === 'familiar' || linha.papel === 'follower') && linha.de) {
          const mestre = (estado.companions || []).find((x) => normalizarNome(x.nome) === normalizarNome(linha.de));
          if (mestre) {
            const desc = Math.floor(cred / 2);
            cred = cred - desc;
            linha.desconto = desc;
            linha.descontos = [{ valor: desc, motivo: '50% do mestre ' + linha.de }];
          } else {
            aviso('AVISO', 'Companion ' + cp.nome + ': mestre ' + linha.de + ' não está na build; sem desconto de 50%.');
          }
        }
        linha.custo = cred;
        linha.custoImg = img;
        if (!ehTierImaginario(t) && !(eco.precoPorTier && eco.precoPorTier.verificado)) naoConfirmadas.set('precoPorTier', true);
      }
    } else if (linha.entrada === 'captura') {
      const pg = pagamento(eco, 'captura', t, intensity, figurante);
      if (!pg) aviso('ERRO', 'Companion ' + cp.nome + ': sem valor de captura para o tier ' + t + '.');
      else {
        linha.ganho = pg.creditos;
        linha.ganhoImg = pg.img;
      }
    } else if (['gratis', 'origem', 'yeet'].includes(linha.entrada)) {
      /* custo 0 */
    } else {
      aviso('ERRO', 'Companion ' + cp.nome + ': entrada desconhecida (' + linha.entrada + ').');
    }
    if (linha.estado === 'vendida') {
      const pg = pagamento(eco, 'venda', t, intensity, figurante);
      if (!pg) aviso('ERRO', 'Companion ' + cp.nome + ': sem valor de venda para o tier ' + t + '.');
      else {
        linha.venda = pg.creditos;
        linha.vendaImg = pg.img;
      }
    }
    if (linha.entrada === 'captura' || linha.estado === 'vendida') {
      for (const idIt of idsIntensity) {
        const opIt = ix.porId.get(idIt);
        if (opIt && opIt.regraEspecial && !regraImplementada(opIt.regraEspecial)) usaRegra(opIt.regraEspecial, opIt.nome);
      }
      if (!ehTierImaginario(t) && !(eco.precoPorTier && eco.precoPorTier.verificado)) {
        // as tabelas de captura e venda são do documento; só a compra depende do preço por tier
      }
    }
    companions.push(linha);
  }

  // --- Saldo corrente
  let saldo = (budget == null ? 0 : budget) + emprestimo;
  let gastos = 0;
  let ganhos = 0;
  let imgGastos = 0;
  let imgGanhos = 0;
  const blocos = [];
  for (const b of BLOCOS) {
    if (b.categoria === 'intensity') continue;
    const ls = linhasPorCat.get(b.categoria) || [];
    if (ls.length === 0) continue;
    let sub = 0;
    for (const l of ls) {
      saldo -= l.custo;
      gastos += l.custo;
      sub += l.custo;
      imgGastos += l.custoImg || 0;
      l.saldo = saldo;
    }
    blocos.push({ categoria: b.categoria, titulo: b.titulo, linhas: ls, subtotal: { gastos: sub, ganhos: 0 } });
  }
  if (companions.length) {
    let sg = 0;
    let sn = 0;
    for (const l of companions) {
      const custo = l.custo;
      const ganho = l.ganho + l.venda;
      saldo = saldo - custo + ganho;
      sg += custo;
      sn += ganho;
      gastos += custo;
      ganhos += ganho;
      imgGastos += l.custoImg || 0;
      imgGanhos += (l.ganhoImg || 0) + (l.vendaImg || 0);
      l.saldo = saldo;
    }
    blocos.push({ categoria: 'companions', titulo: 'Companions', linhas: companions, subtotal: { gastos: sg, ganhos: sn } });
  }
  const dividas = saldo < 0;
  if (dividas) aviso('ERRO', 'Saldo final negativo (' + saldo + '): com dívida não há compras.');

  // --- Avisos derivados
  if (naoConfirmadas.has('precoPorTier')) {
    const afetados = [];
    for (const l of companions) if (l.entrada === 'compra' && !ehTierImaginario(l.tier)) afetados.push(l.nome);
    const orig = (linhasPorCat.get('origens') || []).find((l) => l.companion);
    if (orig) afetados.unshift(orig.companion.nome);
    const aviso_ = (eco.precoPorTier && eco.precoPorTier.aviso) || '';
    const lista_ = eco.precoPorTier && eco.precoPorTier.tier ? Object.values(eco.precoPorTier.tier).join(', ') : '';
    avisos.push({
      etiqueta: 'NÃO CONFIRMADO',
      texto:
        'Preço por tier (' + lista_ + '): a tabela do documento é uma imagem e não vem no texto exportado.' +
        (afetados.length ? ' Afeta: ' + afetados.join(', ') + '.' : ''),
    });
    naoConfirmadas.delete('precoPorTier');
    void aviso_;
  }
  for (const nome of naoConfirmadas.keys()) {
    avisos.push({
      etiqueta: 'NÃO CONFIRMADO',
      texto: nome + ': custo ou requisito vieram da referência sem conferência no documento (ver docs/pendencias-de-dados.md).',
    });
  }
  for (const [id, nomes] of regrasUsadas) {
    const r = REGRAS_ESPECIAIS[id];
    if (!r) {
      avisos.push({ etiqueta: 'NÃO IMPLEMENTADA', texto: id + ': regra desconhecida do motor. Afeta: ' + [...nomes].join(', ') + '.' });
    } else if (!r.implementada) {
      avisos.push({ etiqueta: 'NÃO IMPLEMENTADA', texto: r.titulo + ': ' + r.aviso + ' Afeta: ' + [...nomes].join(', ') + '.' });
    }
  }
  // ordem fixa das etiquetas
  const ordemEtiqueta = { ERRO: 0, 'NÃO CONFIRMADO': 1, 'NÃO IMPLEMENTADA': 2, AVISO: 3 };
  avisos.forEach((a, i) => (a.__i = i));
  avisos.sort((a, b) => ordemEtiqueta[a.etiqueta] - ordemEtiqueta[b.etiqueta] || a.__i - b.__i);
  avisos.forEach((a) => delete a.__i);

  const posseObj = {};
  for (const [id, n] of contagem) if (n > 0) posseObj[id] = n;
  return {
    posse: posseObj,
    origemSlug,
    resumo: {
      contractor: estado.contractor || '',
      mundo: estado.mundo || '',
      condicao: estado.condicao || '',
      dr,
      intensity,
      intensityConta: it.conta,
      budgetInicial: budget,
      emprestimo,
      limiteEmprestimo: limite,
    },
    intensity: { linhas: intensityLinhas, soma, conta: it.conta, base: it.base, valida: it.valida },
    blocos,
    conferencia: {
      budgetInicial: budget == null ? 0 : budget,
      emprestimo,
      ganhos,
      gastos,
      saldoFinal: saldo,
      divida: dividas,
      img: { gastos: imgGastos, ganhos: imgGanhos, saldo: imgGanhos - imgGastos },
    },
    avisos,
  };
}

// Reparte o desconto inteiro entre os itens (cada item entra com o piso do seu valor real;
// a sobra vai para o primeiro, e um corte do teto sai dos últimos).
export function distribuirDesconto(itens, totalInteiro) {
  const ints = itens.map((i) => ({ valor: Math.floor(i.real + 1e-9), motivo: i.motivo }));
  let soma = ints.reduce((a, i) => a + i.valor, 0);
  if (soma < totalInteiro && ints.length) {
    ints[0].valor += totalInteiro - soma;
    soma = totalInteiro;
  }
  for (let k = ints.length - 1; k >= 0 && soma > totalInteiro; k--) {
    const tira = Math.min(ints[k].valor, soma - totalInteiro);
    ints[k].valor -= tira;
    soma -= tira;
  }
  return ints.filter((i) => i.valor > 0);
}

function checarExclusoes(ops, ix, aviso, liberados = new Set()) {
  const ids = new Set(ops.map((o) => o.id));
  const grupos = new Map();
  const vistos = new Set();
  for (const o of ops) {
    for (const x of o.exclusoes || []) {
      if (ids.has(x)) {
        const par = [o.id, x].sort().join('|');
        if (vistos.has(par)) continue;
        vistos.add(par);
        const outro = ix.porId.get(x);
        aviso('ERRO', o.nome + ' e ' + (outro ? outro.nome : x) + ' não podem estar na mesma build.');
      }
    }
    if (o.grupoExclusivo && !liberados.has(o.grupoExclusivo)) {
      if (!grupos.has(o.grupoExclusivo)) grupos.set(o.grupoExclusivo, []);
      grupos.get(o.grupoExclusivo).push(o);
    }
  }
  for (const [g, os] of grupos) {
    if (os.length > 1) aviso('ERRO', os.map((o) => o.nome).join(' e ') + ' se excluem (grupo ' + g + '); só uma pode estar na build.');
  }
}
