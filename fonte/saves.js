// Salvamentos por versão e backup completo. Funções puras: a interface cuida do navegador (localStorage, arquivos).
// Um salvamento guarda o texto exportado da build (formato wcb/1): é o mesmo texto que o app importa e que a LLM lê.
// O backup é um JSON com todos os salvamentos, o rascunho atual e o idioma.

export const FORMATO_BACKUP = 'wcb-backup/1';
export const MAX_SALVAMENTOS = 60;
const CABECALHO = 'WAIFU CATALOG BUILD';

export class ErroDeBackup extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDeBackup';
  }
}

const ehObjeto = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const ehTextoDeBuild = (t) => typeof t === 'string' && t.replace(/^﻿/, '').startsWith(CABECALHO);
const iso = (agora) => (agora instanceof Date ? agora : new Date(agora)).toISOString();

function validarSalvamento(s) {
  return (
    ehObjeto(s) &&
    typeof s.id === 'string' && s.id &&
    typeof s.nome === 'string' &&
    typeof s.criadoEm === 'string' && !Number.isNaN(Date.parse(s.criadoEm)) &&
    ehTextoDeBuild(s.texto)
  );
}

function limparSalvamento(s) {
  const out = { id: s.id, nome: s.nome.trim().slice(0, 80), criadoEm: s.criadoEm, texto: s.texto.replace(/^﻿/, '') };
  if (ehObjeto(s.resumo)) {
    const r = {};
    if (typeof s.resumo.contractor === 'string') r.contractor = s.resumo.contractor.slice(0, 80);
    if (Number.isFinite(s.resumo.intensity)) r.intensity = s.resumo.intensity;
    if (Number.isFinite(s.resumo.saldo)) r.saldo = s.resumo.saldo;
    if (Object.keys(r).length) out.resumo = r;
  }
  return out;
}

const porDataDecrescente = (a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm) || (a.id < b.id ? 1 : -1);

// Identificador novo que não repete nenhum dos que já existem.
export function novoId(existentes, agora = new Date()) {
  const usados = new Set(existentes.map((s) => s.id));
  const base = 's' + (agora instanceof Date ? agora : new Date(agora)).getTime().toString(36);
  if (!usados.has(base)) return base;
  for (let i = 2; ; i++) if (!usados.has(base + '-' + i)) return base + '-' + i;
}

// Nome sugerido quando o usuário não escreve um: "<contractor> <data>" ou "Versão <data>".
export function nomeSugerido(resumo, agora = new Date()) {
  const dia = iso(agora).slice(0, 10);
  const quem = resumo && resumo.contractor ? resumo.contractor.trim() : '';
  return (quem ? quem : 'Versão') + ' ' + dia;
}

// Devolve uma lista nova com o salvamento no começo. Recusa texto que não é de build e lista cheia.
export function criarSalvamento(lista, { nome, texto, resumo }, agora = new Date()) {
  if (!ehTextoDeBuild(texto)) throw new ErroDeBackup('O texto da build não começa com "' + CABECALHO + '".');
  if (lista.length >= MAX_SALVAMENTOS) throw new ErroDeBackup('Limite de ' + MAX_SALVAMENTOS + ' salvamentos: apague algum antes de salvar outro.');
  const s = limparSalvamento({
    id: novoId(lista, agora),
    nome: (nome && nome.trim()) || nomeSugerido(resumo, agora),
    criadoEm: iso(agora),
    texto,
    resumo,
  });
  return [s, ...lista].sort(porDataDecrescente);
}

export function apagarSalvamento(lista, id) {
  return lista.filter((s) => s.id !== id);
}

export function acharSalvamento(lista, id) {
  return lista.find((s) => s.id === id) || null;
}

// Lê a lista guardada no navegador. Entrada inválida ou estragada vira lista vazia; entrada ruim solta é descartada.
export function lerListaGuardada(json) {
  if (typeof json !== 'string' || !json) return [];
  try {
    const bruto = JSON.parse(json);
    if (!Array.isArray(bruto)) return [];
    const vistos = new Set();
    const lista = [];
    for (const s of bruto) {
      if (!validarSalvamento(s) || vistos.has(s.id)) continue;
      vistos.add(s.id);
      lista.push(limparSalvamento(s));
    }
    return lista.sort(porDataDecrescente).slice(0, MAX_SALVAMENTOS);
  } catch (e) {
    return [];
  }
}

export function guardarLista(lista) {
  return JSON.stringify(lista);
}

// Backup completo: todos os salvamentos, o rascunho atual (texto da build, ou null) e o idioma da interface.
export function montarBackup({ salvamentos, rascunho = null, idioma = 'pt' }, versaoBuilder, agora = new Date()) {
  return (
    JSON.stringify(
      {
        formato: FORMATO_BACKUP,
        builder: versaoBuilder,
        criadoEm: iso(agora),
        idioma,
        rascunho: ehTextoDeBuild(rascunho) ? rascunho : null,
        salvamentos: salvamentos.filter(validarSalvamento).map(limparSalvamento),
      },
      null,
      2,
    ) + '\n'
  );
}

export function lerBackup(texto) {
  let j;
  try {
    j = JSON.parse(String(texto).replace(/^﻿/, ''));
  } catch (e) {
    throw new ErroDeBackup('Este arquivo não é um backup do Builder (o JSON não abre).');
  }
  if (!ehObjeto(j) || typeof j.formato !== 'string') throw new ErroDeBackup('Este arquivo não é um backup do Builder (falta o campo "formato").');
  if (j.formato !== FORMATO_BACKUP) throw new ErroDeBackup('Formato de backup desconhecido: "' + j.formato + '" (este Builder lê "' + FORMATO_BACKUP + '").');
  if (!Array.isArray(j.salvamentos)) throw new ErroDeBackup('O backup não tem a lista "salvamentos".');
  const vistos = new Set();
  const salvamentos = [];
  const descartados = [];
  for (const s of j.salvamentos) {
    if (!validarSalvamento(s) || vistos.has(s.id)) {
      descartados.push(ehObjeto(s) && typeof s.nome === 'string' ? s.nome : '(sem nome)');
      continue;
    }
    vistos.add(s.id);
    salvamentos.push(limparSalvamento(s));
  }
  return {
    salvamentos: salvamentos.sort(porDataDecrescente),
    descartados,
    rascunho: ehTextoDeBuild(j.rascunho) ? j.rascunho.replace(/^﻿/, '') : null,
    idioma: j.idioma === 'en' ? 'en' : 'pt',
  };
}

// Junta os salvamentos do backup aos atuais. Salvamento que já existe igual (mesmo id e mesmo texto) não duplica;
// mesmo id com texto diferente ganha id novo. Passando do limite, ficam os mais recentes.
export function mesclarSalvamentos(atuais, vindos) {
  const resultado = [...atuais];
  let novos = 0;
  for (const s of vindos) {
    const igual = resultado.find((x) => x.id === s.id);
    if (igual && igual.texto === s.texto) continue;
    const id = igual ? novoId(resultado, new Date(Date.parse(s.criadoEm))) : s.id;
    resultado.push({ ...s, id });
    novos += 1;
  }
  return { lista: resultado.sort(porDataDecrescente).slice(0, MAX_SALVAMENTOS), novos };
}

const tirarAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const fatia = (s, vazio) => tirarAcento(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || vazio;

export function nomeDeArquivoDoSalvamento(s) {
  return 'waifu-catalog-' + fatia(s.nome, 'build') + '.txt';
}

export function nomeDeArquivoDoBackup(agora = new Date()) {
  return 'waifu-catalog-backup-' + iso(agora).slice(0, 10) + '.json';
}
