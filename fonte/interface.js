// Interface do Waifu Catalog Builder. Só roda no navegador (WCB.iniciar(document)).
// Todo texto visível passa por t() (idiomas.js). Nomes de opção ficam em inglês, como no documento.
import { BLOCOS, calcular, estadoVazio, normalizarNome, requisitoAtendido, indexarDados, regraImplementada } from './motor.js';
import { renderizar, importarEConferir, ErroDeImportacao } from './texto.js';
import { t, definirIdioma, idiomaAtual } from './idiomas.js';

const CHAVE_RASCUNHO = 'wcb:rascunho';
const CHAVE_IDIOMA = 'wcb:idioma';
const TIERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'X', 'Y', 'Z'];

let doc = null;
let D = null; // dados
let IX = null; // índice
let E = estadoVazio(); // estado da build
let R = null; // resultado do cálculo
let aba = 'contrato';
let busca = '';
let subLivro = 'livro';
let livroAberto = false;
let mensagemImportacao = null; // { erro, textos }
let companionEmEdicao = null; // índice ou null
const hist = { passado: [], futuro: [] };

// ---------------------------------------------------------------------------
// Utilidades

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const semAcento = (s) => normalizarNome(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const $ = (sel, raiz) => (raiz || doc).querySelector(sel);
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString(idiomaAtual()) : String(n));
const comSinal = (n) => (n >= 0 ? '+' + n : '−' + Math.abs(n));

function lerLocal(chave) {
  try {
    return window.localStorage.getItem(chave);
  } catch (e) {
    return null;
  }
}
function gravarLocal(chave, valor) {
  try {
    window.localStorage.setItem(chave, valor);
    return true;
  } catch (e) {
    return false;
  }
}

function normalizarEstado(e) {
  const base = estadoVazio();
  const out = Object.assign(base, e || {});
  for (const k of ['intensity', 'compras', 'companions']) if (!Array.isArray(out[k])) out[k] = [];
  out.dr = Number.isInteger(out.dr) && out.dr >= 1 && out.dr <= 10 ? out.dr : 1;
  out.emprestimo = Math.max(0, Math.trunc(Number(out.emprestimo) || 0));
  return out;
}

function humanizar(slug) {
  const s = String(slug || '').replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Estado e histórico

export function estadoAtual() {
  return E;
}

function recalcular() {
  R = calcular(E, D);
}

function guardarRascunho() {
  gravarLocal(CHAVE_RASCUNHO, JSON.stringify(E));
}

function aplicar(mutador) {
  const antes = JSON.stringify(E);
  mutador(E);
  const depois = JSON.stringify(E);
  if (antes === depois) return;
  hist.passado.push(antes);
  if (hist.passado.length > 200) hist.passado.shift();
  hist.futuro = [];
  recalcular();
  guardarRascunho();
  renderizarTudo();
}

function desfazer() {
  if (!hist.passado.length) return;
  hist.futuro.push(JSON.stringify(E));
  E = normalizarEstado(JSON.parse(hist.passado.pop()));
  recalcular();
  guardarRascunho();
  renderizarTudo();
}
function refazer() {
  if (!hist.futuro.length) return;
  hist.passado.push(JSON.stringify(E));
  E = normalizarEstado(JSON.parse(hist.futuro.pop()));
  recalcular();
  guardarRascunho();
  renderizarTudo();
}

// ---------------------------------------------------------------------------
// Texto de preço

function precoTexto(op) {
  const c = op.custo || {};
  const moeda = c.moeda === 'IMG' ? ' IMG' : '';
  switch (c.tipo) {
    case 'gratis':
      return t('preco.gratis');
    case 'fixo':
      return c.valor + moeda;
    case 'sequencia':
    case 'porCompra': {
      const vs = (c.valores || []).join(' + ');
      const dep = c.depois ? ' +' + c.depois.incremento + '…' : '';
      return vs + dep + moeda;
    }
    case 'porEscolha':
      return t('preco.porEscolha');
    case 'precoDoTier':
      return t('preco.doTier');
    default:
      return t('preco.varia');
  }
}

function custoEhManual(op) {
  return ['formula', 'diferencaDeTier', 'percentualDoTier'].includes((op.custo || {}).tipo);
}

// ---------------------------------------------------------------------------
// Consultas ao estado

function comprasDe(id) {
  const r = [];
  E.compras.forEach((c, idx) => {
    if (c.id === id) r.push({ c, idx });
  });
  return r;
}

function brindesPorId() {
  const m = new Map();
  for (const b of R.blocos) for (const l of b.linhas) if (l.gratisDe && l.op) m.set(l.op.id, l.gratisDe);
  return m;
}

function maxCompras(op) {
  if (!op.repeticao) return 1;
  return op.repeticao.max === undefined ? 1 : op.repeticao.max;
}

function contagemDaAba(id) {
  if (id === 'contrato') return 0;
  if (id === 'intensity') return E.intensity.length;
  if (id === 'origens') return E.origem && E.origem.id ? 1 : 0;
  if (id === 'companions') return E.companions.length;
  let n = 0;
  for (const c of E.compras) {
    const op = IX.porId.get(c.id);
    if (op && op.categoria === id) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Renderização: topo

function renderTopo() {
  const c = R.conferencia;
  const negativo = c.saldoFinal < 0;
  const total = c.budgetInicial + c.emprestimo;
  const gastoLiquido = Math.max(0, c.gastos - c.ganhos);
  const pct = total > 0 ? Math.min(100, Math.round((gastoLiquido / total) * 100)) : 0;
  const erros = R.avisos.filter((a) => a.etiqueta === 'ERRO').length;
  const nc = R.avisos.filter((a) => a.etiqueta === 'NÃO CONFIRMADO').length;
  const img = c.img.gastos > 0 || c.img.ganhos > 0;
  return (
    '<div class="topo-linha">' +
    '<div class="marca-app"><h1>' + esc(t('app.titulo')) + '</h1><span>' + esc(t('app.sub')) + '</span></div>' +
    '<div class="saldo' + (negativo ? ' negativo' : '') + '" role="status">' +
    '<span class="saldo-rotulo">' + esc(t('topo.saldo')) + '</span>' +
    '<strong class="saldo-valor" id="saldo-valor">' + esc(fmt(c.saldoFinal)) + '</strong>' +
    (negativo ? '<span class="selo-divida">' + esc(t('topo.divida')) + '</span>' : '') +
    '</div>' +
    '<div class="acoes-topo">' +
    '<button class="btn" data-a="desfazer" data-foco="desfazer"' + (hist.passado.length ? '' : ' disabled') + '>' + esc(t('topo.desfazer')) + '</button>' +
    '<button class="btn" data-a="refazer" data-foco="refazer"' + (hist.futuro.length ? '' : ' disabled') + '>' + esc(t('topo.refazer')) + '</button>' +
    '<button class="btn" data-a="idioma" data-foco="idioma" lang="' + (idiomaAtual() === 'en' ? 'pt-BR' : 'en') + '" aria-label="' + esc(t('topo.idiomaRotulo')) + '">' + esc(t('topo.idioma')) + '</button>' +
    '<button class="btn primario so-movel" data-a="abrir-livro" data-foco="abrir-livro">' + esc(t('topo.livro')) + (erros ? ' (' + erros + ')' : '') + '</button>' +
    '</div>' +
    '</div>' +
    '<div class="fatos numero">' +
    '<span>' + esc(t('topo.intensity')) + ' <b>' + esc(R.resumo.intensity) + '</b></span>' +
    '<span>' + esc(t('topo.dr')) + ' <b>' + esc(R.resumo.dr) + '</b></span>' +
    '<span>' + esc(t('topo.budget')) + ' <b>' + esc(fmt(c.budgetInicial)) + '</b></span>' +
    '<span>' + esc(t('topo.emprestimo')) + ' <b>' + esc(fmt(c.emprestimo)) + '</b></span>' +
    '<span>' + esc(t('topo.gastos')) + ' <b>' + esc(fmt(c.gastos)) + '</b></span>' +
    '<span>' + esc(t('topo.ganhos')) + ' <b>' + esc(fmt(c.ganhos)) + '</b></span>' +
    (img ? '<span>' + esc(t('topo.img')) + ' <b>' + esc(comSinal(c.img.saldo)) + '</b></span>' : '') +
    (erros ? '<span style="color:var(--selo)">' + esc(t('topo.erros', erros)) + '</span>' : '') +
    (nc ? '<span>' + esc(t('topo.naoConfirmados', nc)) + '</span>' : '') +
    '</div>' +
    '<div class="medidor' + (negativo ? ' estourado' : '') + '" aria-hidden="true"><span style="width:' + pct + '%"></span></div>'
  );
}

// ---------------------------------------------------------------------------
// Renderização: abas

function listaDeAbas() {
  const abas = [{ id: 'contrato', rotulo: t('aba.contrato') }];
  for (const b of BLOCOS) abas.push({ id: b.categoria, rotulo: b.titulo });
  abas.push({ id: 'companions', rotulo: t('aba.companions') });
  return abas;
}

function renderAbas() {
  return (
    '<div class="abas" role="tablist" aria-label="' + esc(t('aba.categorias')) + '">' +
    listaDeAbas()
      .map((a) => {
        const n = contagemDaAba(a.id);
        return (
          '<button class="aba" role="tab" data-a="aba" data-id="' + esc(a.id) + '" data-foco="aba:' + esc(a.id) +
          '" aria-selected="' + (aba === a.id && !busca ? 'true' : 'false') + '">' +
          esc(a.rotulo) + (n ? '<span class="conta">' + n + '</span>' : '') + '</button>'
        );
      })
      .join('') +
    '</div>'
  );
}

// ---------------------------------------------------------------------------
// Renderização: opções

function marcasDe(op, brinde, falta) {
  const m = [];
  for (const tp of op.tipo || []) m.push('<span class="marca">' + esc(tp) + '</span>');
  if (op.soNaCriacao) m.push('<span class="marca">' + esc(t('marca.soCriacao')) + '</span>');
  if (op.verificado === false) m.push('<span class="marca nc" title="' + esc(t('marca.ncDica')) + '">' + esc(t('marca.naoConfirmado')) + '</span>');
  if (op.regraEspecial && !regraImpl(op.regraEspecial)) m.push('<span class="marca ni">' + esc(t('marca.naoImplementada')) + '</span>');
  if (brinde) m.push('<span class="marca grat">' + esc(t('marca.gratisDe', brinde)) + '</span>');
  if (falta && !falta.ok) m.push('<span class="marca falta">' + esc(t('marca.falta', falta.falta)) + '</span>');
  if (falta && falta.declarado) m.push('<span class="marca nc">' + esc(t('marca.declarado', falta.declarado.join('; '))) + '</span>');
  return m.length ? '<div class="marcas">' + m.join('') + '</div>' : '';
}

function regraImpl(id) {
  return regraImplementada(id);
}

function controlesDaCompra(op, c, idx) {
  const h = [];
  const max = maxCompras(op);
  const multipla = !!(op.escolha && op.escolha.multipla);
  if (!multipla && (max === null || max > 1)) {
    const q = c.quantidade || 1;
    h.push(
      '<span class="stepper"><button class="btn mini" data-a="menos" data-i="' + idx + '" data-foco="menos:' + idx + '" aria-label="' + esc(t('op.menos')) + '"' + (q <= 1 ? ' disabled' : '') + '>−</button>' +
      '<output aria-label="' + esc(t('op.quantidade')) + '">' + q + '</output>' +
      '<button class="btn mini" data-a="mais" data-i="' + idx + '" data-foco="mais:' + idx + '" aria-label="' + esc(t('op.mais')) + '"' + (max !== null && q >= max ? ' disabled' : '') + '>+</button></span>'
    );
  }
  if (op.escolha) {
    const e = op.escolha;
    const atual = Array.isArray(c.escolha) ? c.escolha : c.escolha ? [c.escolha] : [];
    if (e.tipo === 'lista') {
      if (multipla) {
        h.push(
          '<fieldset class="campo" style="border:0;padding:0;margin:0"><legend>' + esc(e.rotulo || t('op.escolha')) + '</legend>' +
          (e.opcoes || [])
            .map((o) => {
              const marcado = atual.some((x) => normalizarNome(x) === normalizarNome(o.valor));
              return '<label class="check"><input type="checkbox" data-a="escolha-multi" data-i="' + idx + '" data-v="' + esc(o.valor) + '"' + (marcado ? ' checked' : '') + '> ' + esc(o.valor) + (typeof o.custo === 'number' ? ' (' + o.custo + ')' : '') + '</label>';
            })
            .join('') + '</fieldset>'
        );
      } else {
        h.push(
          '<label class="campo">' + esc(e.rotulo || t('op.escolha')) + '<select data-a="escolha" data-i="' + idx + '" data-foco="escolha:' + idx + '">' +
          '<option value="">' + esc(t('op.escolher')) + '</option>' +
          (e.opcoes || []).map((o) => '<option' + (atual[0] && normalizarNome(atual[0]) === normalizarNome(o.valor) ? ' selected' : '') + ' value="' + esc(o.valor) + '">' + esc(o.valor) + (typeof o.custo === 'number' ? ' (' + o.custo + ')' : '') + '</option>').join('') +
          '</select></label>'
        );
      }
    } else {
      h.push('<label class="campo largo">' + esc(e.rotulo || t('op.escolha')) + '<input type="text" data-a="escolha" data-i="' + idx + '" data-foco="escolha:' + idx + '" value="' + esc(atual[0] || '') + '"></label>');
    }
  }
  const decl = new Set(Array.isArray(c.declaracoes) ? c.declaracoes : []);
  for (const d of op.descontos || []) {
    if (d.tipo === 'condicao') {
      h.push(
        '<label class="check"><input type="checkbox" data-a="declarar" data-i="' + idx + '" data-v="' + esc(d.id) + '"' + (decl.has(d.id) ? ' checked' : '') + '> ' +
        esc(t('op.condicaoVale', d.percentual, d.condicao || d.id)) + '</label>'
      );
    }
  }
  if (custoEhManual(op)) {
    h.push('<label class="campo">' + esc(t('op.custoManual')) + '<input type="number" inputmode="numeric" data-a="custo-manual" data-i="' + idx + '" data-foco="custo-manual:' + idx + '" value="' + esc(c.custoManual || 0) + '"></label>');
  }
  if ((op.descontos || []).some((d) => d.tipo !== 'condicao') || (op.regraEspecial && !regraImpl(op.regraEspecial) && !custoEhManual(op))) {
    h.push('<label class="campo">' + esc(t('op.descontoManual')) + '<input type="number" min="0" inputmode="numeric" data-a="desconto-manual" data-i="' + idx + '" data-foco="desconto-manual:' + idx + '" value="' + esc(c.descontoManual || 0) + '"></label>');
  }
  h.push('<button class="btn mini perigo" data-a="remover" data-i="' + idx + '" data-foco="remover:' + idx + '">' + esc(t('op.remover')) + '</button>');
  return h.join('');
}

function renderOpcao(op, brindes, mostrarCategoria) {
  const compras = comprasDe(op.id);
  const brinde = brindes.get(op.id);
  const falta = compras.length ? null : requisitoAtendido(op, R, D);
  const classe = 'opcao' + (compras.length ? ' sel' : brinde ? ' gratis' : '') + (falta && !falta.ok ? ' falta' : '');
  let corpo = '';
  if (compras.length) {
    corpo = compras.map(({ c, idx }) => '<div class="linha-compra">' + controlesDaCompra(op, c, idx) + '</div>').join('');
    if (op.escolha && !op.escolha.multipla && (maxCompras(op) === null || maxCompras(op) > compras.length)) {
      corpo += '<div class="controles"><button class="btn mini" data-a="adicionar" data-id="' + esc(op.id) + '" data-foco="adicionar:' + esc(op.id) + '">' + esc(t('op.adicionarOutra')) + '</button></div>';
    }
  } else {
    corpo = '<div class="controles"><button class="btn primario mini" data-a="adicionar" data-id="' + esc(op.id) + '" data-foco="adicionar:' + esc(op.id) + '">' + esc(t('op.adicionar')) + '</button></div>';
  }
  return (
    '<article class="' + classe + '" id="op-' + esc(op.id) + '">' +
    '<div class="opcao-cabeca"><h3>' + esc(op.nome) + '</h3><span class="preco">' + esc(precoTexto(op)) + '</span></div>' +
    (mostrarCategoria ? '<div class="dica">' + esc(IX.titulos.get(op.categoria) || op.categoria) + '</div>' : '') +
    (op.resumo ? '<p class="resumo">' + esc(op.resumo) + '</p>' : '') +
    marcasDe(op, brinde, falta) +
    corpo +
    '</article>'
  );
}

function renderIntensity() {
  const ops = D.categorias.intensity ? D.categorias.intensity.opcoes : [];
  const marcados = new Set(E.intensity);
  const it = R.intensity;
  const lista = ops
    .filter((op) => filtraBusca(op))
    .map((op) => {
      const v = (op.efeitos || []).filter((e) => e.tipo === 'intensity').reduce((a, e) => a + e.valor, 0);
      const outros = (op.efeitos || []).filter((e) => e.tipo !== 'intensity');
      return (
        '<article class="opcao' + (marcados.has(op.id) ? ' sel' : '') + '">' +
        '<div class="opcao-cabeca"><label class="check"><input type="checkbox" data-a="intensity" data-id="' + esc(op.id) + '" data-foco="intensity:' + esc(op.id) + '"' + (marcados.has(op.id) ? ' checked' : '') + '> <h3>' + esc(op.nome) + '</h3></label>' +
        '<span class="preco">' + esc(comSinal(v)) + '</span></div>' +
        (op.resumo ? '<p class="resumo">' + esc(op.resumo) + '</p>' : '') +
        (outros.length ? '<div class="marcas"><span class="marca ni">' + esc(t('marca.efeitoExtra')) + '</span></div>' : '') +
        '</article>'
      );
    })
    .join('');
  return (
    '<div class="painel-bloco"><h2>' + esc(t('intensity.titulo')) + '</h2>' +
    '<p class="dica">' + esc(t('intensity.dica')) + '</p>' +
    '<p class="conta-intensity numero">' + esc(t('intensity.conta', it.base, it.soma >= 0 ? '+' : '−', Math.abs(it.soma), it.conta)) +
    (it.conta > 10 ? ' <span class="dica">' + esc(t('intensity.vale10')) + '</span>' : '') +
    (!it.valida ? ' <span class="marca ni">' + esc(t('intensity.abaixoDeZero')) + '</span>' : '') + '</p></div>' +
    '<div class="opcoes">' + lista + '</div>'
  );
}

function renderOrigem() {
  const ops = D.categorias.origens ? D.categorias.origens.opcoes : [];
  const atual = E.origem && E.origem.id;
  const brindes = brindesPorId();
  return (
    '<div class="painel-bloco"><h2>' + esc(t('origem.titulo')) + '</h2><p class="dica">' + esc(t('origem.dica')) + '</p></div>' +
    '<div class="opcoes">' +
    ops
      .filter((op) => filtraBusca(op))
      .map((op) => {
        const sel = atual === op.id;
        let extra = '';
        if (sel && op.custo && op.custo.tipo === 'precoDoTier') {
          const m = /^(.*?),\s*tier\s+([0-9]+|[XYZxyz])\s*$/.exec((E.origem && E.origem.escolha) || '');
          const nome = m ? m[1] : (E.origem && E.origem.escolha) || '';
          const tier = m ? m[2].toUpperCase() : '';
          extra =
            '<div class="controles"><label class="campo largo">' + esc(t('origem.nome')) + '<input type="text" data-a="origem-nome" value="' + esc(nome) + '"></label>' +
            '<label class="campo">' + esc(t('origem.tier')) + '<select data-a="origem-tier"><option value="">' + esc(t('op.escolher')) + '</option>' +
            TIERS.map((x) => '<option value="' + x + '"' + (tier === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label></div>';
        } else if (sel && op.custo && ['formula', 'diferencaDeTier'].includes(op.custo.tipo)) {
          extra = '<div class="controles"><label class="campo">' + esc(t('op.custoManual')) + '<input type="number" inputmode="numeric" data-a="origem-custo" value="' + esc((E.origem && E.origem.custoManual) || 0) + '"></label></div>';
        }
        return (
          '<article class="opcao' + (sel ? ' sel' : '') + '">' +
          '<div class="opcao-cabeca"><label class="check"><input type="radio" name="origem" data-a="origem" data-id="' + esc(op.id) + '" data-foco="origem:' + esc(op.id) + '"' + (sel ? ' checked' : '') + '> <h3>' + esc(op.nome) + '</h3></label><span class="preco">' + esc(precoTexto(op)) + '</span></div>' +
          (op.resumo ? '<p class="resumo">' + esc(op.resumo) + '</p>' : '') +
          marcasDe(op, brindes.get(op.id), null) + extra + '</article>'
        );
      })
      .join('') +
    '</div>'
  );
}

function filtraBusca(op) {
  if (!busca) return true;
  const q = semAcento(busca);
  return semAcento(op.nome).includes(q) || semAcento(op.resumo || '').includes(q);
}

function renderCategoria(cat) {
  const ops = D.categorias[cat] ? D.categorias[cat].opcoes : [];
  const brindes = brindesPorId();
  const visiveis = ops.filter(filtraBusca);
  if (!visiveis.length) return '<p class="vazio">' + esc(t('lista.vazia')) + '</p>';
  let html = '';
  let grupoAtual = null;
  html += '<div class="opcoes">';
  for (const op of visiveis) {
    if ((op.grupo || '') !== grupoAtual) {
      grupoAtual = op.grupo || '';
      if (grupoAtual) html += '</div><h2 class="grupo">' + esc(humanizar(grupoAtual)) + '</h2><div class="opcoes">';
    }
    html += renderOpcao(op, brindes, false);
  }
  html += '</div>';
  return html;
}

function renderBusca() {
  const q = semAcento(busca);
  const brindes = brindesPorId();
  const achados = [];
  for (const [cat, info] of Object.entries(D.categorias)) {
    for (const op of info.opcoes) if (semAcento(op.nome).includes(q) || semAcento(op.resumo || '').includes(q)) achados.push(op);
  }
  if (!achados.length) return '<p class="vazio">' + esc(t('lista.vazia')) + '</p>';
  return (
    '<p class="dica">' + esc(t('busca.resultados', achados.length)) + '</p><div class="opcoes">' +
    achados.slice(0, 80).map((op) => (op.categoria === 'intensity' ? renderOpcaoIntensityBusca(op) : renderOpcao(op, brindes, true))).join('') + '</div>' +
    (achados.length > 80 ? '<p class="dica">' + esc(t('busca.refine')) + '</p>' : '')
  );
}
function renderOpcaoIntensityBusca(op) {
  const marcado = E.intensity.includes(op.id);
  const v = (op.efeitos || []).filter((e) => e.tipo === 'intensity').reduce((a, e) => a + e.valor, 0);
  return (
    '<article class="opcao' + (marcado ? ' sel' : '') + '"><div class="opcao-cabeca"><label class="check"><input type="checkbox" data-a="intensity" data-id="' + esc(op.id) + '"' + (marcado ? ' checked' : '') + '> <h3>' + esc(op.nome) + '</h3></label><span class="preco">' + esc(comSinal(v)) + '</span></div>' +
    '<div class="dica">Intensity</div>' + (op.resumo ? '<p class="resumo">' + esc(op.resumo) + '</p>' : '') + '</article>'
  );
}

function renderContrato() {
  const emprestimoMax = R.resumo.limiteEmprestimo;
  return (
    '<div class="painel-bloco"><h2>' + esc(t('contrato.titulo')) + '</h2><p class="dica">' + esc(t('contrato.dica')) + '</p>' +
    '<div class="formulario">' +
    '<label class="campo">' + esc(t('contrato.contractor')) + '<input type="text" data-a="campo" data-k="contractor" value="' + esc(E.contractor) + '"></label>' +
    '<label class="campo">' + esc(t('contrato.mundo')) + '<input type="text" data-a="campo" data-k="mundo" value="' + esc(E.mundo) + '"></label>' +
    '<label class="campo">' + esc(t('contrato.condicao')) + '<input type="text" data-a="campo" data-k="condicao" value="' + esc(E.condicao) + '"></label>' +
    '<label class="campo">' + esc(t('contrato.dr')) + '<select data-a="campo-num" data-k="dr">' +
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => '<option value="' + n + '"' + (E.dr === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
    '<label class="campo">' + esc(t('contrato.emprestimo')) + '<input type="number" min="0" inputmode="numeric" data-a="campo-num" data-k="emprestimo" value="' + esc(E.emprestimo) + '"></label>' +
    '</div>' +
    '<p class="dica">' + esc(t('contrato.limite', emprestimoMax == null ? '?' : emprestimoMax)) + '</p></div>' +
    '<div class="painel-bloco"><h2>' + esc(t('contrato.proximos')) + '</h2><p class="dica">' + esc(t('contrato.proximosDica')) + '</p></div>'
  );
}

function renderCompanions() {
  const ed = companionEmEdicao != null ? E.companions[companionEmEdicao] : null;
  const v = ed || { nome: '', obra: '', tier: '1', entrada: 'compra', papel: 'companion', de: '', estado: 'no séquito' };
  const sel = (valor, atual) => (String(valor) === String(atual) ? ' selected' : '');
  const linhas = R.blocos.find((b) => b.categoria === 'companions');
  return (
    '<div class="painel-bloco"><h2>' + esc(ed ? t('cp.editar') : t('cp.adicionar')) + '</h2><p class="dica">' + esc(t('cp.dica')) + '</p>' +
    '<div class="formulario" id="form-cp">' +
    '<label class="campo">' + esc(t('cp.nome')) + '<input type="text" id="cp-nome" value="' + esc(v.nome) + '"></label>' +
    '<label class="campo">' + esc(t('cp.obra')) + '<input type="text" id="cp-obra" value="' + esc(v.obra) + '"></label>' +
    '<label class="campo">' + esc(t('cp.tier')) + '<select id="cp-tier">' + TIERS.map((x) => '<option value="' + x + '"' + sel(x, v.tier) + '>' + x + '</option>').join('') + '</select></label>' +
    '<label class="campo">' + esc(t('cp.entrada')) + '<select id="cp-entrada">' +
    ['compra', 'captura', 'gratis', 'origem', 'yeet'].map((x) => '<option value="' + x + '"' + sel(x, v.entrada) + '>' + esc(t('cp.entrada.' + x)) + '</option>').join('') + '</select></label>' +
    '<label class="campo">' + esc(t('cp.papel')) + '<select id="cp-papel">' +
    ['companion', 'follower', 'familiar', 'figurante'].map((x) => '<option value="' + x + '"' + sel(x, v.papel) + '>' + esc(t('cp.papel.' + x)) + '</option>').join('') + '</select></label>' +
    '<label class="campo">' + esc(t('cp.de')) + '<input type="text" id="cp-de" value="' + esc(v.de || '') + '"></label>' +
    '<label class="campo">' + esc(t('cp.estado')) + '<select id="cp-estado">' +
    ['no séquito', 'vendida'].map((x) => '<option value="' + x + '"' + sel(x, v.estado) + '>' + esc(t('cp.estado.' + x)) + '</option>').join('') + '</select></label>' +
    '</div><div class="linha-botoes"><button class="btn primario" data-a="cp-salvar" data-foco="cp-salvar">' + esc(ed ? t('cp.salvar') : t('cp.adicionarBtn')) + '</button>' +
    (ed ? '<button class="btn" data-a="cp-cancelar">' + esc(t('cp.cancelar')) + '</button>' : '') + '</div>' +
    (mensagemCompanion ? '<p class="mensagem erro">' + esc(mensagemCompanion) + '</p>' : '') + '</div>' +
    (E.companions.length
      ? '<div class="opcoes">' +
        E.companions
          .map((c, i) => {
            const l = linhas ? linhas.linhas[i] : null;
            const valores = l ? valorDaLinhaCompanion(l) : '';
            return (
              '<article class="opcao sel"><div class="opcao-cabeca"><h3>' + esc(c.nome) + '</h3><span class="preco">' + esc(valores) + '</span></div>' +
              '<p class="resumo">' + esc(t('cp.resumo', c.obra || '-', c.tier, t('cp.entrada.' + c.entrada), t('cp.papel.' + c.papel))) + (c.de ? ' ' + esc(t('cp.deMestre', c.de)) : '') + (c.estado === 'vendida' ? ' ' + esc(t('cp.vendidaTxt')) : '') + '</p>' +
              '<div class="controles"><button class="btn mini" data-a="cp-editar" data-i="' + i + '" data-foco="cp-editar:' + i + '">' + esc(t('cp.editar')) + '</button>' +
              '<button class="btn mini perigo" data-a="cp-remover" data-i="' + i + '" data-foco="cp-remover:' + i + '">' + esc(t('op.remover')) + '</button></div></article>'
            );
          })
          .join('') + '</div>'
      : '<p class="vazio">' + esc(t('cp.vazio')) + '</p>')
  );
}
let mensagemCompanion = '';

function valorDaLinhaCompanion(l) {
  const p = [];
  if (l.custo) p.push('−' + l.custo);
  if (l.custoImg) p.push('−' + l.custoImg + ' IMG');
  if (l.ganho || l.ganhoImg) p.push('+' + (l.ganho || 0) + (l.ganhoImg ? ' + ' + l.ganhoImg + ' IMG' : ''));
  if (l.venda || l.vendaImg) p.push('+' + (l.venda || 0) + (l.vendaImg ? ' + ' + l.vendaImg + ' IMG' : ''));
  return p.join('  ') || '0';
}

function renderPrincipal() {
  let corpo;
  if (busca) corpo = renderBusca();
  else if (aba === 'contrato') corpo = renderContrato();
  else if (aba === 'intensity') corpo = renderIntensity();
  else if (aba === 'origens') corpo = renderOrigem();
  else if (aba === 'companions') corpo = renderCompanions();
  else corpo = renderCategoria(aba);
  return corpo;
}

// ---------------------------------------------------------------------------
// Livro-caixa

function celulaLinha(l) {
  let nome = esc(l.nome);
  if (l.escolha && l.escolha.length) nome += ' <span class="nota">[' + esc(l.escolha.join(', ')) + ']</span>';
  if (l.quantidade > 1) nome += ' ×' + l.quantidade;
  if (l.gratisDe) nome += '<span class="nota">' + esc(t('marca.gratisDe', l.gratisDe)) + '</span>';
  for (const d of l.descontos || []) nome += '<span class="nota">' + esc(t('livro.desconto', d.valor, d.motivo)) + '</span>';
  return nome;
}

function renderLivro() {
  const c = R.conferencia;
  let corpo = '';
  if (subLivro === 'livro') {
    corpo += '<table><caption>' + esc(t('livro.intensity')) + '</caption><tbody>';
    for (const l of R.intensity.linhas) corpo += '<tr><td>' + esc(l.nome) + '</td><td class="n">' + esc(comSinal(l.valor)) + '</td></tr>';
    corpo += '<tr class="sub"><td>' + esc(t('livro.conta')) + '</td><td class="n">' + R.intensity.base + ' ' + (R.intensity.soma >= 0 ? '+' : '−') + ' ' + Math.abs(R.intensity.soma) + ' = ' + R.intensity.conta + '</td></tr></tbody></table>';
    for (const b of R.blocos) {
      corpo += '<table><caption>' + esc(b.titulo) + '</caption><thead><tr><th>' + esc(t('livro.opcao')) + '</th><th class="n">' + esc(t('livro.valor')) + '</th><th class="n">' + esc(t('livro.saldo')) + '</th></tr></thead><tbody>';
      for (const l of b.linhas) {
        let valor = '';
        if (b.categoria === 'companions') valor = valorDaLinhaCompanion(l);
        else valor = (l.custo ? '−' + l.custo : '0') + (l.custoImg ? ' −' + l.custoImg + ' IMG' : '');
        corpo += '<tr><td>' + celulaLinha(l) + '</td><td class="n' + (l.ganho || l.venda ? ' positivo' : '') + '">' + esc(valor) + '</td><td class="n">' + esc(fmt(l.saldo)) + '</td></tr>';
      }
      if (b.categoria !== 'origens') {
        corpo += '<tr class="sub"><td>' + esc(t('livro.subtotal')) + '</td><td class="n">' + esc(b.categoria === 'companions' && b.subtotal.ganhos > 0 ? '−' + b.subtotal.gastos + ' +' + b.subtotal.ganhos : '−' + b.subtotal.gastos) + '</td><td></td></tr>';
      }
      corpo += '</tbody></table>';
    }
    corpo +=
      '<dl class="conferencia"><dt>' + esc(t('topo.budget')) + '</dt><dd>' + fmt(c.budgetInicial) + '</dd>' +
      '<dt>' + esc(t('topo.emprestimo')) + '</dt><dd>' + fmt(c.emprestimo) + '</dd>' +
      '<dt>' + esc(t('topo.ganhos')) + '</dt><dd>' + (c.ganhos > 0 ? '+' : '') + fmt(c.ganhos) + '</dd>' +
      '<dt>' + esc(t('topo.gastos')) + '</dt><dd>' + (c.gastos > 0 ? '−' : '') + fmt(c.gastos) + '</dd>' +
      '<dt class="final">' + esc(t('livro.saldoFinal')) + '</dt><dd class="final"' + (c.divida ? ' style="color:var(--selo)"' : '') + '>' + fmt(c.saldoFinal) + '</dd>' +
      (c.img.gastos || c.img.ganhos ? '<dt>' + esc(t('livro.imgSaldo')) + '</dt><dd>' + esc(comSinal(c.img.saldo)) + ' IMG</dd>' : '') + '</dl>';
  } else if (subLivro === 'avisos') {
    corpo += renderAvisos();
  } else {
    const texto = renderizar(R, D);
    corpo +=
      '<p class="dica">' + esc(t('texto.dica')) + '</p>' +
      '<div class="linha-botoes"><button class="btn primario" data-a="copiar" data-foco="copiar">' + esc(t('texto.copiar')) + '</button>' +
      '<button class="btn" data-a="baixar" data-foco="baixar">' + esc(t('texto.baixar')) + '</button></div>' +
      '<p class="mensagem" id="msg-copia" role="status"></p>' +
      '<textarea class="texto-build" readonly id="texto-build" aria-label="' + esc(t('texto.rotulo')) + '">' + esc(texto) + '</textarea>' +
      '<h2 style="font-size:1.05rem;margin-top:18px">' + esc(t('importar.titulo')) + '</h2><p class="dica">' + esc(t('importar.dica')) + '</p>' +
      '<textarea class="texto-build" style="min-height:8rem" id="texto-importar" aria-label="' + esc(t('importar.rotulo')) + '"></textarea>' +
      '<div class="linha-botoes"><button class="btn primario" data-a="importar" data-foco="importar">' + esc(t('importar.botao')) + '</button>' +
      '<label class="btn" style="display:inline-flex;align-items:center">' + esc(t('importar.arquivo')) + '<input type="file" accept=".txt,text/plain" data-a="arquivo" class="visualmente-oculto"></label></div>' +
      (mensagemImportacao ? '<div class="mensagem' + (mensagemImportacao.erro ? ' erro' : '') + '" role="status">' + mensagemImportacao.textos.map((x) => '<p style="margin:2px 0">' + esc(x) + '</p>').join('') + '</div>' : '');
  }
  const nAv = R.avisos.length;
  return (
    '<div class="livro-cabeca"><h2>' + esc(t('topo.livro')) + '</h2><button class="btn mini so-movel" data-a="fechar-livro">' + esc(t('livro.fechar')) + '</button></div>' +
    '<div class="livro-abas" role="tablist">' +
    [['livro', t('livro.aba.livro')], ['avisos', t('livro.aba.avisos') + (nAv ? ' (' + nAv + ')' : '')], ['texto', t('livro.aba.texto')]]
      .map(([id, rot]) => '<button class="aba" role="tab" data-a="sub-livro" data-id="' + id + '" data-foco="sub:' + id + '" aria-selected="' + (subLivro === id) + '">' + esc(rot) + '</button>')
      .join('') +
    '</div><div class="livro-corpo">' + corpo + '</div>'
  );
}

function renderAvisos() {
  if (!R.avisos.length) return '<p class="vazio">' + esc(t('avisos.nenhum')) + '</p>';
  const cls = { ERRO: 'ERRO', 'NÃO CONFIRMADO': 'NC', 'NÃO IMPLEMENTADA': 'NI', AVISO: '' };
  return '<ul class="avisos">' + R.avisos.map((a) => '<li class="' + cls[a.etiqueta] + '"><b>' + esc(t('etiqueta.' + a.etiqueta)) + '</b> ' + esc(a.texto) + '</li>').join('') + '</ul>';
}

// ---------------------------------------------------------------------------
// Renderização geral

function renderizarTudo() {
  const foco = doc.activeElement && doc.activeElement.getAttribute ? doc.activeElement.getAttribute('data-foco') : null;
  const topo = $('#topo');
  const abas = $('#abas');
  const principal = $('#conteudo');
  const livro = $('#livro');
  const y = window.scrollY;
  topo.innerHTML = renderTopo();
  abas.innerHTML = renderAbas();
  principal.innerHTML = renderPrincipal();
  livro.innerHTML = renderLivro();
  livro.classList.toggle('aberto', livroAberto);
  const fundo = $('#fundo-livro');
  if (fundo) fundo.hidden = !livroAberto;
  if (foco) {
    const el = doc.querySelector('[data-foco="' + foco.replace(/"/g, '\\"') + '"]');
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }
  window.scrollTo(0, y);
}

function montarEstrutura() {
  const app = $('#app');
  app.innerHTML =
    '<header class="topo" id="topo"></header>' +
    '<main class="principal">' +
    '<div id="abas"></div>' +
    '<div class="busca"><input type="search" id="busca" placeholder="' + esc(t('busca.placeholder')) + '" aria-label="' + esc(t('busca.rotulo')) + '"></div>' +
    '<div id="conteudo"></div>' +
    '<p class="rodape">' + esc(t('rodape.aviso')) + '</p>' +
    '</main>' +
    '<div class="fundo-livro" id="fundo-livro" hidden data-a="fechar-livro"></div>' +
    '<aside class="livro" id="livro" aria-label="' + esc(t('topo.livro')) + '"></aside>';
}

// ---------------------------------------------------------------------------
// Ações

function adicionarCompra(id) {
  const op = IX.porId.get(id);
  if (!op) return;
  aplicar((e) => {
    const c = { id };
    if (op.escolha && op.escolha.tipo === 'lista' && !op.escolha.multipla) c.escolha = '';
    e.compras.push(c);
  });
}

function copiar() {
  const ta = $('#texto-build');
  const msg = $('#msg-copia');
  const texto = ta ? ta.value : '';
  const ok = () => {
    if (msg) msg.textContent = t('texto.copiado');
  };
  const falha = () => {
    if (ta) {
      ta.focus();
      ta.select();
    }
    if (msg) msg.textContent = t('texto.copiarFalhou');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, falha);
  else falha();
}

function baixar(nome, texto) {
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = nome;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nomeDeArquivo() {
  const base = (E.contractor || 'build').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'build';
  return 'waifu-catalog-' + base.toLowerCase() + '.txt';
}

function importar(texto) {
  try {
    const r = importarEConferir(texto, D);
    aplicar((e) => {
      const novo = normalizarEstado(r.estado);
      for (const k of Object.keys(e)) delete e[k];
      Object.assign(e, novo);
    });
    mensagemImportacao = { erro: false, textos: [t('importar.ok')].concat(r.avisos.map((a) => a.texto)) };
  } catch (err) {
    mensagemImportacao = { erro: true, textos: [err instanceof ErroDeImportacao ? err.message : t('importar.falhou')] };
  }
  renderizarTudo();
}

function lerCompanionDoForm() {
  const g = (id) => ($('#' + id) ? $('#' + id).value.trim() : '');
  return {
    nome: g('cp-nome'), obra: g('cp-obra'), tier: g('cp-tier'), entrada: g('cp-entrada'),
    papel: g('cp-papel'), de: g('cp-de'), estado: g('cp-estado'),
  };
}

function aoClicar(ev) {
  const el = ev.target.closest('[data-a]');
  if (!el) return;
  const a = el.getAttribute('data-a');
  const id = el.getAttribute('data-id');
  const i = el.hasAttribute('data-i') ? parseInt(el.getAttribute('data-i'), 10) : null;
  switch (a) {
    case 'aba': aba = id; busca = ''; $('#busca').value = ''; companionEmEdicao = null; renderizarTudo(); break;
    case 'sub-livro': subLivro = id; renderizarTudo(); break;
    case 'abrir-livro': livroAberto = true; renderizarTudo(); break;
    case 'fechar-livro': livroAberto = false; renderizarTudo(); break;
    case 'idioma': trocarIdioma(); break;
    case 'desfazer': desfazer(); break;
    case 'refazer': refazer(); break;
    case 'adicionar': adicionarCompra(id); break;
    case 'remover': aplicar((e) => e.compras.splice(i, 1)); break;
    case 'mais': aplicar((e) => { e.compras[i].quantidade = (e.compras[i].quantidade || 1) + 1; }); break;
    case 'menos': aplicar((e) => { const q = (e.compras[i].quantidade || 1) - 1; if (q <= 1) delete e.compras[i].quantidade; else e.compras[i].quantidade = q; }); break;
    case 'copiar': copiar(); break;
    case 'baixar': baixar(nomeDeArquivo(), renderizar(R, D)); break;
    case 'importar': importar(($('#texto-importar') || { value: '' }).value); break;
    case 'cp-salvar': salvarCompanion(); break;
    case 'cp-cancelar': companionEmEdicao = null; mensagemCompanion = ''; renderizarTudo(); break;
    case 'cp-editar': companionEmEdicao = i; renderizarTudo(); break;
    case 'cp-remover': aplicar((e) => e.companions.splice(i, 1)); break;
    default: break;
  }
}

function trocarIdioma() {
  const novo = idiomaAtual() === 'en' ? 'pt' : 'en';
  definirIdioma(novo);
  gravarLocal(CHAVE_IDIOMA, novo);
  doc.documentElement.lang = novo === 'en' ? 'en' : 'pt-BR';
  const valorBusca = busca;
  montarEstrutura();
  const campo = $('#busca');
  if (campo) campo.value = valorBusca;
  ligarBusca();
  renderizarTudo();
}

function ligarBusca() {
  $('#busca').addEventListener('input', (ev) => {
    busca = ev.target.value.trim();
    $('#abas').innerHTML = renderAbas();
    $('#conteudo').innerHTML = renderPrincipal();
  });
}

function salvarCompanion() {
  const v = lerCompanionDoForm();
  if (!v.nome) {
    mensagemCompanion = t('cp.nomeObrigatorio');
    renderizarTudo();
    return;
  }
  mensagemCompanion = '';
  const tier = ['X', 'Y', 'Z'].includes(v.tier) ? v.tier : parseInt(v.tier, 10);
  const novo = { nome: v.nome, obra: v.obra, tier, entrada: v.entrada, papel: v.papel, estado: v.estado };
  if (v.de) novo.de = v.de;
  const idx = companionEmEdicao;
  companionEmEdicao = null;
  aplicar((e) => {
    if (idx != null && e.companions[idx]) e.companions[idx] = novo;
    else e.companions.push(novo);
  });
  renderizarTudo();
}

function aoMudar(ev) {
  const el = ev.target;
  const a = el.getAttribute && el.getAttribute('data-a');
  if (!a) return;
  const id = el.getAttribute('data-id');
  const i = el.hasAttribute('data-i') ? parseInt(el.getAttribute('data-i'), 10) : null;
  const v = el.value;
  switch (a) {
    case 'campo': aplicar((e) => { e[el.getAttribute('data-k')] = v.trim(); }); break;
    case 'campo-num': aplicar((e) => { e[el.getAttribute('data-k')] = Math.max(0, parseInt(v, 10) || 0) || (el.getAttribute('data-k') === 'dr' ? 1 : 0); }); break;
    case 'intensity': aplicar((e) => { const k = e.intensity.indexOf(id); if (el.checked && k < 0) e.intensity.push(id); else if (!el.checked && k >= 0) e.intensity.splice(k, 1); }); break;
    case 'origem': aplicar((e) => { e.origem = { id, escolha: '' }; }); break;
    case 'origem-nome': case 'origem-tier': {
      const nome = a === 'origem-nome' ? v.trim() : (($('[data-a="origem-nome"]') || {}).value || '').trim();
      const tier = a === 'origem-tier' ? v : (($('[data-a="origem-tier"]') || {}).value || '');
      aplicar((e) => { if (e.origem) e.origem.escolha = tier ? nome + ', tier ' + tier : nome; });
      break;
    }
    case 'origem-custo': aplicar((e) => { if (e.origem) e.origem.custoManual = parseInt(v, 10) || 0; }); break;
    case 'escolha': aplicar((e) => { e.compras[i].escolha = v; if (!v) delete e.compras[i].escolha; }); break;
    case 'escolha-multi': aplicar((e) => {
      const c = e.compras[i];
      let l = Array.isArray(c.escolha) ? c.escolha.slice() : c.escolha ? [c.escolha] : [];
      const val = el.getAttribute('data-v');
      l = l.filter((x) => normalizarNome(x) !== normalizarNome(val));
      if (el.checked) l.push(val);
      if (l.length) c.escolha = l; else delete c.escolha;
    }); break;
    case 'declarar': aplicar((e) => {
      const c = e.compras[i];
      const val = el.getAttribute('data-v');
      let l = Array.isArray(c.declaracoes) ? c.declaracoes.filter((x) => x !== val) : [];
      if (el.checked) l.push(val);
      if (l.length) c.declaracoes = l; else delete c.declaracoes;
    }); break;
    case 'custo-manual': aplicar((e) => { const n = parseInt(v, 10) || 0; if (n) e.compras[i].custoManual = n; else delete e.compras[i].custoManual; }); break;
    case 'desconto-manual': aplicar((e) => { const n = parseInt(v, 10) || 0; if (n > 0) e.compras[i].descontoManual = n; else delete e.compras[i].descontoManual; }); break;
    case 'arquivo': {
      const f = el.files && el.files[0];
      if (!f) break;
      const leitor = new FileReader();
      leitor.onload = () => importar(String(leitor.result));
      leitor.readAsText(f);
      break;
    }
    default: break;
  }
}

function aoTeclar(ev) {
  const mod = ev.ctrlKey || ev.metaKey;
  if (mod && (ev.key === 'z' || ev.key === 'Z') && !ev.target.matches('input[type="text"], input[type="search"], textarea')) {
    ev.preventDefault();
    if (ev.shiftKey) refazer();
    else desfazer();
  } else if (mod && (ev.key === 'y' || ev.key === 'Y') && !ev.target.matches('input[type="text"], input[type="search"], textarea')) {
    ev.preventDefault();
    refazer();
  } else if (ev.key === 'Escape' && livroAberto) {
    livroAberto = false;
    renderizarTudo();
  }
}

// ---------------------------------------------------------------------------
// Início

export function iniciar(documento) {
  doc = documento;
  const bruto = $('#dados').textContent;
  D = JSON.parse(bruto);
  IX = indexarDados(D);
  IX.titulos = new Map(BLOCOS.map((b) => [b.categoria, b.titulo]));
  const idioma = lerLocal(CHAVE_IDIOMA);
  if (idioma) definirIdioma(idioma);
  else definirIdioma((window.navigator.language || 'pt').toLowerCase().startsWith('en') ? 'en' : 'pt');
  doc.documentElement.lang = idiomaAtual() === 'en' ? 'en' : 'pt-BR';
  const rasc = lerLocal(CHAVE_RASCUNHO);
  if (rasc) {
    try {
      E = normalizarEstado(JSON.parse(rasc));
    } catch (e) {
      E = estadoVazio();
    }
  }
  recalcular();
  montarEstrutura();
  const app = $('#app');
  app.addEventListener('click', aoClicar);
  app.addEventListener('change', aoMudar);
  doc.addEventListener('keydown', aoTeclar);
  ligarBusca();
  renderizarTudo();
}
