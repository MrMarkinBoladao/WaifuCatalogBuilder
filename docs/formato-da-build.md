# Formato da build (`wcb/1`)

Este documento define o texto que o Waifu Catalog Builder **exporta** e **reimporta**. O mesmo texto serve a três leitores:

1. **O Builder**, que reabre a build a partir dele (importação) e recalcula tudo.
2. **Uma LLM**, que o recebe junto com um protocolo e o transforma em prompt de roleplay. Ela não tem o Builder: precisa conseguir conferir os totais só com o texto.
3. **Uma pessoa**, que lê, edita à mão e cola de volta.

O documento de referência é o Waifu Catalog, Main Sourcebook (Current/unstable ver.). O Interactive não é fonte, e este formato **não** imita o texto dele.

---

## Princípios

- **Um bloco por categoria**, na ordem fixa da seção [Blocos](#blocos). Bloco vazio não aparece.
- **Nome de opção em inglês, exatamente como no documento** (inclusive maiúsculas, hífens e apóstrofo curvo `’`). Os rótulos do formato (`custo`, `saldo`, `Resumo`…) são sempre em português, qualquer que seja o idioma da interface do Builder. O texto exportado é o mesmo em PT e em EN.
- **Custo e saldo depois de cada compra.** Cada linha traz o que a compra custou de fato (já com brindes e descontos) e o saldo logo depois dela. O saldo segue a ordem dos blocos e das linhas do texto; ela não é a ordem em que o usuário clicou.
- **Nada que o Builder não consiga recalcular.** O texto não traz hash, data de exportação, identificador interno nem resultado de rolagem. Toda linha de totais é recalculada na importação e comparada com a do texto; se não bater, a importação avisa e usa o valor recalculado.
- **Totais explícitos**, para a LLM conferir sem refazer a conta: subtotal por bloco, e um bloco `Conferência` com a equação do saldo.
- **Avisos dentro do texto.** Dado não confirmado, regra não implementada e erro de regra aparecem no bloco `Avisos`, nunca só na tela.
- **Texto sem formatação.** Sem tabela, sem negrito, sem HTML. Codificação UTF-8, quebra de linha `\n`, uma linha por fato.

---

## Cabeçalho

As quatro primeiras linhas, nesta ordem:

```text
WAIFU CATALOG BUILD
Formato: wcb/1
Documento: Main Sourcebook (Current_unstable ver.), export de 2026-11-20
Builder: 0.1.0
```

- `Formato` diz a versão deste documento. Mudança que quebra a leitura sobe o número (`wcb/2`); acréscimo de campo opcional não sobe. O Builder abre `wcb/1` e recusa outra versão, dizendo qual.
- `Documento` é a versão do Main Sourcebook de que saíram os dados do Builder (nome e data do export). A LLM usa para saber que versão das regras a build assume.
- `Builder` é a versão do Builder que exportou. Não entra em nenhuma conta.

---

## Blocos

Cada bloco começa por uma linha `## Nome do bloco`. A ordem é esta:

| # | Bloco | O que traz |
|---|---|---|
| 1 | `Resumo` | Mundo, DR, Intensity, budget inicial e empréstimo, em linhas `Rótulo: valor`. |
| 2 | `Intensity` | As opções de Negotiations escolhidas, cada uma com o valor. |
| 3 | `Origin` | A origem (Drop-In, Walk-In, Extra, Substitute, Possess) e seus ajustes. |
| 4 | `Heritage` | A raiz e os perks da heritage. |
| 5 | `Bindings` | A binding (uma só) e seus perks. |
| 6 | `Lures` | Sensory Lures, Other Lures e expansões, inclusive Space Truckin’. |
| 7 | `Other Controls` | Other Controls. |
| 8 | `Sanctuaries & Strongholds` | Demiplane, Planetary Perks, Shipwright, Laws, Sanctuary, Stronghold. |
| 9 | `Talents` | Talents. |
| 10 | `Defenses` | Defenses. |
| 11 | `Other Perks` | Carnal, Navigation, Setting, Travel, Miscellaneous e Global Perks. |
| 12 | `Company Services` | Compras e créditos de Company Services e de Missions (recompensas). |
| 13 | `Companions` | Companions, followers e familiars: compra, captura, venda. |
| 14 | `Conferência` | A equação do saldo. Sempre presente. |
| 15 | `Avisos` | Avisos, não confirmados, regras não implementadas e erros. Sempre presente (pode ter uma linha `- nenhum`). |

Os blocos 3 a 13 só aparecem se tiverem linhas. `Resumo`, `Intensity`, `Conferência` e `Avisos` sempre aparecem.

---

## Resumo

Linhas `Rótulo: valor`, nesta ordem. O que a build não tem fica de fora (só `Contractor` e `Mundo inicial` podem faltar).

| Rótulo | Valor |
|---|---|
| `Contractor` | Nome do contractor (texto livre, opcional). |
| `Mundo inicial` | Nome do mundo e, entre colchetes, a condição, se houver (`Mundo Exemplo [Canon]`). |
| `DR` | Danger Rating do mundo, de 1 a 10. É dado de entrada: o Builder não adivinha o DR de um mundo. |
| `Intensity` | O número final da Intensity (de 0 a 10; a conta pode passar de 10, mas vale 10 para budget e pagamentos). |
| `Budget inicial` | O valor da tabela de budget para essa Intensity e esse DR. |
| `Empréstimo na criação` | Quanto foi tomado de empréstimo na criação (0 se nenhum). |
| `Limite de empréstimo` | O limite da build inicial para essa Intensity. |

Se um número do `Resumo` não bater com o recalculado a partir dos blocos, a importação avisa e usa o recalculado.

---

## Linhas de opção

Toda linha de compra dos blocos 3 a 13 tem a forma:

```text
- Nome [escolha] xN | campo valor | campo valor | …
```

- `Nome`: nome da opção em inglês, exato. É o único campo obrigatório e identifica a opção dentro do bloco.
- `[escolha]`: a decisão feita dentro da opção, quando ela tem uma (um elemento, um alvo, uma instalação). O texto não leva `|`, `]` nem quebra de linha; o exportador troca `|` por `/` e `]` por `)`.
- `xN`: quantidade, quando a opção se compra mais de uma vez (`x2` em uma Defense são as duas compras, resistência e imunidade). Omitido quando é 1.
- Os campos depois de ` | ` são pares `campo valor`, separados por um espaço. A ordem é a da tabela abaixo.

| Campo | Valor | Quando aparece |
|---|---|---|
| `custo` | Créditos que essa linha custou, depois de brindes e descontos. Inteiro. Pode ser 0 (grátis) ou negativo (Power Swap que devolve crédito). Na linha de uma opção paga em IMG, o campo é `custo-img`. | Toda linha de compra. |
| `ganho` | Créditos recebidos por essa linha (captura, recompensa de missão). Inteiro positivo. | Em vez de `custo`, nas linhas que pagam. |
| `lista` | Preço de lista, antes de descontos, quando difere de `custo`. | Linha com desconto. |
| `desconto` | Valor do desconto e o motivo entre parênteses: `desconto 10 (condição declarada)`. | Linha com desconto. |
| `gratis-de` | Nome da opção que deu esta de graça. | Linha de brinde. |
| `saldo` | Saldo de créditos logo depois desta linha. | Toda linha com `custo` ou `ganho`. |

Regras:

- A linha de um brinde tem `custo 0` e `gratis-de`. Quando o contractor já tinha comprado o perk que o brinde daria, o brinde vira desconto em outra compra (regra de Compras do documento): o exportador escreve `desconto N (brinde duplicado de X)` na linha da compra que o usuário escolheu. Esse caso é regra especial no esquema de dados.
- Linhas de `Intensity` não têm `custo`: têm `valor` com sinal (`valor +3`, `valor -1`, `valor +0`).
- O bloco `Intensity` não tem `saldo`: Intensity não gasta créditos. Efeitos de uma opção de Intensity sobre créditos (captura, venda, empréstimo) entram nos cálculos do Builder e, quando o Builder não os calcula, em `Avisos`.
- Campo desconhecido, ou fora da ordem, é erro de importação com a linha e o campo.

### Subtotal

Depois das linhas de cada bloco de 3 a 11 e 12, a linha `Subtotal: N` traz a soma dos `custo` do bloco. No bloco `Companions`, a linha de subtotal é `Subtotal: gastos N, ganhos M` quando há captura ou venda, e `Subtotal: N` quando só há compra. O bloco `Origin` não tem subtotal (uma linha só).

---

## Companions

O documento guarda a lista de personagens numa planilha externa, que não está no texto do documento. Por isso o Builder aceita **companion digitada**: nome, obra de origem e tier. Não há outro tipo de linha.

```text
- Nome | obra Obra | tier N | entrada como | papel p | estado e | custo N | saldo N
```

| Campo | Valores |
|---|---|
| `obra` | Obra de origem (texto livre). Para um companion que não é de obra, `obra -`. |
| `tier` | `1` a `10`, ou `X`, `Y`, `Z` (tiers imaginários, pagos em IMG, campo `custo-img`). É o tier efetivo no passo 1a, informado pelo usuário. |
| `entrada` | Como entrou no séquito: `compra`, `captura`, `gratis` (veio de graça de outra opção; vem com `gratis-de`), `origem` (veio com Possess ou Substitute) ou `yeet` (solto por Yeet, ainda não capturado). |
| `papel` | `companion`, `follower` ou `familiar`. Familiar e follower de um mestre trazem `de Nome` (o mestre); minion de um mestre comprado tem o desconto de 50% da regra de Followers e Familiars, lançado em `desconto`. |
| `estado` | `no séquito` ou `vendida`. |
| `custo` / `ganho` | `custo` na compra; `ganho` na captura (o crédito pago pela captura). |
| `venda` | Quando `estado vendida`: o crédito pago pela venda. |
| `saldo` | Saldo depois de todas as linhas dessa pessoa (compra, ou captura e venda juntas). |

Uma pessoa capturada e vendida é **uma linha só**, com `ganho` (captura) e `venda`. O `saldo` dela inclui os dois.

---

## Conferência

Linhas `Rótulo: valor`, recalculadas na importação:

```text
Budget inicial: <valor da tabela>
Empréstimo: <tomado na criação>
Ganhos: <soma de todos os `ganho` e `venda`>
Gastos: <soma de todos os `custo`, positivos e negativos>
Saldo final: <Budget inicial + Empréstimo + Ganhos − Gastos>
Dívida: sim | não
```

- `Saldo final` é igual ao `saldo` da última linha do texto.
- `Dívida: sim` quando o saldo final é negativo. Com dívida o contractor não pode fazer compras (regra de Company Services); o texto também traz um `[ERRO]` em `Avisos`.
- Para conferir sem o Builder, a LLM soma os `custo` e os `ganho` de todas as linhas, compara com `Gastos` e `Ganhos` e confere a equação. Se não fechar, mostra onde e **não conserta sozinha**.

---

## Avisos

Cada linha tem uma etiqueta entre colchetes:

| Etiqueta | Significado |
|---|---|
| `[NÃO CONFIRMADO]` | O valor veio de uma fonte que o documento não confirma em texto (hoje, só a tabela de preço por tier). Diz o que é e quem depende dele. |
| `[NÃO IMPLEMENTADA]` | A opção tem uma regra que o Builder não calcula. A LLM e o usuário precisam resolver à mão. Diz a regra e a opção. |
| `[ERRO]` | A build quebra uma regra: requisito não atendido, saldo negativo, empréstimo acima do limite, opções que se excluem. Diz a opção e a regra. |
| `[AVISO]` | Algo que merece conferência mas não quebra regra (por exemplo, uma condição de desconto que o usuário declarou e o Builder não pode verificar). |

Sem avisos, o bloco traz uma linha só: `- nenhum`.

---

## Importação

O Builder lê o texto assim:

1. Confere `WAIFU CATALOG BUILD` e `Formato: wcb/1` nas primeiras linhas. Qualquer outro cabeçalho é recusado.
2. Lê cada bloco pelo título `## …`. Bloco desconhecido é ignorado com aviso; bloco repetido é erro.
3. Em cada linha de opção, procura o `Nome` nos dados do bloco. A comparação ignora maiúsculas e minúsculas, espaços repetidos e a diferença entre `'` e `’`. Nome que não existe vira **opção desconhecida**: a build reabre com ela marcada, sem custo, e o Builder avisa. O Builder não adivinha o nome mais parecido.
4. **Só os campos de entrada contam**: nome, `[escolha]`, `xN`, a seção `Resumo` (mundo, DR, empréstimo) e, em companions, `obra`, `tier`, `entrada`, `papel`, `estado`, `de` e a escolha. Custos, saldos, subtotais, `Conferência` e `Avisos` são **recalculados** e comparados com o texto.
5. Se um custo do texto difere do recalculado (por mudança de versão dos dados, por exemplo), a importação avisa quais linhas mudaram e usa o recalculado.
6. A ordem das linhas dentro de um bloco não importa para a leitura; o exportador sempre as emite na ordem do documento.

**Ida e volta.** Exportar, importar e exportar de novo produz texto igual, byte a byte, com a mesma versão do Builder e dos dados. Os testes do Builder cobrem isso para os dois exemplos abaixo.

---

## Exemplos

Os dois exemplos são inventados (mundo, contractor e companions não existem) e usam opções e custos reais da referência. Os mesmos textos estão em [`exemplos/`](exemplos/), e os testes do Builder conferem que os arquivos e os blocos abaixo são iguais e que os dois passam na importação e na ida e volta.

### Exemplo pequeno

Intensity 2, mundo DR 3, Drop-In, dois Talents, um perk e duas companions compradas. Sem empréstimo, sem captura.

```text
WAIFU CATALOG BUILD
Formato: wcb/1
Documento: Main Sourcebook (Current_unstable ver.), export de 2026-11-20
Builder: 0.1.0

## Resumo
Contractor: Aiko Exemplo
Mundo inicial: Mundo Exemplo
DR: 3
Intensity: 2
Budget inicial: 60
Empréstimo na criação: 0
Limite de empréstimo: 400

## Intensity
- Hardcore | valor +3
- Open Exploration | valor -2
Soma das cláusulas: +1
Conta: 1 + 1 = 2

## Origin
- Drop-In | custo 0 | saldo 60

## Talents
- Athletic Talent | custo 5 | saldo 55
- Martial Talent | custo 10 | saldo 45
Subtotal: 15

## Other Perks
- Body Tune-Up | custo 5 | saldo 40
Subtotal: 5

## Companions
- Hoshi Mirei | obra Obra Exemplo | tier 3 | entrada compra | papel companion | estado no séquito | custo 5 | saldo 35
- Ren Tachibana | obra Obra Exemplo | tier 4 | entrada compra | papel companion | estado no séquito | custo 10 | saldo 25
Subtotal: 15

## Conferência
Budget inicial: 60
Empréstimo: 0
Ganhos: 0
Gastos: 35
Saldo final: 25
Dívida: não

## Avisos
- [NÃO CONFIRMADO] Preço por tier (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000): a tabela do documento é uma imagem e não vem no texto exportado. Afeta: Hoshi Mirei, Ren Tachibana.
```

### Exemplo médio

Intensity 4, mundo DR 5, Possess, binding Mystic Tattoo com uma expansão, brindes, uma Defense, empréstimo, uma companion comprada e outra capturada e vendida, com um aviso de regra não implementada.

```text
WAIFU CATALOG BUILD
Formato: wcb/1
Documento: Main Sourcebook (Current_unstable ver.), export de 2026-11-20
Builder: 0.1.0

## Resumo
Contractor: Kenji Exemplo
Mundo inicial: Mundo Exemplo [Canon]
DR: 5
Intensity: 4
Budget inicial: 100
Empréstimo na criação: 100
Limite de empréstimo: 200

## Intensity
- Hardcore | valor +3
- Is There Anybody Out There? | valor -1
- 50%/50% | valor -1
- Interesting Times | valor +1
- Intact Weaknesses | valor +1
Soma das cláusulas: +3
Conta: 1 + 3 = 4

## Origin
- Possess [Mika Exemplo, tier 6] | custo 50 | saldo 150

## Bindings
- Seal of Approval | custo 0 | saldo 150
- Mystic Tattoo | custo 25 | saldo 125
- Slave to Art | custo 50 | saldo 75
Subtotal: 75

## Lures
- Sticky Fingers | custo 5 | saldo 70
Subtotal: 5

## Talents
- Aesthetic Talent | custo 0 | gratis-de Mystic Tattoo | saldo 70
- Athletic Talent | custo 5 | saldo 65
Subtotal: 5

## Defenses
- Mind Defense | custo 0 | gratis-de Slave to Art | saldo 65
- Body Defense x2 | custo 30 | saldo 35
Subtotal: 30

## Other Perks
- Body Tune-Up | custo 5 | saldo 30
Subtotal: 5

## Companions
- Sora Exemplo | obra Obra Exemplo | tier 5 | entrada compra | papel companion | estado no séquito | custo 20 | saldo 10
- Taro Exemplo | obra Obra Exemplo | tier 4 | entrada captura | papel companion | estado vendida | ganho 1 | venda 4 | saldo 15
Subtotal: gastos 20, ganhos 5

## Conferência
Budget inicial: 100
Empréstimo: 100
Ganhos: 5
Gastos: 190
Saldo final: 15
Dívida: não

## Avisos
- [NÃO CONFIRMADO] Preço por tier (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000): a tabela do documento é uma imagem e não vem no texto exportado. Afeta: Mika Exemplo, Sora Exemplo.
- [NÃO IMPLEMENTADA] Defense Rebates: o Builder não calcula o desconto de Defenses por traços da origem do séquito. Afeta: Body Defense.
```

---

## O que este formato não faz

- Não guarda o texto do documento, nem resumos longos de opções: a LLM acha o que cada opção faz na referência do protocolo. A build traz só o que o usuário escolheu e o que isso custou.
- Não guarda o tempo da história (dívidas ao longo do tempo, juros, missões em andamento), só o estado de criação.
- Não decide o DR de um mundo nem o tier de um personagem: são entradas do usuário.
