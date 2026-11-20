# Regras especiais

Algumas opções do Main Sourcebook têm uma regra que o esquema de dados (`docs/esquema-de-dados.md`) não consegue escrever como número, requisito ou desconto fixo. Nesses casos a opção leva o campo `regraEspecial` com um dos ids abaixo, e o motor (`fonte/motor.js`, `REGRAS_ESPECIAIS`) decide o que fazer.

Hoje **nenhuma** das regras está implementada. O que o app faz com uma regra não implementada:

1. a opção continua podendo ser escolhida, com o preço de lista, ou com o custo que a pessoa digitar quando o preço depende da regra;
2. a conta do saldo **não** inclui o efeito da regra (por exemplo, o desconto);
3. a tela e o texto exportado trazem a linha `[NÃO IMPLEMENTADA]` em `Avisos`, com o nome da regra e a lista das opções afetadas, para que a LLM que lê a build e a pessoa saibam que aquele ajuste fica por conta de quem lê.

A tabela diz, para cada regra, quem a usa e o que faltaria para implementar. O conferidor de dados (`npm run validar`) exige que todo id de `REGRAS_ESPECIAIS` apareça aqui e que toda `regraEspecial` dos dados esteja no motor e neste arquivo.

| Id | Estado | Opções que usam | O que a regra faz |
|---|---|---|---|
| `defense-rebates` | não implementada | as 15 opções de `defenses/` | Cada Defense tem um desconto que depende dos traços da origem e dos membros do séquito. Por pessoa que tem o traço, o desconto é o preço de lista do tier efetivo dela depois do passo 1a, com teto de 40% do preço de cada estágio da Defense. Não contam Walk-In, Extras capturados nem familiars. Descontos diretos na compra da pessoa (Yeet, Slightly Used, desconto de minion e summon) baixam o teto dela. Uma pessoa pode abrir vários descontos, mas nunca o mesmo duas vezes, e a soma dos descontos de uma pessoa não passa do preço de lista do tier dela no passo 1a. |
| `desconto-por-arquetipo` | não implementada | 44 opções de `heritages/` (as raízes e todo perk pago em créditos) | Quando a origem tem o arquétipo da heritage, o preço de lista do tier dela (passo 1a) abate o preço da heritage e a sobra passa aos perks seguintes, até acabar, com teto de 80% por perk. Drop-In e Walk-In sem Power Swap não têm esse desconto. Com Power Swap, um tier imaginário conta pelo câmbio em IMG. Os capstones de 1 IMG não recebem o desconto (o documento não diz o contrário). |
| `custo-textual` | não implementada | `bindings/grand-tapestry`, `outros-perks/yoink` | O custo não cabe nos tipos do esquema. Grand Tapestry: o brinde é "Talent Sharing por Talent que a pessoa tem, mais Psychic Talent", quantidade variável que `gratis` não escreve. Yoink: o preço é 20% acima do de lista do subject, com mínimo de 1, e o esquema só descreve desconto, não acréscimo. O app pede o custo à mão. |
| `diferenca-de-tier` | não implementada | `outros-perks/power-swap` | O preço é o do dono original do poder menos o do tier da pessoa, e pode dar negativo (devolve créditos). Em quem já está no séquito soma 20% do preço do tier dela no passo 1a. O app pede o custo à mão. |
| `requisito-textual` | reservada, sem uso | nenhuma | Seria o marcador de um requisito que o Builder não verifica. Os dados usam `{ "declarado": "…" }` dentro de `requisitos`, que o app mostra como pergunta à pessoa e como `[AVISO]` no texto exportado, então esta regra não foi preciso usar. Fica no motor para o caso de um requisito que nem como `declarado` caiba. |

## Opções que o app trata como "digite o custo" sem regra especial

Duas opções têm um tipo de custo que o motor ainda não calcula, e por isso o app pede o custo à mão e avisa com `custo-textual`:

- `outros-perks/yeet` (40% do preço do tier do subject) e `outros-perks/slightly-used` (30% do preço do tier, base no passo 3) usam o tipo `percentualDoTier`, e o preço do tier de cada pessoa depende da tabela de preços por tier, que ainda é `verificado: false` (ver `docs/pendencias-de-dados.md`).

## Efeitos que não são regra especial, mas o Builder não calcula

Várias opções de Intensity mudam como o jogo funciona sem mudar a conta (como a divisão entre captura e venda, juros, prazos de entrega e limites de exploração). O número da cláusula entra na conta de Intensity, e o efeito aparece só no `resumo`. A lista completa está em `docs/pendencias-de-dados.md`.

## Como acrescentar uma regra

1. Acrescente o id a `REGRAS_ESPECIAIS` em `fonte/motor.js`, com `implementada: false`, um título e o texto do aviso.
2. Escreva uma linha na tabela acima.
3. Use `regraEspecial` na opção, rode `npm run validar` e `npm test`.
4. Ao implementar, troque `implementada` para `true`, escreva os testes da regra em `testes/` e atualize a linha da tabela.
