# Vigia do documento

O Main Sourcebook é um Google Doc em edição constante. O vigia **só avisa** quais seções mudaram; ele não altera dados, nem a referência, nem o app. Quem decide o que fazer com cada aviso é o dono do projeto.

## O que ele faz

Uma vez por semana (segunda-feira, 07:41 UTC) e quando você mandar rodar, o workflow [`vigia.yml`](../../.github/workflows/vigia.yml):

1. Baixa o texto do documento (`export?format=txt`) e o normaliza: sem BOM, com quebras de linha LF, sem espaços no fim das linhas.
2. Lê o sumário do próprio documento e divide o texto por títulos. Cada título do sumário (inclusive os de subseção) é uma seção.
3. Calcula um hash (SHA-256, 32 primeiros caracteres) do texto de cada seção. O número de página do sumário não entra no hash.
4. Compara com [`secoes.json`](secoes.json): seções **mudadas**, **novas** e **removidas**.
5. Se houve mudança, abre (ou atualiza) **uma** issue chamada **"Documento oficial mudou"**, com as seções afetadas e um resumo curto de cada uma (linhas acrescentadas e retiradas, e os números que saíram e entraram). A issue guarda as dez últimas checagens, a mais nova no topo.
6. Só depois de a issue estar aberta ou atualizada é que grava o estado novo em `docs/vigia/secoes.json` e atualiza o cache.

## O que fica onde

| Onde | O quê |
|---|---|
| `docs/vigia/secoes.json` | **Só** título → hash de cada seção, e a data da última checagem. É a única coisa do documento que vai para o repositório. |
| Cache do GitHub Actions (`actions/cache`) | O texto de cada seção da última checagem boa, para o resumo da próxima. Nunca vai para o repositório. |
| Issue "Documento oficial mudou" | Seções mudadas, novas e removidas, com o resumo curto. O resumo traz contagens e números; **nunca** trechos do documento. |
| Issue "Vigia do documento falhou" | Aparece quando o download não devolve o documento. Fecha sozinha na próxima checagem que der certo. |

## Quando o download falha

O vigia só aceita a resposta se ela parecer o documento: HTTP 200, não ser HTML, ter pelo menos 50 KB, trazer os títulos que o documento sempre teve (Prelude, Basic Rules, Origins, Bindings, Heritages) e pelo menos 10 seções. Se não aceitar:

- abre ou atualiza a issue **"Vigia do documento falhou"**, com o motivo;
- o job fica vermelho (falha visível na aba Actions);
- **não grava nada**: `secoes.json` e o cache continuam como estavam. Um estado vazio ou pela metade nunca substitui o bom (o comando `gravar` também recusa estado com menos de 10 seções ou com menos da metade das seções do estado anterior).

## Como usar

- **Ver o aviso:** o GitHub avisa por e-mail quando a issue abre ou muda. Leia a lista de seções e refaça a conferência das que mudaram (referência no coletania, depois dados do Builder).
- **Depois de tratar tudo:** feche a issue. A próxima mudança abre uma issue nova.
- **Rodar agora:** aba **Actions → Vigia do documento → Run workflow**.
- **Rodar no seu computador**, com um export que você baixou (Arquivo → Baixar → Texto simples):

  ```sh
  node ferramentas/vigiar-documento.mjs --arquivo caminho/do/export.txt
  ```

  O resultado fica em `.vigia-saida/` (`resultado.json`, `issue-mudou.md`, `issue-falhou.md`). Isso não grava `docs/vigia/secoes.json`; para gravar, `node ferramentas/vigiar-documento.mjs gravar`.
- **Rodar os testes** (textos inventados, sem rede): `node --test testes/vigia.test.mjs`.

## Estado inicial

O `secoes.json` do repositório foi gerado a partir do export de **20 de novembro de 2026**, o mesmo em que os dados do Builder foram conferidos. Assim, a primeira checagem diz o que mudou desde essa versão. Como o cache ainda está vazio na primeira vez, o resumo da primeira issue dirá só que a seção mudou, sem o detalhe de linhas e números. Da segunda checagem em diante o detalhe aparece.

## O que **não** foi testado ao vivo

A sessão que escreveu o vigia não alcança o Google Docs (a rede dela só libera repositórios e gerenciadores de pacotes). Foram testados, com textos inventados e também com o export local de 20 de novembro de 2026 (78 seções localizadas): a normalização, a divisão por títulos, os hashes, a comparação, a validação do download (HTTP de erro, HTML, texto pequeno, título faltando), os resumos, os relatórios das issues e as salvaguardas contra gravar estado vazio.

**Ficou sem teste real**, e é o que você deve conferir na primeira execução:

1. Que `https://docs.google.com/document/d/…/export?format=txt` responde sem login a partir de um runner do GitHub. Se o dono do documento restringir o acesso, o vigia vai abrir a issue "Vigia do documento falhou" com o motivo.
2. Que os hashes do `secoes.json` (calculados do export manual) batem com o que o download automático devolve. Se o documento tiver mudado desde o export, a primeira issue lista as seções que mudaram desde então; se **todas** as seções aparecerem como mudadas, o export manual e o automático diferem em formato e basta rodar `gravar` para recomeçar a base.
3. Os passos do workflow que usam a CLI `gh` (abrir, editar e fechar issues) e o `actions/cache`: seguem o modelo do `atualizar-dados.yml` do WaifuCatalogBuildFix, mas nunca rodaram neste repositório.

**Passo a passo para a primeira vez:** aba Actions → "Vigia do documento" → Run workflow. Depois olhe: (a) o job ficou verde? (b) existe a issue "Documento oficial mudou" ou "Vigia do documento falhou"? (c) o commit "Vigia: checagem de …" apareceu na `main`?

## Direitos

O vigia guarda hashes e contagens. O texto do documento fica só no cache do Actions (privado ao repositório, expira sozinho) e nunca é commitado nem colado em issue.
