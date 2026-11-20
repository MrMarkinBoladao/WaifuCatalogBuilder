# Pendências dos dados

O que ficou em aberto nos arquivos de `dados/` (330 opções, mais `economia.json`), por que ficou e o que o app faz enquanto isso. Este arquivo vale para o conferidor de dados: toda opção com `verificado: false` precisa aparecer aqui, entre crases, e todo título de opção da referência sem opção nos dados precisa de uma linha `sem-opcao`.

Nada aqui copia o texto do documento: são resumos próprios, em português.

## 1. Valores não confirmados (`verificado: false`)

Os itens abaixo dependem de uma **imagem** do documento, que não vem no texto exportado. O app mostra `[NÃO CONFIRMADO]` na tela e em `Avisos` do texto exportado sempre que uma build usa um deles, e pede que a pessoa confira (isso vale para as duas primeiras linhas; a terceira não afeta nenhuma opção).

- `economia/precoPorTier`: a tabela de preço por tier (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, mais o câmbio dos tiers imaginários X, Y e Z em 2, 5 e 10 IMG) é uma imagem. Os números usados vêm da referência em português, que os reconstruiu de exemplos espalhados pelo documento (tier 2 = 2, tier 3 = 5, tier 4 = 10, tier 5 = 20, tier 6 = 50, tier 7 = 100, tier 10 = 1000). Os tiers 1, 8 e 9 não aparecem em nenhum texto. **Afeta** companions, Possess, Substitute e qualquer conta que dependa do preço de um tier.
- `lures/space-truckin`: a tabela de limites de vítimas ativas por tier da divindade é uma imagem. Nome, custo (100) e requisitos foram conferidos no texto; só o limite por tier ficou de fora.
- Tabela de Força do PvP (níveis 1 a 9): também é uma imagem e fica fora dos dados. Nenhuma opção de `dados/` depende dela, então não há linha `verificado: false`; as Eye Orbs só têm o preço e a descrição.

**Para a pessoa dona do projeto:** abrir o documento, ler as três imagens e passar os números. Ao confirmar, troque `verificado` para `true` (em `economia.json`, no bloco `precoPorTier`, ou na opção), corrija os valores e apague a linha daqui.

## 2. Opções do documento que não viraram opção em `dados/`

- `sem-opcao: origens.md#Power Swap` e `sem-opcao: origens.md#Memoria`: o documento trata os dois como ajustes da origem, mas os lista em Other Perks. No Builder eles são compras comuns, em `outros-perks/power-swap` e `outros-perks/memoria`. Se ficassem em `origens/`, a interface os mostraria como se fossem uma origem e trocariam a origem escolhida.
- `bindings/harmonic-union` foi retirada: no documento só existe o título, com a nota de que a seção está em construção, e nenhuma outra opção a cita.
- Em `servicos-e-missoes` só entram as quatro Eye Orbs. Salário, Help Desk, Clientele, Loans, Debt, Refund e Missions são regras do jogo, não compras. O empréstimo e o reembolso já estão em `economia.json`; recompensa de missão é variável e missões não existem na criação do contractor.
- Arcane Links, Ressonância e suas melhorias, Art of Binding (com Shackles, Chastity, Leash, Blindfold, Bonds e Enslavement, que se pagam em Ressonância e não em créditos), Procs, Blackmail e Compliance, Authors Note, Defense Rebates e The Outer Shell são só regra. Não ganharam opção.
- Companions e o catálogo de personagens ficam fora: o documento guarda a lista numa planilha, e o app pede nome, obra e tier de cada companion.

## 3. Efeitos de Intensity que não mudam a conta

A cláusula de cada opção de Intensity entra na soma, mas o app não aplica os efeitos abaixo (ficam só no `resumo` da opção):

- Captura, venda e pagamento: `intensity/100-0`, `intensity/75-25`, `intensity/50-50`, `intensity/25-75`, `intensity/0-100`, `intensity/demoted`, `intensity/no-skill-framework`.
- Empréstimo e juros: `intensity/cash-still-rules`, `intensity/interest-enforced`. Nenhuma opção desta versão do documento soma `budget` ou `limiteEmprestimo` em número.
- DR e budget inicial: `intensity/wild-shot`, `intensity/spray-and-pray`, `intensity/interesting-times`, `intensity/calming-up`.
- Preço de outras opções: `intensity/couples-account-cooperative`, `intensity/a-la-carte`, `intensity/expiring-warranty`, `intensity/brick-and-mortar`, `intensity/no-skill-framework`.
- Limites de compra: `intensity/one-each`, `intensity/only-one-heritage`, `intensity/ancestral-diversity`, `intensity/open-heritages`, `intensity/manual-connection`, `intensity/submissive-and-yeetable`, `intensity/snail-mail`, `intensity/defense-rebates-disabled`.
- Funcionamento do jogo, sem bloquear compra: `intensity/resistance-only`, `intensity/no-defenses`, `intensity/only-followers`, `intensity/no-loyalty`, `intensity/intact-weaknesses`, `intensity/hardcore`, `intensity/hustle`, `intensity/peril`, prazos de entrega, regras de exploração e missões, co-op e `intensity/nah-id-win` (PvP).
- Danger Rating X: Intensity base 6, conta conjunta obrigatória e verbas perdidas com Heritages Banned, No Bindings, Nomad e Lawless. Não está modelado.

O que o motor **aplica**: a soma das cláusulas, a Intensity efetiva, o budget e o limite de empréstimo por Intensity e DR, o bloqueio de categoria de `intensity/no-bindings` (com exceção do Empty Hand) e `intensity/heritages-banned`, os requisitos de `intensity/calming-up`, e as exclusões entre opções de Intensity e entre elas e as compras (Nomad, Lawless, Twilight Zone, No Templates, Disabled Warranty, What You See Is What You Get, Power Swap Banned, Not in Kansas Anymore).

## 4. Regras que o esquema não escreve

Ver `docs/regras-especiais.md` para `defense-rebates`, `desconto-por-arquetipo`, `custo-textual` e `diferenca-de-tier`. Além delas, não há campo no esquema para:

- **Moeda mista dentro de uma opção.** Sanctuary e Stronghold custam 15 créditos, ou 1 IMG para quem já tem o outro caminho; a 13ª compra de Pocket Star II custa 1 IMG e devolve 900 créditos. Os dados guardam o caminho em créditos; o IMG fica fora do saldo nesses casos.
- **Bônus de tier dos perks de heritage** (Dragon Heart 6, Scaleborn 7, Elder Dragon 8 e outros): só no `resumo`.
- **Heritage não reembolsável** e **expansão de lure reembolsada junto com o lure**: só no `resumo`.
- **Brinde por escolha em Prismatic Shroud e Elemental Inkarnation**: o documento só fala de brindes por elemento no Elemental Shroud.
- **Nomad e Lawless dispensam o requisito de Pocket Apartment** de All Roads Lead to Home, Rainbow Bridge e Sanctuary "com algum Dominion". Os dados continuam exigindo Pocket Apartment nessas opções.
- **Substitute e Universal Calibration I**: o requisito só vale para alvo de gênero trocado; fica no `resumo`.

## 5. Requisitos que o Builder não verifica (`declarado`)

O app pergunta se a pessoa cumpre, e o texto exportado leva um `[AVISO]` com a frase abaixo:

- `lures/arlo`: ter no séquito alguém de aparência mais nova que o contractor.
- `lures/space-truckin`: ter um Ride terrestre com Pattern no Shipwright; ter no séquito uma divindade ou alguém capaz de ressurreição de verdade; ter o perk In Another World Once Again, que o documento só cita pelo nome.
- `outros-perks/blank-slate` e `sanctuaries-e-strongholds/rainbow-bridge`: ter algum Dominion (Not in Kansas Anymore dispensa We Will Meet Again).
- `outros-perks/yoink`: o subject comprado é do mundo de partida.
- `outros-perks/bifurcation`: a pessoa tem várias formas distintas, no máximo uma humanoide.
- `outros-perks/template-stacking-ii`: a cópia de Template Stacking I é do mesmo template.

## 6. Escolhas de leitura onde o documento é ambíguo

Cada uma pode ser desfeita mudando um campo do JSON da opção.

- **Raízes de heritage.** O documento diz que as raízes são exclusivas e que só Ancestral Diversity libera mais de uma; não diz se Open Heritages também libera. Não há `grupoExclusivo` nem `exclusoes` nas raízes.
- **Mother, Mighty** (Talent Sharing de todos os Talents da heritage): pode ser a Lunarian inteira (até 11) ou os 3 do perk. Os dados usam 3.
- **Sacrificed Sheep**: Talent Sharing (Blessed) entrou como 1 cópia, sem escolha.
- **Need Faith, Will Travel**: o texto do documento está cortado; foi lido como Sacrificed Sheep, Please Respond.
- **Desconto por arquétipo em capstone de IMG**: não aplicado, o documento não diz.
- **Space Truckin'**: "In Another World Once Again…" foi lido como alternativa ao requisito inteiro; o documento não diz se substitui uma ou as duas exigências.
- **Dirty Minds**: a pessoa precisa escolher 20 ou 30; sem a escolha o motor cobra 0.
- **Empty Hand** ficou no grupo exclusivo das bindings ativas, porque o documento a define como ausência de binding.
- **Elemental Inkarnation**: máximo de 12 (um elemento a mais por compra) e **Prismatic Shroud** máximo de 11 ("até ter todos"). Ambos são dedução.
- **Grand Tapestry**: "Talent Sharing para cada Talent, mais Psychic Talent" é ambíguo (Psychic Talent de graça, ou só o Sharing dele). Nenhum brinde foi escrito.
- **Canvas** foi lido como exigindo Empty Hand, Shroud, Toolbox ou Tempest (a árvore Mystic Tattoo conta como Seal). Só Mystic Tattoo exige Seal; as outras raízes não têm requisito.
- **Stronghold Themes**: "Basic Talents or Defenses" deu toda a lista do elemento, inclusive Everlasting Tune-Up no Burial. **Additional Themes** só dá os brindes do elemento, sem os 3 fixos, e não tem limite de compras.
- **Template Stacking I**: o limite de 10 cópias na mesma pessoa é dos dados; o documento não fixa. **Bifurcation** e **Paper Trail** têm `max` sem limite; o total de dez compras do documento é só conferência.
- **Pocket Star II**: o documento se contradiz sobre o raio ("dobra" no começo e "x8" no fim). Foram usados os preços; o raio está só no `resumo`.
- **Nomad e Lawless**: o Stronghold ficou fora das exclusões, porque "but not Stronghold" é ambíguo. Lawless exclui só o Sanctuary.
- **Team Play**: as duas opções cooperativas são compatíveis entre si; só `intensity/me-and-my-girlfriend-s-pve` exclui as outras duas. Para a PvE poder combinar com as outras, tire as `exclusoes` dela.
- **Yeet, Yoink e Slightly Used** não combinam "na mesma compra", mas o texto não impede usar um em cada subject. Não há bloqueio.
- **Apportation** cita uma "versão de Tempest Jewelry" que não está no Requires. O Requires foi mantido como está.
- **Grafias do documento**: "ITS ALIVE", "Machines In Disguise", "Beasts Unburdened" e "Sacrificed Sheep…" (cortado). Os nomes das opções seguem o cabeçalho de cada seção.

## 7. Como o app trata os duplicados de brinde

Quando uma compra dá de graça um perk que a pessoa **já comprou**, o motor devolve o valor do perk como desconto na compra que deu o brinde, como diz o documento. Um perk repetível (os estágios de uma Defense, por exemplo) que só veio de brindes recebe a cópia grátis normalmente, até o limite de repetição.
