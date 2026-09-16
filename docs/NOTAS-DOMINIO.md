# Notas de domínio — o que a planilha de origem ensinou

Observações extraídas da folha de agosto/2025 do cliente, e como o sistema as
absorve. Cada item aqui é uma regra real da operação, não uma suposição.

## 1. Comissão é adiantamento, não provento do mês

Em 35 das 40 linhas a relação é exata:

```
VALOR A TRANSFERIR = SALÁRIO LÍQUIDO − COMISSÕES
```

A comissão entra no bruto (e portanto na base de INSS, IRRF e FGTS), mas já foi
paga semanalmente. O banco transfere só a diferença.

No sistema: `ItemFolha.comissoesAdiantadas` é abatido do líquido para formar
`valorTransferir`, e só `valorTransferir` vai para a remessa.

## 2. Comissão nem sempre é adiantada

`JANA LACERDA` tem `transferir = líquido + comissões` — a comissão dela saiu
**junto** com a folha, não antes.

No sistema: `EntradaFolha` separa `comissoesAdiantadas` (abate) de
`comissoesAPagar` (soma no bruto e permanece no líquido a transferir). O
período de comissão que não foi marcado como `PAGO` até o fechamento da folha
cai automaticamente no segundo caso.

## 3. Adiantamento pode superar o líquido

Na planilha de origem `MANOEL VICTOR` fecha agosto com `−205,78`: recebeu
R$ 205,78 de comissão na semana e o líquido da folha ficou zerado.

O seed **não** reproduz esse número. A planilha mostra o líquido em zero mas não
diz por quê, e inventar um motivo — falta, afastamento, saída no meio do mês —
seria fabricar dado do cliente. No seed ele entra como ativo normal e fecha
positivo. O comportamento em si, o que o sistema faz quando o adiantamento supera
o líquido, está coberto por teste próprio com uma folha construída para o caso,
em `server/src/__tests__/fluxoFolha.test.ts`.

No sistema: o valor negativo **não** vira pagamento nem some da tela. O item
carrega um alerta, a folha não fecha sem reconhecimento, e o favorecido entra
em `inconsistencias` da remessa em vez do arquivo. O acerto é lançado como
evento avulso na competência seguinte.

## 4. Três centros de custo, três regimes

| Centro | Pessoas | Regime |
|---|---|---|
| FOLHA TOKITO | 31 | CLT da operação do salão e cozinha |
| FOLHA CENTRAL | 5 | CLT da cozinha central |
| ADMINISTRATIVO | 4 | Sócios (pró-labore), PJ e estagiário |

As 4 linhas do administrativo não têm coluna de líquido preenchida: não passam
pelo cálculo CLT. Pró-labore tem INSS próprio (11% sobre o teto, sem faixas de
empregado) e não tem FGTS, férias ou 13º; PJ é nota fiscal; estagiário (Lei
11.788/2008) tem bolsa sem encargos trabalhistas.

No sistema: `TipoContrato` distingue `CLT`, `INTERMITENTE`, `PJ`, `SOCIO` e
`ESTAGIO`, e o motor aplica só o que cabe a cada um. O relatório de custo por
centro de custo continua somando todos, porque para o caixa o custo é um só.

## 5. Intermitente é pago por hora

`ALINE PORTO SENRA`: salário-base 8,94 e 105,5 horas no mês. Não é salário
mensal — é valor-hora (Lei 13.467/2017, art. 452-A).

No sistema: `salarioHora` + `horasTrabalhadas` na entrada da folha; o cálculo
de dias/30 avos não se aplica a esse contrato.

## 6. Colaborador afastado ou em processo continua no cadastro

`FABIO EMANOEL (AFASTADO)`, `MARIA EDUARDA (PROCESSO)`,
`MATHEUS BARBOSA (PROCESSO)` aparecem com tudo zerado.

No sistema: `Situacao` guarda `AFASTADO` e `PROCESSO`. Eles continuam no
cadastro e nos relatórios de headcount, entram na folha com valores zerados e
**não** entram na remessa — mas o vínculo segue existindo, que é o que importa
para férias, 13º e uma eventual rescisão futura.

## 7. Vale-transporte é opcional por pessoa

A coluna S/N da planilha vira `valeTransporte: boolean`. O desconto é o menor
entre 6% do salário e o custo real do benefício (Lei 7.418/85, art. 4º,
parágrafo único) — a planilha usava sempre os 6%, o sistema aceita os dois.

## 8. Faltas aparecem em dias inteiros

Só quatro pessoas tinham falta em agosto (1, 1, 1 e 4 dias). O desconto na
planilha é linear, mas a lei manda perder também o descanso semanal remunerado
da semana em que houve falta injustificada.

No sistema: `apurarFaltas` agrupa as faltas por semana ISO e desconta um DSR
por semana atingida — o que a planilha não fazia. A diferença aparece como
`descontoDSR`, em linha própria do contracheque, para ficar conferível.

## 9. Cada tipo de contrato tem um regime de encargos diferente

A primeira versão do motor rodava os 40 colaboradores pelo cálculo celetista,
descontando INSS progressivo e IRRF até de PJ e estagiário. Está corrigido:
`REGIMES_CONTRATO` (em `payroll/folha.ts`) declara o que se aplica a cada
vínculo.

| Contrato | INSS | IRRF | FGTS | VT 6% | DSR | 13º/Férias |
|---|---|---|---|---|---|---|
| CLT | progressivo | sim | sim | sim | sim | sim |
| Intermitente | progressivo | sim | sim | sim | **não** | sim |
| Sócio (pró-labore) | **11% até o teto** | sim | não | não | não | não |
| Estágio | **nenhum** | sim | não | não | não | não |
| PJ | **nenhum** | **não** | não | não | não | não |

O intermitente não perde DSR porque não tem jornada fixa — não há semana de
referência da qual descontar o repouso.

Depois da correção, **ARTHUR** (estágio, R$ 938,00) e **GABRIEL** (PJ,
R$ 5.000,00) passaram a bater exatamente com a planilha.

## 10. Divergências que restam — e que são decisão do contador

Três linhas ainda não batem com a planilha, e nenhuma é erro de cálculo:

**Sócios com "comissão".** `GABRIEL HAURET` (R$ 10.000 de pró-labore +
R$ 10.000 lançados como comissão) e `PEDRO LANNES` (R$ 7.298,20 +
R$ 1.512,06). O sistema trata comissão como remuneração tributável, então
retém INSS e IRRF. Se esses valores forem **distribuição de lucros**, são
isentos de IR e de INSS (art. 10 da Lei 9.249/95) e devem ser lançados como
evento avulso com `baseINSS: false` e `baseIRRF: false` — a folha já suporta
isso. É uma decisão de classificação contábil, não de software, e por isso o
sistema não escolhe sozinho.

**ALINE PORTO SENRA** (intermitente): a planilha mostra líquido de
R$ 1.485,46 para 105,5 horas a R$ 8,94 — R$ 943,17 de horas mais R$ 164,86 de
comissão não chegam lá. Há cerca de R$ 517 de proventos que não aparecem em
nenhuma coluna do arquivo de origem. Sem esse dado, o sistema calcula o que
consegue comprovar.

Nos dois casos a postura é a mesma: o sistema não inventa o número que falta
nem força o resultado a imitar a planilha. Ele calcula o que os dados
sustentam e deixa a diferença visível.

## 11. Limitação conhecida: o controle de férias é de um período só

O sistema deriva o período aquisitivo da data de admissão e acompanha **um**
período em aberto por vez. Quem tem três períodos vencidos aparece com 30 dias
de saldo, não 90, e o sistema nunca sinaliza férias em dobro (art. 137 da CLT).

Isso importa neste cliente em particular: há gente com cinco e seis anos de casa
e nenhum registro de férias. O passivo real é maior do que o painel mostra, e o
TRCT de um desligamento desses sai a menor.

**Enquanto isso não for modelado**, a rescisão aceita o campo
`diasFeriasVencidas` para o RH informar o número correto depois de conferir a
ficha — o valor informado prevalece sobre o que o sistema calcula.

**O conserto de verdade** é modelar período aquisitivo como entidade própria,
com os dias gozados vinculados a cada período, em vez de derivá-los da admissão.
É a próxima peça de trabalho relevante do sistema, e está registrada aqui para
não se perder.

## 12. Por que 289 testes verdes não bastaram

A auditoria final encontrou duas verbas erradas convivendo com uma suíte
inteiramente verde:

- 13º, férias e provisões eram calculados para sócio, PJ e estagiário. A flag
  `temDecimoTerceiroEFerias` existia em `REGIMES_CONTRATO` e **nenhuma linha de
  código de produção a lia**. Eram R$ 11.358,49 na 1ª parcela do 13º — 24% da
  folha — para quem não tem direito. Pagar 13º a um PJ, além do prejuízo, é
  prova clássica de vínculo empregatício numa reclamatória.
- Férias vencidas sumiam do TRCT de quem já tinha gozado férias alguma vez,
  porque os dias gozados eram somados de todos os períodos e comparados com o
  direito de um só.

O que os dois têm em comum: o teste que os "cobria" era **tautológico** —
afirmava que a constante contém o que a constante contém, sem nunca executar o
caminho que usa a constante. Dá aparência de cobertura sobre código morto.

A lição ficou: contagem de teste não é evidência de correção. Ao revisar esta
suíte, desconfie de todo teste que não executa o código de produção que diz
cobrir.
