# Esquema de dados

Como o Builder descreve as opções do Main Sourcebook em `dados/`, e o que fica de fora dos dados e vai para código. Este documento é o contrato entre o conferidor de dados (`ferramentas/validar-dados.mjs`), o motor de cálculo e a interface. O formato do texto exportado está em [`formato-da-build.md`](formato-da-build.md).

**Direitos.** Os dados trazem só nomes de opção, números e resumos curtos em português escritos pelo autor do projeto. Nenhum trecho do documento é copiado para este repositório.

---

## Arquivos

```text
dados/
├── economia.json                      → budget, preço por tier, captura, venda, empréstimo, tetos
├── intensity.json                     → opções de Negotiations
├── origens.json
├── heritages.json                     → arquétipos, raízes e perks de Dragon, Lunarian, Machina e Theos
├── bindings.json                      → Seal of Approval e as seis árvores
├── lures.json                         → Sensory Lures, Other Lures, expansões e Space Truckin’
├── outros-controles.json
├── sanctuaries-e-strongholds.json
├── talents.json
├── defenses.json
├── outros-perks.json
└── servicos-e-missoes.json
```

Um arquivo por categoria, espelhando os arquivos da referência em português usada na conferência. As companions **não** têm arquivo: a lista de personagens do documento fica numa planilha externa, e o Builder aceita companion digitada (nome, obra e tier).

Cada arquivo de categoria tem a forma:

```json
{
  "categoria": "talents",
  "titulo": "Talents",
  "versaoDocumento": "Main Sourcebook (Current_unstable ver.), export de 2026-11-20",
  "opcoes": [ { … }, { … } ]
}
```

---

## Campos de uma opção

| Campo | Tipo | Obrigatório | O que é |
|---|---|---|---|
| `id` | texto | sim | Identificador estável: `categoria/slug` (`talents/athletic-talent`). Minúsculas, sem acento, hífens. **Nunca muda**, mesmo que o nome mude: builds salvas apontam para ele. Nome repetido na mesma categoria ganha sufixo (`-2`). |
| `nome` | texto | sim | Nome em inglês, exatamente como no documento (apóstrofo curvo `’` incluído). É o que aparece no texto exportado. |
| `categoria` | texto | sim | O arquivo de dados a que pertence. |
| `grupo` | texto | não | Subgrupo dentro da categoria (`carnal-perks`, `laws`, `heritage-dragon`). Serve a requisitos do tipo "qualquer das outras Laws" e à interface. |
| `custo` | objeto | sim | Ver [Custo](#custo). |
| `repeticao` | objeto | não | Quantas vezes se compra. Ver [Repetição e limites](#repetição-e-limites). |
| `requisitos` | objeto | não | O que precisa estar na build. Ver [Requisitos](#requisitos). |
| `gratis` | lista | não | O que a opção dá de graça. Ver [Gratuidades](#gratuidades). |
| `exclusoes` | lista | não | Ids que não podem coexistir com esta. Ver [Exclusões](#exclusões). |
| `descontos` | lista | não | Descontos que valem para esta opção. Ver [Descontos](#descontos). |
| `escolha` | objeto | não | Decisão feita dentro da opção. Ver [Escolha dentro da opção](#escolha-dentro-da-opção). |
| `efeitos` | lista | não | Mudanças em Intensity, budget, empréstimo ou regras gerais. Ver [Efeitos](#efeitos). |
| `resumo` | texto | sim | Uma ou duas frases em português, escritas pelo autor, que dizem o que a opção faz. Sem copiar o documento. |
| `verificado` | booleano | sim | `true` se nome, custo e requisitos foram conferidos contra o texto do documento. `false` se vieram da referência sem conferência no documento. Todo `false` aparece em [`pendencias-de-dados.md`](pendencias-de-dados.md), no app e no texto exportado. |
| `regraEspecial` | texto | não | Id de uma regra que o esquema não cobre. Ver [Regra especial](#regra-especial). |
| `soNaCriacao` | booleano | não | `true` se só se compra na criação (chargen). Padrão `false`. |
| `tipo` | lista de textos | não | Etiquetas do documento (`Root`, `Self`, `Party`, `Lure`, `Capture`…), usadas pela interface. |
| `referencia` | texto | não | Caminho do arquivo da referência em português de onde a opção foi conferida (`bindings/mystic-tattoo.md`). Só o conferidor de dados usa. |

Campo desconhecido é erro do conferidor.

---

## Custo

`custo` descreve **quanto cada compra custa**. Todo valor é inteiro em créditos, a menos que `moeda` diga outra coisa (`"IMG"`).

| `tipo` | Forma | Exemplo |
|---|---|---|
| `fixo` | `{ "tipo": "fixo", "valor": 5 }` | Athletic Talent: 5 em toda compra. |
| `gratis` | `{ "tipo": "gratis" }` | Seal of Approval. Equivale a `fixo` com 0. |
| `sequencia` | `{ "tipo": "sequencia", "valores": [60, 30], "depois": { "incremento": 10 } }` | Cada compra tem o seu preço: a 1ª custa 60, a 2ª 30, e as seguintes o anterior mais 10. Sem `depois`, não há compra além da lista (ver `repeticao`). |
| `porCompra` | `{ "tipo": "porCompra", "valores": [20, 20] }` | Defenses: 20 na 1ª compra (resistência) e 20 na 2ª (imunidade). Igual a `sequencia` sem `depois`; o nome existe para o texto ficar claro. |
| `percentualDoTier` | `{ "tipo": "percentualDoTier", "percentual": 40, "base": "passo3", "minimo": 0 }` | Desconto de uma porcentagem do preço normal do tier do subject. O custo é **negativo**: a opção devolve crédito ou desconta de outra compra. |
| `diferencaDeTier` | `{ "tipo": "diferencaDeTier" }` | Power Swap: preço do tier do dono original do poder menos o do tier da pessoa. Pode ser negativo. Precisa de `regraEspecial`. |
| `precoDoTier` | `{ "tipo": "precoDoTier" }` | Companion e a compra de um corpo: o preço do tier informado. Usado pela origem Possess e pelo bloco `Companions`. |
| `porEscolha` | `{ "tipo": "porEscolha" }` | O custo vem de `escolha.opcoes[].custo` (ver abaixo). |
| `formula` | `{ "tipo": "formula", "descricao": "…" }` | O custo depende de algo que o esquema não descreve. Exige `regraEspecial`. |

Preço em IMG: `"moeda": "IMG"` dentro de `custo` (`{ "tipo": "fixo", "valor": 2, "moeda": "IMG" }`). IMG tem saldo separado do saldo de créditos e não entra na `Conferência` de créditos.

**Custo que varia com a quantidade.** Duas formas:

- *Preço igual em toda compra, com limite de compras:* `fixo` e `repeticao.max`. Ex.: "6 por compra (96 pelas dezesseis)" é `fixo 6` com `max 16`; o total (96) é só conferência no texto da referência.
- *Preço que muda de compra para compra:* `sequencia`. Ex.: "75 na primeira, 10 a mais a cada nova compra" é `valores [75]` com `depois.incremento 10`; "60 (recompras: 30, depois 10 a mais a cada uma)" é `valores [60, 30]` com `depois.incremento 10`.

**Preço cheio e brindes.** O `custo` é o **preço de lista** da opção. Brindes, descontos e teto de desconto (80%, exceto Talents e Defenses) são aplicados pelo motor, não escritos no custo.

---

## Repetição e limites

```json
"repeticao": { "min": 1, "max": 2 }
```

- `max` ausente: uma compra só. `max: null`: sem limite.
- `max` acima de 1 diz quantas compras; o preço de cada uma vem de `custo`. Defenses têm `max: 2`.
- `porMundo: true`: a opção só pode ser comprada uma vez por mundo (ou como o texto da opção disser). Só a interface mostra; o motor avisa quando o usuário informa mais.
- `exigeCompraPrevia`: `{ "id": "…", "quantidade": 25 }` para "comprado 25 vezes" (ver Requisitos, que cobre isso).

`soNaCriacao: true` (campo da opção, fora de `repeticao`) vale para perks que só se compram no chargen, como a Memoria.

---

## Requisitos

`requisitos` é uma expressão; a opção só é comprável se ela for verdadeira. Formas:

| Forma | Significa |
|---|---|
| `{ "id": "bindings/seal-of-approval" }` | Ter essa opção. |
| `{ "todos": [ … ] }` | Todas as sub-expressões. |
| `{ "qualquerDe": [ … ] }` | Pelo menos uma. |
| `{ "grupo": "laws", "minimo": 1, "exceto": "self" }` | Pelo menos `minimo` opções do grupo, sem contar a própria opção. |
| `{ "compras": { "id": "…", "minimo": 25 } }` | Ter comprado a opção pelo menos N vezes. |
| `{ "origem": "possess" }` | Ter essa origem (`drop-in`, `walk-in`, `extra`, `substitute`, `possess`). |
| `{ "intensity": { "min": 3 } }` | Intensity final dentro da faixa (`min` e/ou `max`). |
| `{ "nao": { … } }` | A sub-expressão é falsa. Serve a "não ter X". |
| `{ "declarado": "…" }` | Condição de história que o motor não verifica, como "alguém conhecido por trabalhar com venenos". O usuário marca; o texto exportado a lista em `Avisos` como `[AVISO]`. |

Requisito que aponta para um id inexistente é erro do conferidor. Um requisito que depende de uma opção de outra categoria usa o id completo (`bindings/seal-of-approval`).

---

## Gratuidades

```json
"gratis": [
  { "id": "talents/aesthetic-talent", "quantidade": 1 }
]
```

- Cada item é uma opção que a compra dá de graça, `quantidade` cópias (padrão 1). Brinde **ignora pré-requisito**.
- A linha do brinde no texto exportado é `custo 0 | gratis-de <opção>`.
- Se o contractor já tinha comprado o perk, o brinde vira desconto em outra compra pelo valor do brinde. Essa regra é geral (vale para toda opção com `gratis`) e é implementada no motor como regra especial `brinde-duplicado`.
- Uma gratuidade condicional (ex.: "o elemento escolhido dá estes Talents") usa `escolha.opcoes[].gratis` com a lista própria de cada alternativa.

---

## Exclusões

```json
"exclusoes": [ "heritages/dragon-root", "heritages/lunarian-root" ]
```

Ids que não podem coexistir com esta opção. A exclusão é simétrica: basta escrever de um lado, e o conferidor confirma que o outro lado não a contradiz. Raízes de heritage, as opções de uma categoria de Intensity que se excluem entre si, e as bindings (uma por vez) usam esta lista ou `grupoExclusivo`:

```json
"grupoExclusivo": "heritage-root"
```

Todas as opções com o mesmo `grupoExclusivo` se excluem entre si.

---

## Descontos

```json
"descontos": [
  { "id": "…", "tipo": "condicao", "percentual": 40, "condicao": "…" }
]
```

| `tipo` | Forma | Quem calcula |
|---|---|---|
| `condicao` | Desconto fixo em porcentagem quando uma condição de história vale. O usuário **declara** que a condição vale; o Builder não a verifica. | Motor, a partir da declaração. |
| `porQuantidade` | Desconto por compra repetida, quando o custo da repetição não cabe em `sequencia`. | Motor. |
| `porArquetipo` | O desconto das heritages por arquétipo de quem compartilha o arquétipo. | Regra especial `desconto-por-arquetipo`. |
| `porMembro` | Desconto que cada membro do séquito dá (Defense Rebates). | Regra especial `defense-rebates`. |

O teto geral de descontos somados numa mesma opção (80% do preço de lista, sem teto em Talents e Defenses) está em `economia.json` e é aplicado pelo motor.

Desconto que depende dos traços ou do tier de **pessoas** da build (Defense Rebates, arquétipo, Yoink, Slightly Used) precisa de regra escrita em código: o esquema só diz que há desconto e qual regra o calcula. Enquanto a regra não estiver implementada, a opção aparece com `[NÃO IMPLEMENTADA]` e o usuário informa o desconto à mão.

---

## Escolha dentro da opção

Opção que pede uma decisão (um elemento, um tema, uma instalação, um alvo):

```json
"escolha": {
  "rotulo": "Instalação",
  "tipo": "lista",
  "opcoes": [
    { "valor": "Garage",   "custo": 20 },
    { "valor": "Hangar",   "custo": 30 },
    { "valor": "Drydock",  "custo": 40 },
    { "valor": "Spaceport","custo": 50 }
  ],
  "multipla": true
}
```

- `tipo` é `lista` (o usuário escolhe de uma lista fixa), `texto` (texto livre, como o nome de um alvo) ou `opcao` (escolhe outra opção da build: "uma cópia de Mind Defense").
- Em `lista`, cada alternativa pode trazer `custo` (com `custo: { "tipo": "porEscolha" }` na opção), `gratis` e `requisitos`.
- `multipla: true` permite várias escolhas na mesma compra (cada uma é cobrada). No texto exportado: `[Garage, Hangar]`.
- A escolha aparece entre colchetes na linha do texto exportado.

---

## Efeitos

Opção que muda budget, Intensity, empréstimo ou uma regra geral:

```json
"efeitos": [
  { "tipo": "intensity", "valor": 3 }
]
```

| `tipo` | Campos | O que faz |
|---|---|---|
| `intensity` | `valor` (com sinal) | Soma ao cálculo da Intensity. É o efeito das opções de Negotiations. |
| `budget` | `valor` | Soma créditos ao saldo inicial (empréstimo, recompensa). |
| `limiteEmprestimo` | `valor` | Soma ao limite de empréstimo. |
| `regra` | `id` | Liga uma regra geral do motor (por exemplo, "sem R.I.P.", "sem bindings"). Exige `regraEspecial` se a regra mexe em outras opções. |

As opções de Intensity que desligam uma categoria inteira (No Bindings, Heritages Banned, No Defenses) usam `efeitos: [{ "tipo": "regra", "id": "bloqueia-categoria", "categoria": "bindings" }]`: o motor passa a recusar compras dessa categoria.

---

## Regra especial

`regraEspecial` é o id de uma regra que o esquema não descreve só com dados. Cada id está listado em [`regras-especiais.md`](regras-especiais.md), com o que a regra faz, em que opções aparece e o estado: `implementada` ou `não implementada`. O motor tem uma tabela `id → função`; id sem função faz o app mostrar **"regra não implementada"** na opção e escrever uma linha `[NÃO IMPLEMENTADA]` em `Avisos` do texto exportado.

Só se implementa uma regra especial quando ela é simples e testável. As demais ficam na lista, sem código.

---

## O que cabe só em dados e o que precisa de código

| Em dados (esquema) | Em código (regra escrita) |
|---|---|
| Custo fixo, por compra, em sequência, por escolha, em IMG | Custo que depende do tier de pessoas da build (Power Swap, Possess, Substitute ajustado) |
| Requisito de id, de grupo, de origem, de Intensity, de compras anteriores | Condição de história que o motor não pode verificar (vira `declarado`) |
| Brindes (`gratis`) e exclusões | Brinde duplicado vira desconto (regra geral do motor) |
| Efeito em Intensity, budget e empréstimo | Opção que liga ou desliga uma regra global (R.I.P., PvP, tiers, captura) |
| Desconto fixo por condição declarada | Desconto por pessoa (Defense Rebates), por arquétipo, por duplicata de poder |
| Tabelas: budget inicial, captura, venda, preço por tier, limite de empréstimo | Teto de 80% nos descontos somados, arredondamento "para cima" nas compras, Intensity mínima 0 e teto 10 |
| Escolha de lista com custo por alternativa | Escolha que muda o resto da árvore (o elemento que muda os brindes de outras opções) quando a conta depende de várias opções |
| Resumo curto em português e `verificado` | Efeitos de história (o que a opção faz no mundo): ficam só no resumo |

Regras gerais do motor (não são do esquema, mas de toda build): arredondamento de preço para cima; teto de descontos somados; Intensity mínima 0 e teto 10 para budget e pagamentos; empréstimo limitado por Intensity; dívida bloqueia compras.

---

## `economia.json`

```json
{
  "versaoDocumento": "Main Sourcebook (Current_unstable ver.), export de 2026-11-20",
  "intensity": { "base": 1, "minimo": 0, "tetoParaBudget": 10 },
  "budgetInicial": {
    "verificado": true,
    "porIntensity": { "0": [55, 90, 145, 230, 375, 610, 985, 1590, 2575, 4165] }
  },
  "precoPorTier": {
    "verificado": false,
    "aviso": "NÃO CONFIRMADO NO DOCUMENTO: a tabela de preços por tier é uma imagem e não vem no texto exportado.",
    "tier": { "1": 1, "2": 2, "3": 5, "4": 10, "5": 20, "6": 50, "7": 100, "8": 200, "9": 500, "10": 1000 }
  },
  "tiersImaginarios": { "verificado": true, "img": { "X": 2, "Y": 5, "Z": 10 } },
  "captura":  { "verificado": true, "regular": { "…": "…" }, "figurante": { "…": "…" } },
  "venda":    { "verificado": true, "porIntensity": { "…": "…" } },
  "emprestimo": { "verificado": true, "limiteBuildInicial": { "…": "…" }, "acrescimoPorMundo": 100, "maximo": 5000 },
  "reembolso": { "verificado": true, "percentual": 80 },
  "tetoDescontos": { "verificado": true, "percentual": 80, "semTeto": ["talents", "defenses"] }
}
```

- Cada bloco tem o seu `verificado`. O valor `false` sempre vem com `aviso` visível no app e no texto exportado.
- `budgetInicial.porIntensity[N]` é uma lista de 10 valores, DR 1 a DR 10. A mesma convenção vale para a venda (`venda.porIntensity[N]`, tier 1 a 10). A captura tem duas tabelas do mesmo formato: `captura.regular[N]` e `captura.figurante[N]` (o valor do figurante que não passa no teste de três de quatro). Intensity 0 existe nas três.
- `tiersImaginarios.captura.porIntensity[N]` e `tiersImaginarios.venda.porIntensity[N]` trazem, por tier `X`, `Y`, `Z`, `{ creditos, img }`; na captura, `figurante` traz o mesmo par do figurante. `creditosPorImg` é 1000.
- `emprestimo.limiteBuildInicial[N]` é o limite do empréstimo na build inicial, de Intensity 0 a 10; `acrescimoPorMundo`, `maximo` e `jurosPor30Dias` são do documento. O motor só usa o limite da build inicial.
- Preços por tier são o único bloco `verificado: false` de economia (a tabela do documento é uma imagem).

---

## Companions por tier

Companion não é opção de `dados/`: é entrada do usuário (nome, obra, tier, papel, como entrou). O motor calcula:

- **Compra:** o preço do tier em `economia.json` (`precoPorTier`); em IMG para tier X, Y, Z. Arredondado para cima.
- **Captura:** o valor de `captura[intensity][tier]`, regular ou de figurante, conforme a pessoa.
- **Venda:** `venda[intensity][tier]`.
- **Descontos de minion e de summon:** 50% do preço (regra de Followers e Familiars), lançados em `desconto`.
- **Possess e Substitute:** `custo = preço do tier` mais a regra da origem; a origem vive em `origens.json`, com `custo: { "tipo": "precoDoTier" }`.

---

## Exemplo

Três opções reais, em JSON. Os valores são os da referência na data deste documento; os arquivos de `dados/` são a fonte, e o conferidor falha se este trecho divergir deles.

```json
{
  "categoria": "exemplo",
  "opcoes": [
    {
      "id": "talents/athletic-talent",
      "nome": "Athletic Talent",
      "categoria": "talents",
      "custo": { "tipo": "fixo", "valor": 5 },
      "resumo": "Ele aprende rápido qualquer habilidade atlética não sobrenatural e a leva a níveis sobrenaturais.",
      "verificado": true,
      "referencia": "talents.md"
    },
    {
      "id": "bindings/mystic-tattoo",
      "nome": "Mystic Tattoo",
      "categoria": "bindings",
      "custo": { "tipo": "fixo", "valor": 25 },
      "requisitos": { "id": "bindings/seal-of-approval" },
      "gratis": [ { "id": "talents/aesthetic-talent", "quantidade": 1 } ],
      "grupoExclusivo": "binding-ativa",
      "resumo": "A binding vira uma tatuagem que marca a pessoa como dele e abre a árvore de perks da tinta.",
      "verificado": true,
      "referencia": "bindings/mystic-tattoo.md"
    },
    {
      "id": "bindings/elemental-inkarnation",
      "nome": "Elemental Inkarnation",
      "categoria": "bindings",
      "custo": { "tipo": "sequencia", "valores": [60, 30], "depois": { "incremento": 10 } },
      "repeticao": { "max": null },
      "requisitos": { "id": "bindings/slave-to-art" },
      "resumo": "Cada compra liga um elemento à tinta; a primeira custa mais e as recompras sobem de 10 em 10.",
      "verificado": true,
      "referencia": "bindings/mystic-tattoo.md"
    }
  ]
}
```

---

## O que o conferidor de dados verifica

`ferramentas/validar-dados.mjs` (Node, sem dependências) falha se:

- um campo obrigatório falta ou há campo desconhecido;
- um `id` se repete, ou não segue `categoria/slug`;
- um id citado em `requisitos`, `gratis` ou `exclusoes` não existe;
- um `custo` não é numérico (ou a `sequencia` não tem lista de inteiros);
- `verificado` não é booleano, ou há `verificado: false` sem ter linha em `pendencias-de-dados.md`;
- `regraEspecial` cita um id que não está em `regras-especiais.md`;
- o `nome` de uma opção não bate com um título `##` ou `###` da referência em português (`--referencia <pasta>`; roda quando a pasta está disponível, que é o caso local, e é pulado no CI do repositório público com a mensagem "referência não disponível").
