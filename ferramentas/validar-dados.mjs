// Conferidor dos dados do Builder (dados/*.json). Node, sem dependências.
// Uso: node ferramentas/validar-dados.mjs [--dados dados] [--docs docs] [--referencia <pasta da referência>]
// Sai com código 1 se achar algum erro. Contrato: docs/esquema-de-dados.md.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { BLOCOS, REGRAS_ESPECIAIS, normalizarNome } from '../fonte/motor.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CAMPOS_OPCAO = new Set([
  'id', 'nome', 'categoria', 'grupo', 'custo', 'repeticao', 'requisitos', 'gratis', 'exclusoes', 'grupoExclusivo',
  'descontos', 'escolha', 'efeitos', 'resumo', 'verificado', 'regraEspecial', 'soNaCriacao', 'tipo', 'referencia',
]);
const OBRIGATORIOS = ['id', 'nome', 'categoria', 'custo', 'resumo', 'verificado'];
const TIPOS_CUSTO = new Set(['fixo', 'gratis', 'sequencia', 'porCompra', 'percentualDoTier', 'diferencaDeTier', 'precoDoTier', 'porEscolha', 'formula']);
const TIPOS_DESCONTO = new Set(['condicao', 'porQuantidade', 'porArquetipo', 'porMembro']);
const TIPOS_EFEITO = new Set(['intensity', 'budget', 'limiteEmprestimo', 'regra']);
const ORIGENS = new Set(['drop-in', 'walk-in', 'extra', 'substitute', 'possess']);
const BLOCOS_ECONOMIA = ['budgetInicial', 'precoPorTier', 'captura', 'venda', 'tiersImaginarios', 'emprestimo', 'reembolso', 'tetoDescontos'];
const PALAVRAS_EM_INGLES = /\b(the|which|that|your|with|will|can|are|their|when)\b/gi;

const inteiro = (n) => Number.isInteger(n);
const objeto = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

function lerJson(caminho, erros) {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch (e) {
    erros.push(caminho + ': não consegui ler o JSON (' + e.message + ')');
    return null;
  }
}

function lerTexto(caminho) {
  try {
    return readFileSync(caminho, 'utf8');
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Economia

function conferirEconomia(eco, erros, pendenciasTxt) {
  if (!objeto(eco)) return erros.push('economia.json: não é um objeto');
  if (typeof eco.versaoDocumento !== 'string' || !eco.versaoDocumento) erros.push('economia.json: falta versaoDocumento');
  if (!objeto(eco.intensity)) erros.push('economia.json: falta o bloco intensity');
  for (const b of BLOCOS_ECONOMIA) {
    const bloco = eco[b];
    if (!objeto(bloco)) {
      erros.push('economia.json: falta o bloco ' + b);
      continue;
    }
    if (typeof bloco.verificado !== 'boolean') erros.push('economia.json/' + b + ': verificado precisa ser true ou false');
    if (bloco.verificado === false) {
      if (typeof bloco.aviso !== 'string' || !bloco.aviso) erros.push('economia.json/' + b + ': verificado false exige "aviso"');
      if (pendenciasTxt !== null && !pendenciasTxt.includes('`economia/' + b + '`')) erros.push('economia.json/' + b + ': verificado false sem linha em docs/pendencias-de-dados.md (escreva `economia/' + b + '`)');
    }
  }
  const pt = eco.precoPorTier && eco.precoPorTier.tier;
  if (objeto(pt)) for (let i = 1; i <= 10; i++) if (!inteiro(pt[String(i)])) erros.push('economia.json/precoPorTier: falta o preço do tier ' + i);
  const bi = eco.budgetInicial && eco.budgetInicial.porIntensity;
  if (objeto(bi)) {
    for (let n = 0; n <= 10; n++) {
      const linha = bi[String(n)];
      if (!Array.isArray(linha) || linha.length !== 10 || !linha.every(inteiro)) erros.push('economia.json/budgetInicial: Intensity ' + n + ' precisa de 10 valores inteiros (DR 1 a 10)');
    }
  }
}

// ---------------------------------------------------------------------------
// Opções

function conferirCusto(op, ctx) {
  const { erro } = ctx;
  const c = op.custo;
  if (!objeto(c)) return erro(op, 'custo precisa ser um objeto');
  if (!TIPOS_CUSTO.has(c.tipo)) return erro(op, 'custo.tipo desconhecido: ' + c.tipo);
  if (c.moeda !== undefined && c.moeda !== 'IMG') erro(op, 'custo.moeda só pode ser "IMG"');
  switch (c.tipo) {
    case 'fixo':
      if (!inteiro(c.valor)) erro(op, 'custo fixo precisa de "valor" inteiro');
      break;
    case 'sequencia':
    case 'porCompra':
      if (!Array.isArray(c.valores) || !c.valores.length || !c.valores.every(inteiro)) erro(op, 'custo ' + c.tipo + ' precisa de "valores" com inteiros');
      if (c.depois !== undefined && (!objeto(c.depois) || !inteiro(c.depois.incremento))) erro(op, 'custo.depois precisa de "incremento" inteiro');
      if (c.tipo === 'porCompra' && c.depois !== undefined) erro(op, 'custo porCompra não tem "depois"; use sequencia');
      break;
    case 'percentualDoTier':
      if (!inteiro(c.percentual)) erro(op, 'custo percentualDoTier precisa de "percentual" inteiro');
      break;
    case 'porEscolha':
      if (!objeto(op.escolha) || op.escolha.tipo !== 'lista' || !Array.isArray(op.escolha.opcoes) || !op.escolha.opcoes.length) {
        erro(op, 'custo porEscolha exige escolha do tipo lista');
      } else if (!op.escolha.opcoes.every((o) => inteiro(o.custo))) {
        erro(op, 'custo porEscolha: toda alternativa de escolha precisa de "custo" inteiro');
      }
      break;
    case 'formula':
      if (typeof c.descricao !== 'string' || !c.descricao) erro(op, 'custo formula precisa de "descricao"');
      if (!op.regraEspecial) erro(op, 'custo formula exige regraEspecial');
      break;
    case 'diferencaDeTier':
      if (!op.regraEspecial) erro(op, 'custo diferencaDeTier exige regraEspecial');
      break;
    default:
      break;
  }
}

function conferirRequisito(op, r, ctx, ondeEstou) {
  const { erro, ids, grupos } = ctx;
  if (!objeto(r)) return erro(op, ondeEstou + ': requisito precisa ser um objeto');
  const chaves = Object.keys(r).filter((k) => k !== 'exceto' && k !== 'minimo');
  if (r.grupo === undefined && (r.exceto !== undefined || r.minimo !== undefined)) erro(op, ondeEstou + ': "minimo" e "exceto" só valem com "grupo"');
  if (chaves.length !== 1) return erro(op, ondeEstou + ': um requisito tem uma forma só (achei ' + (chaves.join(', ') || 'nenhuma') + ')');
  const k = chaves[0];
  switch (k) {
    case 'id':
      if (!ids.has(r.id)) erro(op, ondeEstou + ': requisito aponta para id inexistente ' + r.id);
      break;
    case 'todos':
    case 'qualquerDe':
      if (!Array.isArray(r[k]) || !r[k].length) erro(op, ondeEstou + ': ' + k + ' precisa de lista');
      else r[k].forEach((s, i) => conferirRequisito(op, s, ctx, ondeEstou + '.' + k + '[' + i + ']'));
      break;
    case 'grupo':
      if (!grupos.has(r.grupo)) erro(op, ondeEstou + ': grupo inexistente ' + r.grupo);
      if (r.minimo !== undefined && !(inteiro(r.minimo) && r.minimo >= 1)) erro(op, ondeEstou + ': minimo precisa ser inteiro a partir de 1');
      if (r.exceto !== undefined && r.exceto !== 'self') erro(op, ondeEstou + ': exceto só pode ser "self"');
      break;
    case 'compras':
      if (!objeto(r.compras) || !ids.has(r.compras.id) || !inteiro(r.compras.minimo) || r.compras.minimo < 1) erro(op, ondeEstou + ': compras precisa de id existente e minimo inteiro');
      break;
    case 'origem':
      if (!ORIGENS.has(r.origem)) erro(op, ondeEstou + ': origem desconhecida ' + r.origem);
      break;
    case 'intensity':
      if (!objeto(r.intensity) || (r.intensity.min === undefined && r.intensity.max === undefined) || ![r.intensity.min, r.intensity.max].every((n) => n === undefined || inteiro(n))) erro(op, ondeEstou + ': intensity precisa de min e/ou max inteiros');
      break;
    case 'nao':
      conferirRequisito(op, r.nao, ctx, ondeEstou + '.nao');
      break;
    case 'declarado':
      if (typeof r.declarado !== 'string' || !r.declarado.trim()) erro(op, ondeEstou + ': declarado precisa de texto');
      break;
    default:
      erro(op, ondeEstou + ': forma de requisito desconhecida: ' + k);
  }
}

function conferirOpcao(op, arquivoCategoria, ctx) {
  const { erro, ids, regrasDocumentadas, pendenciasTxt, categoriasConhecidas, gruposExclusivos } = ctx;
  if (!objeto(op)) return ctx.erros.push(arquivoCategoria + ': opção que não é objeto');
  for (const c of Object.keys(op)) if (!CAMPOS_OPCAO.has(c)) erro(op, 'campo desconhecido: ' + c);
  for (const c of OBRIGATORIOS) if (op[c] === undefined) erro(op, 'falta o campo ' + c);
  if (typeof op.id !== 'string' || !/^[a-z0-9-]+\/[a-z0-9]+(-[a-z0-9]+)*$/.test(op.id)) erro(op, 'id fora do formato categoria/slug');
  else if (op.id.split('/')[0] !== arquivoCategoria) erro(op, 'o prefixo do id não é a categoria do arquivo (' + arquivoCategoria + ')');
  if (typeof op.nome !== 'string' || !op.nome.trim() || op.nome !== op.nome.trim()) erro(op, 'nome vazio ou com espaço nas pontas');
  if (op.categoria !== arquivoCategoria) erro(op, 'categoria diferente do arquivo');
  if (op.grupo !== undefined && (typeof op.grupo !== 'string' || !op.grupo)) erro(op, 'grupo precisa de texto');
  if (op.grupoExclusivo !== undefined && (typeof op.grupoExclusivo !== 'string' || !op.grupoExclusivo)) erro(op, 'grupoExclusivo precisa de texto');
  if (typeof op.verificado !== 'boolean') erro(op, 'verificado precisa ser true ou false');
  else if (op.verificado === false && pendenciasTxt !== null && !pendenciasTxt.includes('`' + op.id + '`')) {
    erro(op, 'verificado false sem linha em docs/pendencias-de-dados.md (escreva `' + op.id + '`)');
  }
  if (typeof op.resumo !== 'string' || !op.resumo.trim()) erro(op, 'resumo vazio');
  else {
    if (op.resumo.length > 420) erro(op, 'resumo grande demais (' + op.resumo.length + ' caracteres; o limite é 420): resuma');
    const ingles = new Set((op.resumo.match(PALAVRAS_EM_INGLES) || []).map((p) => p.toLowerCase()));
    if (ingles.size >= 3) erro(op, 'o resumo parece estar em inglês (' + [...ingles].join(', ') + '): escreva em português, com palavras próprias');
  }
  if (op.soNaCriacao !== undefined && typeof op.soNaCriacao !== 'boolean') erro(op, 'soNaCriacao precisa ser booleano');
  if (op.tipo !== undefined && (!Array.isArray(op.tipo) || !op.tipo.every((t) => typeof t === 'string' && t))) erro(op, 'tipo precisa ser lista de textos');
  if (op.referencia !== undefined && typeof op.referencia !== 'string') erro(op, 'referencia precisa de texto');

  conferirCusto(op, ctx);

  if (op.repeticao !== undefined) {
    const r = op.repeticao;
    if (!objeto(r)) erro(op, 'repeticao precisa ser objeto');
    else {
      for (const k of Object.keys(r)) if (!['min', 'max', 'porMundo'].includes(k)) erro(op, 'repeticao.' + k + ' desconhecido');
      if (r.max !== undefined && r.max !== null && !(inteiro(r.max) && r.max >= 1)) erro(op, 'repeticao.max precisa ser inteiro a partir de 1 ou null');
      if (r.min !== undefined && !(inteiro(r.min) && r.min >= 0)) erro(op, 'repeticao.min precisa ser inteiro');
      if (r.porMundo !== undefined && typeof r.porMundo !== 'boolean') erro(op, 'repeticao.porMundo precisa ser booleano');
    }
  }

  if (op.requisitos !== undefined) conferirRequisito(op, op.requisitos, ctx, 'requisitos');

  if (op.gratis !== undefined) {
    if (!Array.isArray(op.gratis) || !op.gratis.length) erro(op, 'gratis precisa de lista');
    else {
      for (const g of op.gratis) {
        if (!objeto(g) || !ids.has(g.id)) erro(op, 'gratis aponta para id inexistente ' + (objeto(g) ? g.id : g));
        else if (g.quantidade !== undefined && !(inteiro(g.quantidade) && g.quantidade >= 1)) erro(op, 'gratis.quantidade precisa ser inteiro a partir de 1');
        if (objeto(g)) for (const k of Object.keys(g)) if (!['id', 'quantidade'].includes(k)) erro(op, 'gratis.' + k + ' desconhecido');
      }
    }
  }

  if (op.exclusoes !== undefined) {
    if (!Array.isArray(op.exclusoes) || !op.exclusoes.length) erro(op, 'exclusoes precisa de lista');
    else for (const x of op.exclusoes) if (!ids.has(x)) erro(op, 'exclusoes aponta para id inexistente ' + x);
  }

  if (op.descontos !== undefined) {
    if (!Array.isArray(op.descontos) || !op.descontos.length) erro(op, 'descontos precisa de lista');
    else {
      const vistos = new Set();
      for (const d of op.descontos) {
        if (!objeto(d) || !TIPOS_DESCONTO.has(d.tipo)) {
          erro(op, 'desconto com tipo desconhecido');
          continue;
        }
        if (typeof d.id !== 'string' || !d.id) erro(op, 'todo desconto precisa de "id"');
        else if (vistos.has(d.id)) erro(op, 'id de desconto repetido: ' + d.id);
        else vistos.add(d.id);
        if (d.tipo === 'condicao') {
          if (!(inteiro(d.percentual) && d.percentual > 0 && d.percentual <= 100)) erro(op, 'desconto ' + d.id + ': percentual inteiro entre 1 e 100');
          if (typeof d.condicao !== 'string' || !d.condicao.trim()) erro(op, 'desconto ' + d.id + ': falta o texto da condição');
        }
        if (d.tipo === 'porArquetipo' && op.regraEspecial !== 'desconto-por-arquetipo') erro(op, 'desconto porArquetipo exige regraEspecial desconto-por-arquetipo');
        if (d.tipo === 'porMembro' && op.regraEspecial !== 'defense-rebates') erro(op, 'desconto porMembro exige regraEspecial defense-rebates');
      }
    }
  }

  if (op.escolha !== undefined) {
    const e = op.escolha;
    if (!objeto(e)) erro(op, 'escolha precisa ser objeto');
    else {
      if (!['lista', 'texto', 'opcao'].includes(e.tipo)) erro(op, 'escolha.tipo precisa ser lista, texto ou opcao');
      if (e.rotulo !== undefined && typeof e.rotulo !== 'string') erro(op, 'escolha.rotulo precisa de texto');
      if (e.multipla !== undefined && typeof e.multipla !== 'boolean') erro(op, 'escolha.multipla precisa ser booleano');
      if (e.tipo === 'lista') {
        if (!Array.isArray(e.opcoes) || !e.opcoes.length) erro(op, 'escolha lista precisa de "opcoes"');
        else {
          const valores = new Set();
          for (const a of e.opcoes) {
            if (!objeto(a) || typeof a.valor !== 'string' || !a.valor) {
              erro(op, 'alternativa de escolha sem "valor"');
              continue;
            }
            if (valores.has(a.valor)) erro(op, 'alternativa de escolha repetida: ' + a.valor);
            valores.add(a.valor);
            if (a.custo !== undefined && !inteiro(a.custo)) erro(op, 'escolha ' + a.valor + ': custo inteiro');
            if (a.gratis !== undefined) {
              if (!Array.isArray(a.gratis) || !a.gratis.every((g) => objeto(g) && ids.has(g.id))) erro(op, 'escolha ' + a.valor + ': gratis aponta para id inexistente');
            }
            if (a.requisitos !== undefined) conferirRequisito(op, a.requisitos, ctx, 'escolha.' + a.valor + '.requisitos');
          }
        }
      }
    }
  }

  if (op.efeitos !== undefined) {
    if (!Array.isArray(op.efeitos) || !op.efeitos.length) erro(op, 'efeitos precisa de lista');
    else {
      for (const f of op.efeitos) {
        if (!objeto(f) || !TIPOS_EFEITO.has(f.tipo)) {
          erro(op, 'efeito com tipo desconhecido');
          continue;
        }
        if (f.tipo === 'regra') {
          if (typeof f.id !== 'string' || !f.id) erro(op, 'efeito regra precisa de "id"');
          if (f.id === 'bloqueia-categoria' && !categoriasConhecidas.has(f.categoria)) erro(op, 'bloqueia-categoria: categoria inexistente ' + f.categoria);
          if (f.id === 'libera-grupo-exclusivo' && !(gruposExclusivos && gruposExclusivos.has(f.grupo))) erro(op, 'libera-grupo-exclusivo: nenhuma opção usa o grupoExclusivo ' + f.grupo);
          if (f.id === 'dispensa-requisito') {
            if (!ids.has(f.requisito)) erro(op, 'dispensa-requisito: requisito aponta para id inexistente ' + f.requisito);
            if (!Array.isArray(f.em) || !f.em.length || !f.em.every((x) => ids.has(x))) erro(op, 'dispensa-requisito: "em" precisa de lista de ids existentes');
          }
          if (f.id === 'bloqueia-categoria' && f.exceto !== undefined) {
            if (!Array.isArray(f.exceto) || !f.exceto.length) erro(op, 'bloqueia-categoria: "exceto" precisa de lista de ids');
            else for (const x of f.exceto) if (!ids.has(x) || !x.startsWith(f.categoria + '/')) erro(op, 'bloqueia-categoria: exceto aponta para id que não é da categoria bloqueada: ' + x);
          }
        } else if (!inteiro(f.valor)) {
          erro(op, 'efeito ' + f.tipo + ' precisa de "valor" inteiro');
        }
      }
    }
  }

  if (op.regraEspecial !== undefined) {
    if (typeof op.regraEspecial !== 'string' || !op.regraEspecial) erro(op, 'regraEspecial precisa de texto');
    else {
      if (!(op.regraEspecial in REGRAS_ESPECIAIS)) erro(op, 'regraEspecial ' + op.regraEspecial + ' não existe em REGRAS_ESPECIAIS (fonte/motor.js)');
      if (regrasDocumentadas !== null && !regrasDocumentadas.has(op.regraEspecial)) erro(op, 'regraEspecial ' + op.regraEspecial + ' não está em docs/regras-especiais.md');
    }
  }
}

// ---------------------------------------------------------------------------
// Exclusões simétricas, exemplo da documentação, referência

function conferirExclusoes(todas, erros) {
  const porId = new Map(todas.map((o) => [o.id, o]));
  for (const o of todas) {
    for (const x of o.exclusoes || []) {
      const outro = porId.get(x);
      if (!outro) continue;
      if (x === o.id) erros.push(o.id + ': exclui a si mesma');
      if ((outro.requisitos && JSON.stringify(outro.requisitos) === JSON.stringify({ id: o.id })) && !(outro.exclusoes || []).includes(o.id)) {
        erros.push(o.id + ' e ' + x + ': uma exclui a outra, mas a outra exige a primeira');
      }
    }
  }
}

function conferirExemploDoEsquema(docsDir, todas, erros) {
  const md = lerTexto(join(docsDir, 'esquema-de-dados.md'));
  if (md === null) return;
  const i = md.indexOf('## Exemplo\n');
  if (i < 0) return;
  const m = md.slice(i).match(/```json\n([\s\S]*?)\n```/);
  if (!m) return;
  let ex;
  try {
    ex = JSON.parse(m[1]);
  } catch (e) {
    return erros.push('docs/esquema-de-dados.md: o JSON do exemplo não é válido (' + e.message + ')');
  }
  const porId = new Map(todas.map((o) => [o.id, o]));
  for (const op of ex.opcoes || []) {
    const real = porId.get(op.id);
    if (!real) erros.push('docs/esquema-de-dados.md: a opção do exemplo ' + op.id + ' não existe em dados/');
    else if (JSON.stringify(sortear(real)) !== JSON.stringify(sortear(op))) erros.push('docs/esquema-de-dados.md: o exemplo de ' + op.id + ' diverge de dados/ (copie a opção de dados/ para o exemplo)');
  }
}

function sortear(v) {
  if (Array.isArray(v)) return v.map(sortear);
  if (objeto(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortear(v[k])]));
  return v;
}

function titulosDaReferencia(pastaReferencia, arquivo) {
  const txt = lerTexto(join(pastaReferencia, arquivo));
  if (txt === null) return null;
  const linhas = txt.split('\n');
  const titulos = [];
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(/^#{2,3}\s+(.+?)\s*$/);
    if (!m) continue;
    let primeira = '';
    for (let j = i + 1; j < linhas.length; j++) {
      if (linhas[j].trim()) {
        primeira = linhas[j].trim();
        break;
      }
    }
    titulos.push({ titulo: m[1], ehOpcao: /^-\s+\*\*(Custo|Intensity):\*\*/.test(primeira) });
  }
  return titulos;
}

function conferirReferencia(pastaReferencia, todas, erros, avisos, pendenciasTxt) {
  const cache = new Map();
  const doArquivo = (a) => {
    if (!cache.has(a)) cache.set(a, titulosDaReferencia(pastaReferencia, a));
    return cache.get(a);
  };
  const cobertos = new Map(); // arquivo -> Set(título normalizado)
  for (const o of todas) {
    if (!o.referencia) {
      erros.push(o.id + ': falta o campo "referencia" (necessário para conferir com a pasta de referência)');
      continue;
    }
    const arquivo = o.referencia.split('#')[0];
    const titulos = doArquivo(arquivo);
    if (titulos === null) {
      erros.push(o.id + ': o arquivo de referência ' + arquivo + ' não existe em ' + pastaReferencia);
      continue;
    }
    const alvo = normalizarNome(o.nome);
    const achou = titulos.find((t) => normalizarNome(t.titulo) === alvo || normalizarNome(t.titulo).startsWith(alvo + ' ('));
    if (!achou) erros.push(o.id + ': o nome "' + o.nome + '" não bate com nenhum título ## ou ### de ' + arquivo);
    else {
      if (!cobertos.has(arquivo)) cobertos.set(arquivo, new Set());
      cobertos.get(arquivo).add(normalizarNome(achou.titulo));
    }
  }
  // Todo título de opção da referência precisa ter uma opção nos dados, ou estar justificado nas pendências.
  for (const arquivo of cobertos.keys()) {
    for (const t of doArquivo(arquivo)) {
      if (!t.ehOpcao) continue;
      if (cobertos.get(arquivo).has(normalizarNome(t.titulo))) continue;
      const chave = '`sem-opcao: ' + arquivo + '#' + t.titulo + '`';
      if (pendenciasTxt !== null && pendenciasTxt.includes(chave)) continue;
      erros.push(arquivo + ': o título "' + t.titulo + '" descreve uma opção e não tem opção em dados/ (justifique em docs/pendencias-de-dados.md com ' + chave + ')');
    }
  }
  avisos.push('conferi nomes e cobertura contra ' + pastaReferencia);
}

// ---------------------------------------------------------------------------
// Principal

export function validar({ dados = join(raiz, 'dados'), docs = join(raiz, 'docs'), referencia = null } = {}) {
  const erros = [];
  const avisos = [];
  const pendenciasTxt = lerTexto(join(docs, 'pendencias-de-dados.md'));
  const regrasTxt = lerTexto(join(docs, 'regras-especiais.md'));
  if (pendenciasTxt === null) avisos.push('docs/pendencias-de-dados.md não existe: não conferi as linhas de verificado false');
  const regrasDocumentadas = regrasTxt === null ? null : new Set([...regrasTxt.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]));
  if (regrasTxt === null) avisos.push('docs/regras-especiais.md não existe: não conferi os ids de regraEspecial');
  if (regrasDocumentadas) for (const id of Object.keys(REGRAS_ESPECIAIS)) if (!regrasDocumentadas.has(id)) erros.push('regra especial ' + id + ' existe no motor e falta em docs/regras-especiais.md');

  if (!existsSync(join(dados, 'economia.json'))) {
    erros.push('dados/economia.json não existe');
    return { erros, avisos, opcoes: [] };
  }
  const eco = lerJson(join(dados, 'economia.json'), erros);
  if (eco) conferirEconomia(eco, erros, pendenciasTxt);

  const arquivos = readdirSync(dados).filter((a) => a.endsWith('.json') && a !== 'economia.json' && !a.startsWith('_')).sort();
  const categoriasEsperadas = BLOCOS.map((b) => b.categoria);
  const arquivosCategoria = arquivos.map((a) => a.replace(/\.json$/, ''));
  for (const c of arquivosCategoria) if (!categoriasEsperadas.includes(c)) erros.push('dados/' + c + '.json: categoria que o Builder não conhece');
  if (arquivosCategoria.length) for (const c of categoriasEsperadas) if (!arquivosCategoria.includes(c)) erros.push('falta dados/' + c + '.json');

  // Primeira passada: ids e grupos de todo o conjunto (requisitos apontam para outras categorias).
  const cargas = [];
  const ids = new Set();
  const grupos = new Set();
  const gruposExclusivos = new Set();
  const donoDoGrupo = new Map();
  for (const a of arquivos) {
    const j = lerJson(join(dados, a), erros);
    if (!j) continue;
    const cat = a.replace(/\.json$/, '');
    if (j.categoria !== cat) erros.push('dados/' + a + ': "categoria" precisa ser ' + cat);
    if (typeof j.titulo !== 'string' || !j.titulo) erros.push('dados/' + a + ': falta "titulo"');
    const bloco = BLOCOS.find((b) => b.categoria === cat);
    if (bloco && j.titulo !== bloco.titulo) erros.push('dados/' + a + ': "titulo" precisa ser "' + bloco.titulo + '" (o nome do bloco no texto da build)');
    if (typeof j.versaoDocumento !== 'string' || !j.versaoDocumento) erros.push('dados/' + a + ': falta "versaoDocumento"');
    else if (eco && j.versaoDocumento !== eco.versaoDocumento) erros.push('dados/' + a + ': versaoDocumento diferente da de economia.json');
    if (!Array.isArray(j.opcoes) || !j.opcoes.length) {
      erros.push('dados/' + a + ': "opcoes" precisa de lista com ao menos uma opção');
      continue;
    }
    cargas.push({ cat, opcoes: j.opcoes });
    for (const op of j.opcoes) {
      if (objeto(op) && typeof op.id === 'string') {
        if (ids.has(op.id)) erros.push(op.id + ': id repetido');
        ids.add(op.id);
      }
      if (objeto(op) && typeof op.grupoExclusivo === 'string') gruposExclusivos.add(op.grupoExclusivo);
      if (objeto(op) && typeof op.grupo === 'string') {
        grupos.add(op.grupo);
        // O motor compara grupo com grupo em todo o conjunto: o mesmo nome em duas categorias misturaria opções.
        if (donoDoGrupo.has(op.grupo) && donoDoGrupo.get(op.grupo) !== cat) erros.push('grupo "' + op.grupo + '" usado em duas categorias (' + donoDoGrupo.get(op.grupo) + ' e ' + cat + '): dê a cada um um nome próprio');
        donoDoGrupo.set(op.grupo, cat);
      }
    }
  }

  const ctx = {
    ids, grupos, gruposExclusivos, regrasDocumentadas, pendenciasTxt, erros,
    categoriasConhecidas: new Set(categoriasEsperadas),
    erro: (op, msg) => erros.push((objeto(op) && op.id ? op.id : '?') + ': ' + msg),
  };
  const todas = [];
  for (const { cat, opcoes } of cargas) {
    for (const op of opcoes) {
      conferirOpcao(op, cat, ctx);
      if (objeto(op)) todas.push(op);
    }
  }
  conferirExclusoes(todas, erros);
  conferirExemploDoEsquema(docs, todas, erros);

  if (referencia) {
    if (!existsSync(referencia)) avisos.push('referência não disponível em ' + referencia + ': não conferi nomes nem cobertura');
    else conferirReferencia(referencia, todas, erros, avisos, pendenciasTxt);
  } else {
    avisos.push('referência não disponível: não conferi nomes nem cobertura (use --referencia <pasta>)');
  }
  return { erros, avisos, opcoes: todas };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (nome) => {
    const i = process.argv.indexOf(nome);
    return i > 0 ? resolve(process.argv[i + 1]) : null;
  };
  const r = validar({ dados: arg('--dados') || join(raiz, 'dados'), docs: arg('--docs') || join(raiz, 'docs'), referencia: arg('--referencia') });
  for (const a of r.avisos) console.log('aviso: ' + a);
  for (const e of r.erros) console.error('ERRO: ' + e);
  const porCategoria = {};
  for (const o of r.opcoes) porCategoria[o.categoria] = (porCategoria[o.categoria] || 0) + 1;
  console.log(r.opcoes.length + ' opções conferidas (' + Object.entries(porCategoria).map(([k, v]) => k + ' ' + v).join(', ') + ').');
  if (r.erros.length) {
    console.error(r.erros.length + ' erro(s).');
    process.exit(1);
  }
  console.log('Dados sem erro.');
}
