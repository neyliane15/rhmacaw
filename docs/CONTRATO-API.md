# Contrato da API — RH Macaw

Base: `/api`. Todas as respostas são JSON. Autenticação por `Authorization: Bearer <token>`
(JWT), exceto `POST /api/auth/login`.

Tipos referenciados são os exportados por `@rhmacaw/shared` (`packages/shared/src/domain/tipos.ts`).
Erros seguem `RespostaErro` com HTTP 400 (validação), 401, 403, 404, 409 (conflito de estado) e 422.

Todo recurso é isolado por `tenantId`, extraído do token — nunca do corpo ou da query.

## Auth
| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/auth/login` | `{ email, senha }` | `SessaoUsuario` |
| GET | `/auth/me` | — | `SessaoUsuario` |
| POST | `/auth/usuarios` | `{ nome, email, senha, papel }` | `Usuario` (ADMIN) |
| GET | `/auth/usuarios` | — | `Usuario[]` (ADMIN) |

## Colaboradores
| Método | Rota | Observação |
|---|---|---|
| GET | `/colaboradores` | query: `busca`, `situacao`, `centroCusto`, `tipoContrato`, `pagina`, `porPagina` → `Paginado<Colaborador>` |
| GET | `/colaboradores/:id` | `Colaborador` |
| POST | `/colaboradores` | `ColaboradorEntrada` → `Colaborador`. Matrícula é gerada se omitida. |
| PUT | `/colaboradores/:id` | `ColaboradorEntrada` parcial |
| POST | `/colaboradores/:id/demitir` | `{ dataAviso, dataDesligamento, motivo, tipoAviso, ... }` → `Rescisao` calculada (não grava demissão até confirmar) |
| DELETE | `/colaboradores/:id` | Só permitido sem folha vinculada; caso contrário 409. |
| GET | `/colaboradores/:id/historico` | Linha do tempo: admissão, faltas, férias, folhas, rescisão |

## Faltas
| Método | Rota |
|---|---|
| GET | `/faltas` — query `colaboradorId`, `competencia`, `tipo`, `de`, `ate` |
| POST | `/faltas` — `FaltaEntrada` |
| PUT | `/faltas/:id` |
| DELETE | `/faltas/:id` |
| GET | `/faltas/resumo?competencia=YYYY-MM` — por colaborador: dias, DSR, valor estimado |

## Férias
| Método | Rota |
|---|---|
| GET | `/ferias` — query `colaboradorId`, `status`, `ano` |
| GET | `/ferias/saldos` — `SaldoFerias[]` de todos os ativos, ordenado por vencimento |
| POST | `/ferias/simular` — `FeriasEntrada` → `ResultadoFerias` sem gravar |
| POST | `/ferias` — `FeriasEntrada` → `Ferias` (grava programada) |
| PUT | `/ferias/:id` / DELETE | Bloqueia alteração de período já `CONCLUIDA` (409) |

## Comissões semanais
| Método | Rota |
|---|---|
| GET | `/comissoes/periodos` — query `ano`, `status`, `competencia` |
| GET | `/comissoes/periodos/:id` — `PeriodoComissaoDetalhado` |
| POST | `/comissoes/periodos` — `{ ano, semana, valorArrecadado, percentualRetencao, criterioRateio }`; datas derivadas da semana ISO |
| POST | `/comissoes/periodos/:id/ratear` — recalcula lançamentos a partir dos participantes ativos |
| PUT | `/comissoes/periodos/:id/lancamentos` — `{ lancamentos: [{ colaboradorId, pontos, horas, ajuste, valorManual? }] }` |
| POST | `/comissoes/periodos/:id/fechar` — `ABERTO` → `FECHADO` |
| POST | `/comissoes/periodos/:id/reabrir` — `FECHADO` → `ABERTO`; 409 se já `PAGO` |
| POST | `/comissoes/periodos/:id/remessa` — `{ layout, bancoCodigo, dataPagamento }` → `Remessa`; marca período como `PAGO` |

## Folha de pagamento
| Método | Rota |
|---|---|
| GET | `/folhas` — query `competencia`, `tipo`, `status` |
| GET | `/folhas/:id` — `FolhaDetalhada` |
| POST | `/folhas/processar` — `{ competencia, tipo, dataPagamento, centroCusto? }` → `FolhaDetalhada` em `RASCUNHO`. Reprocessar competência em rascunho substitui os itens. |
| GET | `/folhas/:id/itens/:colaboradorId` — contracheque com `Verba[]` |
| PUT | `/folhas/:id/itens/:colaboradorId` — ajusta eventos avulsos e recalcula só aquele item |
| POST | `/folhas/:id/fechar` — `RASCUNHO` → `FECHADA`; 409 se houver item com alerta crítico não reconhecido |
| POST | `/folhas/:id/reabrir` — `FECHADA` → `RASCUNHO`; 409 se `PAGA` |
| POST | `/folhas/:id/remessa` — **o caminho relatório → banco**: `{ layout, bancoCodigo, dataPagamento }` → `Remessa` e marca a folha `PAGA` |
| GET | `/folhas/:id/exportar?formato=csv\|json` | 

## Décimo terceiro
| Método | Rota |
|---|---|
| GET | `/decimo-terceiro?ano=YYYY` — `DecimoTerceiro[]` calculado para os ativos |
| POST | `/decimo-terceiro/processar` — `{ ano, parcela: 1\|2, dataPagamento }` → `FolhaDetalhada` do tipo `DECIMO_TERCEIRO_1\|2` |

## Rescisões
| Método | Rota |
|---|---|
| GET | `/rescisoes` |
| GET | `/rescisoes/:id` |
| POST | `/rescisoes/simular` — `EntradaRescisao` → `ResultadoRescisao` sem gravar |
| POST | `/rescisoes` — grava, muda colaborador para `DEMITIDO` e preenche `demissao` |
| POST | `/rescisoes/:id/remessa` — gera pagamento do TRCT |

## Banco / remessas
| Método | Rota |
|---|---|
| GET | `/banco/remessas` — query `origem`, `status` |
| GET | `/banco/remessas/:id` — `Remessa` com o conteúdo |
| GET | `/banco/remessas/:id/arquivo` — download (`text/plain`, `Content-Disposition: attachment`) |
| POST | `/banco/remessas/:id/status` — `{ status }` — GERADA → ENVIADA → CONFIRMADA / REJEITADA |
| GET | `/banco/bancos` — `BancoSuportado[]` |
| GET | `/banco/conta` / PUT | `ContaPagadora` da empresa |
| POST | `/banco/previa` — `{ origem, origemId, layout, bancoCodigo, dataPagamento }` → prévia com favorecidos válidos e inconsistências, **sem gravar** |

## Relatórios e dashboard
| Método | Rota |
|---|---|
| GET | `/dashboard?competencia=YYYY-MM` — `ResumoDashboard` |
| GET | `/relatorios/folha-analitica?competencia=` |
| GET | `/relatorios/custo-centro-custo?competencia=` |
| GET | `/relatorios/comissoes?ano=&competencia=` |
| GET | `/relatorios/absenteismo?competencia=` |
| GET | `/relatorios/movimentacao?ano=` — admissões e demissões por mês |
| GET | `/relatorios/provisoes?competencia=` — provisão de férias, 13º e encargos |

## Regras de estado que a API deve garantir
1. Período de comissão `PAGO` é imutável; só reabre quem tem papel ADMIN e apenas se a remessa estiver `CANCELADA`.
2. Folha `PAGA` é imutável.
3. Gerar remessa exige folha `FECHADA` (ou período `FECHADO`).
4. Uma folha só pode ter uma remessa ativa (não cancelada) por vez — 409 na segunda.
5. `valorTransferir <= 0` nunca entra na remessa; vai para `inconsistencias`.
6. Faltas/férias não podem ser lançadas em competência com folha `FECHADA` ou `PAGA` — 409.
