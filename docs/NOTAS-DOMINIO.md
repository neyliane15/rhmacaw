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

`MANOEL VICTOR` fecha agosto com `−205,78`: recebeu R$ 205,78 de comissão na
semana e o líquido da folha não cobriu (faltas, afastamento ou saída no meio do
mês).

No sistema: o valor negativo **não** vira pagamento nem some da tela. O item
carrega um alerta, a folha não fecha sem reconhecimento, e o favorecido entra
em `inconsistencias` da remessa em vez do arquivo. O acerto é lançado como
evento avulso na competência seguinte.

## 4. Três centros de custo, três regimes

| Centro | Pessoas | Regime |
|---|---|---|
| FOLHA TOKITO | 31 | CLT da operação do salão e cozinha |
| FOLHA CENTRAL | 4 | CLT da cozinha central |
| ADMINISTRATIVO | 5 | Sócios (pró-labore), PJ e estagiário |

As 5 linhas do administrativo não têm coluna de líquido preenchida: não passam
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
