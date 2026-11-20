// Monta o app inteiro num arquivo HTML só (offline, sem dependências).
// Uso: node ferramentas/montar.mjs [--saida dist/index.html]
// A página reúne fonte/estilo.css, os módulos de fonte/ (sem import/export, nesta ordem) e dados/*.json.
// Os dados que vão para a página são só nomes de opção, números e resumos próprios em português.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Ordem dos módulos: cada um só usa o que vem antes.
export const MODULOS = ['motor.js', 'texto.js', 'idiomas.js', 'interface.js'];

// Campos dos dados que não vão para a página (só o conferidor de dados usa).
const CAMPOS_FORA_DA_PAGINA = ['referencia'];

export function limparModulo(src) {
  return src
    .replace(/^import\s[\s\S]*?\sfrom\s+['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^export\s*\{[^}]*\};?[ \t]*$/gm, '')
    .replace(/^export\s+default\s+/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm, '');
}

export function nomesExportados(src) {
  const nomes = [];
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) nomes.push(m[1]);
  return nomes;
}

export function carregarDados(pasta = join(raiz, 'dados')) {
  const economia = JSON.parse(readFileSync(join(pasta, 'economia.json'), 'utf8'));
  const categorias = {};
  for (const arq of readdirSync(pasta).sort()) {
    if (!arq.endsWith('.json') || arq === 'economia.json' || arq.startsWith('_')) continue;
    const j = JSON.parse(readFileSync(join(pasta, arq), 'utf8'));
    const opcoes = j.opcoes.map((o) => {
      const c = { ...o };
      for (const f of CAMPOS_FORA_DA_PAGINA) delete c[f];
      return c;
    });
    categorias[j.categoria] = { titulo: j.titulo, opcoes };
  }
  return { versaoDocumento: economia.versaoDocumento, economia, categorias };
}

function jsonParaScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// Nomes declarados no nível de módulo. Na página todos os módulos dividem o mesmo escopo,
// então um nome repetido entre dois arquivos quebraria a página: a montagem recusa.
export function declaracoesDeTopo(src) {
  const nomes = [];
  for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) nomes.push(m[1]);
  return nomes;
}

export function montarScript() {
  const partes = [];
  const exportados = [];
  const donos = new Map();
  for (const m of MODULOS) {
    let src;
    try {
      src = readFileSync(join(raiz, 'fonte', m), 'utf8');
    } catch (e) {
      continue; // módulo ainda não existe nesta etapa
    }
    for (const nome of declaracoesDeTopo(src)) {
      if (donos.has(nome)) throw new Error('Nome repetido entre módulos: ' + nome + ' (' + donos.get(nome) + ' e ' + m + ')');
      donos.set(nome, m);
    }
    exportados.push(...nomesExportados(src));
    partes.push('// ---- ' + m + '\n' + limparModulo(src));
  }
  const unicos = [...new Set(exportados)];
  return (
    "'use strict';\nconst WCB = (function () {\n" +
    partes.join('\n') +
    '\nreturn { ' + unicos.join(', ') + ' };\n})();\n' +
    "if (typeof document !== 'undefined') WCB.iniciar(document);\n"
  );
}

export function montarPagina(dados = carregarDados()) {
  const modelo = readFileSync(join(raiz, 'fonte', 'pagina.html'), 'utf8');
  const css = readFileSync(join(raiz, 'fonte', 'estilo.css'), 'utf8');
  const versao = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).version || '0.1.0';
  return modelo
    .replace('/*ESTILO*/', () => css)
    .replace('/*DADOS*/', () => jsonParaScript(dados))
    .replace('/*SCRIPT*/', () => montarScript().replace(/<\/script/gi, '<\\/script'))
    .replace('{{VERSAO}}', versao);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--saida');
  const saida = resolve(raiz, i > 0 ? process.argv[i + 1] : 'dist/index.html');
  const html = montarPagina();
  mkdirSync(dirname(saida), { recursive: true });
  writeFileSync(saida, html);
  console.log('Página montada: ' + saida + ' (' + Math.round(html.length / 1024) + ' KB)');
}
