# RH Macaw

Micro SaaS de gestão de pessoas e folha de pagamento, construído para a
operação de um restaurante: comissões rateadas e pagas **por semana**, folha
mensal que absorve essas comissões, e o relatório final virando **arquivo de
remessa bancária** sem passo manual no meio.

Tudo o que hoje mora em planilhas separadas — cadastro, faltas, férias, 13º,
admissão, demissão e pagamento — fica num só sistema, com o mesmo motor de
cálculo e a mesma trilha de auditoria.

## O problema que ele resolve

Na planilha de origem, a relação que sustenta o mês é esta:

```
VALOR A TRANSFERIR = SALÁRIO LÍQUIDO − COMISSÕES
```

As comissões são adiantadas toda semana. No fim do mês elas já estão no bolso
do colaborador, então o banco só transfere a diferença. O sistema trata isso
como regra de primeira classe: o período semanal é fechado, pago e
**abatido** do líquido da folha — e quando o adiantamento supera o líquido, o
valor a transferir fica negativo e o sistema avisa em vez de gerar um
pagamento errado.

## Módulos

| Módulo | O que faz |
|---|---|
| **Cadastro** | Colaborador completo: contrato (CLT, intermitente, PJ, sócio, estágio), função, centro de custo, benefícios, dependentes, dados bancários e chave PIX validada por tipo |
| **Comissões semanais** | Semana ISO, valor arrecadado, retenção da casa, rateio por pontos / horas / igualitário / manual, fechamento e pagamento |
| **Folha mensal** | INSS progressivo por faixa, IRRF com escolha automática entre deduções legais e desconto simplificado, faltas com perda de DSR, VT limitado a 6%, horas extras, adicional noturno, insalubridade e periculosidade |
| **Faltas** | Lançamento por tipo (falta, justificada, atestado, atraso, suspensão, afastamento INSS), desconto e DSR calculados |
| **Férias** | Período aquisitivo, dias de direito conforme faltas (art. 130), abono pecuniário, 1/3 constitucional, adiantamento do 13º e alerta de período concessivo vencendo |
| **Décimo terceiro** | Avos por meses com 15+ dias, média de variáveis, 1ª e 2ª parcela com tributação exclusiva na fonte |
| **Admissão e demissão** | TRCT com matriz de verbas por motivo de desligamento, aviso prévio proporcional, multa do FGTS e prazo legal de pagamento |
| **Remessa bancária** | CNAB 240 FEBRABAN (10 bancos), lote PIX e CSV gerencial, com prévia e validação antes de gerar |
| **Relatórios** | Folha analítica, custo por centro de custo, comissões, absenteísmo, movimentação e provisões |

## Como rodar

```bash
npm install
cp .env.example .env
npm run seed     # cria o banco e importa os 40 colaboradores da planilha
npm run dev      # API em :3333 e interface em :5173
```

Acesso do seed: `admin@rhmacaw.com.br` / `Macaw@2025`.

```bash
npm test         # suíte completa
npm run build    # build de produção
npm run typecheck
```

## Arquitetura

```
packages/shared/   Contrato e motor de cálculo — funções puras, sem I/O
  domain/          Tipos de domínio compartilhados por API, front e testes
  payroll/         Folha, férias, 13º, rescisão, comissões, encargos
  bank/            CNAB 240, PIX, CSV
  util/            Dinheiro, datas ISO, documentos brasileiros

server/            API REST Express + SQLite, multi-tenant
web/               SPA React + Vite
docs/              Contrato da API e notas de domínio
```

O motor de cálculo é **puro**: mesma entrada, mesmo centavo. É isso que permite
reprocessar uma competência antiga sem ela divergir do que já foi pago — as
tabelas de INSS e IRRF são versionadas por data de vigência, e o cálculo
sempre usa a tabela vigente na competência processada, não a de hoje.

## Decisões que valem explicação

**Arredondamento.** Todo valor financeiro sai por `arredondar()`, que corrige a
representação binária antes de arredondar. Sem isso, `1.005` vira `1.00` e a
remessa fecha com centavos de diferença do total declarado.

**Sobra do rateio.** Dividir R$ 10.000 entre 3 pessoas gera dízima. A diferença
de centavos é alocada ao maior beneficiário, para que a soma das linhas bata
exatamente com o valor distribuído — o banco rejeita o lote se não bater.

**Favorecido inválido não derruba o lote.** Um CPF faltando faria o banco
recusar o arquivo inteiro. A geração valida antes, isola o problema em
`inconsistencias` e paga os demais.

**Imutabilidade.** Folha `PAGA` e período `PAGO` não mudam. Faltas e férias não
podem ser lançadas em competência já fechada. O que já virou dinheiro na conta
de alguém não é reescrito — corrige-se na competência seguinte.

## Base legal implementada

INSS progressivo (EC 103/2019) · IRRF com desconto simplificado (Lei 14.848/2024)
· DSR sobre faltas (Lei 605/49) · Férias (arts. 129–145 da CLT) · Décimo
terceiro (Lei 4.090/62) · Rescisão (arts. 477–487 da CLT) · Aviso prévio
proporcional (Lei 12.506/2011) · Vale-transporte (Lei 7.418/85) · CNAB 240
(FEBRABAN).

As tabelas de 2024 e 2025 estão em `packages/shared/src/payroll/tabelas.ts`.
Para uma nova vigência, acrescente uma entrada ao array — nada mais muda.

## Aviso

O sistema calcula conforme a legislação referida acima, mas **não substitui a
conferência do contador** antes do fechamento e do envio ao banco. Convenções
coletivas da categoria (piso, adicionais, gratificações) não estão embutidas e
devem ser lançadas como eventos avulsos ou configuradas no cadastro.
