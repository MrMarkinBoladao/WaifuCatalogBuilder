// Exportação e importação do texto da build (formato wcb/1, docs/formato-da-build.md).
// Puro: sem DOM. Depende só de motor.js.
import { BLOCOS, VERSAO_BUILDER, calcular, indexarDados, normalizarNome, estadoVazio } from './motor.js';

export const FORMATO = 'wcb/1';

const TITULOS_BLOCO = [
  'Resumo', 'Intensity', 'Origin', 'Heritage', 'Bindings', 'Lures', 'Other Controls',
  'Sanctuaries & Strongholds', 'Talents', 'Defenses', 'Other Perks', 'Company Services',
  'Companions', 'Conferência', 'Avisos',
];

function sinalTxt(n) {
  return n >= 0 ? '+' + n : String(n);
}

function limparEscolha(s) {
  return String(s).replace(/\|/g, '/').replace(/\]/g, ')').replace(/[\r\n]+/g, ' ').trim();
}

function limparTexto(s) {
  return String(s == null ? '' : s).replace(/\|/g, '/').replace(/[\r\n]+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Exportação

export function linhaDeOpcao(l) {
  let s = '- ' + l.nome;
  if (l.escolha && l.escolha.length) s += ' [' + l.escolha.map(limparEscolha).join(', ') + ']';
  if (l.quantidade > 1) s += ' x' + l.quantidade;
  const campos = [];
  const soImg = (l.custoImg || 0) > 0 && !(l.custo > 0) && !l.gratisDe && !(l.lista > 0);
  if (!soImg) campos.push('custo ' + l.custo);
  if ((l.custoImg || 0) > 0) campos.push('custo-img ' + l.custoImg);
  if (l.desconto > 0 || l.lista !== l.custo) {
    if (l.lista !== l.custo) campos.push('lista ' + l.lista);
    for (const d of l.descontos || []) campos.push('desconto ' + d.valor + ' (' + limparTexto(d.motivo) + ')');
  }
  if (l.gratisDe) campos.push('gratis-de ' + l.gratisDe);
  if (!soImg) campos.push('saldo ' + l.saldo);
  return [s].concat(campos).join(' | ');
}

export function linhaDeCompanion(l) {
  const campos = [
    '- ' + l.nome,
    'obra ' + (l.obra || '-'),
    'tier ' + (l.tier == null ? '?' : l.tier),
    'entrada ' + l.entrada,
    'papel ' + l.papel,
  ];
  if (l.de) campos.push('de ' + l.de);
  campos.push('estado ' + l.estado);
  const tem = (n) => n > 0;
  if (l.entrada === 'compra') {
    if (tem(l.custo) || !tem(l.custoImg)) campos.push('custo ' + l.custo);
    if (tem(l.custoImg)) campos.push('custo-img ' + l.custoImg);
    if (l.lista !== l.custo && l.lista > 0) campos.push('lista ' + l.lista);
    for (const d of l.descontos || []) campos.push('desconto ' + d.valor + ' (' + limparTexto(d.motivo) + ')');
  } else if (l.entrada === 'captura') {
    campos.push('ganho ' + l.ganho);
    if (tem(l.ganhoImg)) campos.push('ganho-img ' + l.ganhoImg);
  } else {
    campos.push('custo 0');
  }
  if (l.estado === 'vendida') {
    campos.push('venda ' + l.venda);
    if (tem(l.vendaImg)) campos.push('venda-img ' + l.vendaImg);
  }
  if (l.gratisDe) campos.push('gratis-de ' + l.gratisDe);
  campos.push('saldo ' + l.saldo);
  return campos.join(' | ');
}

export function exportarTexto(estado, dados) {
  const r = calcular(estado, dados);
  return renderizar(r, dados);
}

export function renderizar(r, dados) {
  const out = [];
  out.push('WAIFU CATALOG BUILD');
  out.push('Formato: ' + FORMATO);
  out.push('Documento: ' + (dados.versaoDocumento || ''));
  out.push('Builder: ' + VERSAO_BUILDER);
  out.push('');
  out.push('## Resumo');
  const rs = r.resumo;
  if (rs.contractor) out.push('Contractor: ' + limparTexto(rs.contractor));
  if (rs.mundo) out.push('Mundo inicial: ' + limparTexto(rs.mundo) + (rs.condicao ? ' [' + limparTexto(rs.condicao) + ']' : ''));
  out.push('DR: ' + rs.dr);
  out.push('Intensity: ' + rs.intensity);
  out.push('Budget inicial: ' + (rs.budgetInicial == null ? 0 : rs.budgetInicial));
  out.push('Empréstimo na criação: ' + rs.emprestimo);
  out.push('Limite de empréstimo: ' + (rs.limiteEmprestimo == null ? 0 : rs.limiteEmprestimo));
  out.push('');
  out.push('## Intensity');
  for (const l of r.intensity.linhas) out.push('- ' + l.nome + ' | valor ' + sinalTxt(l.valor));
  out.push('Soma das cláusulas: ' + sinalTxt(r.intensity.soma));
  const conta = r.intensity.conta;
  out.push(
    'Conta: ' + r.intensity.base + (r.intensity.soma >= 0 ? ' + ' : ' - ') + Math.abs(r.intensity.soma) + ' = ' + conta +
      (conta > 10 ? ' (vale 10 para budget e pagamentos)' : '')
  );
  out.push('');
  for (const b of r.blocos) {
    out.push('## ' + b.titulo);
    for (const l of b.linhas) out.push(l.tipo === 'companion' ? linhaDeCompanion(l) : linhaDeOpcao(l));
    if (b.categoria !== 'origens') {
      if (b.categoria === 'companions' && b.subtotal.ganhos > 0) {
        out.push('Subtotal: gastos ' + b.subtotal.gastos + ', ganhos ' + b.subtotal.ganhos);
      } else {
        out.push('Subtotal: ' + b.subtotal.gastos);
      }
    }
    out.push('');
  }
  const c = r.conferencia;
  out.push('## Conferência');
  out.push('Budget inicial: ' + c.budgetInicial);
  out.push('Empréstimo: ' + c.emprestimo);
  out.push('Ganhos: ' + c.ganhos);
  out.push('Gastos: ' + c.gastos);
  out.push('Saldo final: ' + c.saldoFinal);
  out.push('Dívida: ' + (c.divida ? 'sim' : 'não'));
  if (c.img.gastos > 0 || c.img.ganhos > 0) {
    out.push('IMG gastos: ' + c.img.gastos);
    out.push('IMG ganhos: ' + c.img.ganhos);
    out.push('IMG saldo: ' + c.img.saldo);
  }
  out.push('');
  out.push('## Avisos');
  if (r.avisos.length === 0) out.push('- nenhum');
  for (const a of r.avisos) out.push('- [' + a.etiqueta + '] ' + limparTexto(a.texto));
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Importação

export class ErroDeImportacao extends Error {}

function partirCampos(resto) {
  // "campo valor | campo valor"
  return resto.split(' | ').map((p) => p.trim()).filter((p) => p !== '');
}

function numero(s) {
  const n = Number(String(s).replace('+', ''));
  return Number.isFinite(n) ? n : null;
}

// Nome, escolha e quantidade a partir da primeira parte da linha.
export function lerCabecaDaLinha(txt) {
  let nome = txt.replace(/^-\s*/, '').trim();
  let q = 1;
  const mq = /\s+x(\d+)$/.exec(nome);
  if (mq) {
    q = parseInt(mq[1], 10);
    nome = nome.slice(0, mq.index).trim();
  }
  let escolha = [];
  const me = /\s*\[([^\]]*)\]$/.exec(nome);
  if (me) {
    escolha = me[1].split(/,\s+/).map((x) => x.trim()).filter((x) => x !== '');
    nome = nome.slice(0, me.index).trim();
  }
  return { nome, escolha, q };
}

export function importarTexto(texto, dados) {
  const ix = indexarDados(dados);
  const avisos = []; // { etiqueta, texto }
  const linhas = String(texto).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < linhas.length && linhas[i].trim() === '') i++;
  if (linhas[i] !== 'WAIFU CATALOG BUILD') {
    throw new ErroDeImportacao('O texto não começa com "WAIFU CATALOG BUILD": não é uma build do Builder.');
  }
  const fmt = /^Formato:\s*(.+)$/.exec(linhas[i + 1] || '');
  if (!fmt || fmt[1].trim() !== FORMATO) {
    throw new ErroDeImportacao('Formato não reconhecido (' + (fmt ? fmt[1].trim() : 'ausente') + '). Este Builder abre só ' + FORMATO + '.');
  }
  // blocos
  const blocos = new Map();
  let atual = null;
  for (let k = i + 2; k < linhas.length; k++) {
    const m = /^##\s+(.+?)\s*$/.exec(linhas[k]);
    if (m) {
      const t = m[1];
      if (blocos.has(t)) throw new ErroDeImportacao('Bloco repetido: ' + t + '.');
      if (!TITULOS_BLOCO.includes(t)) avisos.push({ etiqueta: 'AVISO', texto: 'Bloco desconhecido ignorado: ' + t + '.' });
      atual = [];
      blocos.set(t, atual);
    } else if (atual) {
      if (linhas[k].trim() !== '') atual.push(linhas[k]);
    }
  }
  const estado = estadoVazio();
  estado.desconhecidas = [];

  // Resumo
  for (const l of blocos.get('Resumo') || []) {
    const m = /^([^:]+):\s*(.*)$/.exec(l);
    if (!m) continue;
    const v = m[2].trim();
    if (m[1] === 'Contractor') estado.contractor = v;
    else if (m[1] === 'Mundo inicial') {
      const mm = /^(.*?)\s*\[([^\]]*)\]$/.exec(v);
      if (mm) {
        estado.mundo = mm[1];
        estado.condicao = mm[2];
      } else estado.mundo = v;
    } else if (m[1] === 'DR') estado.dr = numero(v) == null ? 1 : numero(v);
    else if (m[1] === 'Empréstimo na criação') estado.emprestimo = numero(v) || 0;
  }

  const buscar = (cat, nome) => {
    const mp = ix.porNome.get(cat);
    return mp ? mp.get(normalizarNome(nome)) : null;
  };

  // Intensity
  for (const l of blocos.get('Intensity') || []) {
    if (!l.startsWith('- ')) continue;
    const partes = partirCampos(l.slice(2));
    const op = buscar('intensity', partes[0]);
    if (!op) estado.desconhecidas.push({ bloco: 'Intensity', texto: partes[0] });
    else estado.intensity.push(op.id);
  }

  // Blocos de opção
  const mapaBlocos = BLOCOS.filter((b) => b.categoria !== 'intensity');
  const comprasPorChave = new Map();
  for (const b of mapaBlocos) {
    const ls = blocos.get(b.titulo) || [];
    for (const l of ls) {
      if (!l.startsWith('- ')) continue;
      const partes = partirCampos(l.slice(2));
      const cab = lerCabecaDaLinha(partes[0]);
      const campos = {};
      const descontos = [];
      for (const p of partes.slice(1)) {
        const mc = /^(\S+)\s*(.*)$/.exec(p);
        if (!mc) continue;
        if (mc[1] === 'desconto') descontos.push(mc[2]);
        else campos[mc[1]] = mc[2];
      }
      if (campos['gratis-de'] !== undefined) continue; // brinde: recalculado
      const op = buscar(b.categoria, cab.nome);
      if (!op) {
        estado.desconhecidas.push({ bloco: b.titulo, texto: cab.nome });
        continue;
      }
      if (b.categoria === 'origens') {
        estado.origem = { id: op.id, escolha: cab.escolha.join(', ') };
        if (campos.custo !== undefined && op.custo && op.custo.tipo === 'formula') estado.origem.custoManual = numero(campos.custo) || 0;
        continue;
      }
      const compra = { id: op.id, escolha: cab.escolha.length ? cab.escolha : undefined, quantidade: cab.q };
      if (!compra.escolha) delete compra.escolha;
      if (compra.quantidade === 1) delete compra.quantidade;
      const custoFormula = op.custo && ['formula', 'diferencaDeTier', 'percentualDoTier'].includes(op.custo.tipo);
      if (custoFormula && campos.custo !== undefined) compra.custoManual = (numero(campos.custo) || 0) + sumDescontosManuais(descontos, false);
      for (const d of descontos) {
        const md = /^(\d+)\s*\((.*)\)$/.exec(d);
        if (!md) continue;
        const motivo = md[2];
        if (/^informado/.test(motivo)) compra.descontoManual = (compra.descontoManual || 0) + parseInt(md[1], 10);
        else if (/^condição declarada:\s*(.+)$/.test(motivo)) {
          compra.declaracoes = (compra.declaracoes || []).concat(/^condição declarada:\s*(.+)$/.exec(motivo)[1].trim());
        }
      }
      const chave = JSON.stringify([compra.id, compra.escolha || null, compra.custoManual || 0]);
      if (comprasPorChave.has(chave)) {
        const ex = comprasPorChave.get(chave);
        ex.quantidade = (ex.quantidade || 1) + (compra.quantidade || 1);
      } else {
        comprasPorChave.set(chave, compra);
        estado.compras.push(compra);
      }
    }
  }

  // Companions
  for (const l of blocos.get('Companions') || []) {
    if (!l.startsWith('- ')) continue;
    const partes = partirCampos(l.slice(2));
    const c = { nome: partes[0].replace(/^-\s*/, '').trim() };
    for (const p of partes.slice(1)) {
      const mc = /^(\S+)\s*(.*)$/.exec(p);
      if (!mc) continue;
      const v = mc[2];
      switch (mc[1]) {
        case 'obra': c.obra = v === '-' ? '' : v; break;
        case 'tier': c.tier = v.toUpperCase() === 'X' || v.toUpperCase() === 'Y' || v.toUpperCase() === 'Z' ? v.toUpperCase() : numero(v); break;
        case 'entrada': c.entrada = v; break;
        case 'papel': c.papel = v; break;
        case 'de': c.de = v; break;
        case 'estado': c.estado = v; break;
        case 'gratis-de': c.gratisDe = v; break;
        default: break;
      }
    }
    estado.companions.push(c);
  }
  if (estado.desconhecidas.length === 0) delete estado.desconhecidas;
  return { estado, avisos };
}

function sumDescontosManuais() {
  return 0;
}

// Importa, recalcula e compara com o texto de entrada. `diferencas` lista as linhas que mudaram.
export function importarEConferir(texto, dados) {
  const { estado, avisos } = importarTexto(texto, dados);
  const recalculado = exportarTexto(estado, dados);
  const diferencas = [];
  const norm = (t) =>
    String(t)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter((l) => !l.startsWith('Builder:') && l.trim() !== '');
  const a = secaoSemAvisos(norm(texto));
  const b = secaoSemAvisos(norm(recalculado));
  const max = Math.max(a.length, b.length);
  for (let k = 0; k < max; k++) {
    if (a[k] !== b[k]) diferencas.push({ texto: a[k] || '', recalculado: b[k] || '' });
  }
  for (const d of diferencas) {
    avisos.push({
      etiqueta: 'AVISO',
      texto: 'Linha diferente do recalculado: "' + d.texto + '" passou a "' + d.recalculado + '". O Builder usa o recalculado.',
    });
  }
  return { estado, avisos, diferencas, texto: recalculado };
}

function secaoSemAvisos(linhas) {
  const k = linhas.indexOf('## Avisos');
  return k < 0 ? linhas : linhas.slice(0, k);
}
