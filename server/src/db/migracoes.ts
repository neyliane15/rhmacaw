/**
 * Schema do banco em SQL puro e idempotente.
 *
 * Cada migracao roda uma unica vez (registrada em `migracoes`), mas todas sao
 * escritas com `IF NOT EXISTS` para que um banco criado por uma versao anterior
 * do arquivo nao quebre ao reaplicar.
 *
 * Convencoes:
 *  - dinheiro em REAL (o motor de calculo ja arredonda tudo em centavos);
 *  - datas em TEXT ISO (`YYYY-MM-DD`) e carimbos em ISO completo;
 *  - booleanos em INTEGER 0/1;
 *  - estruturas ricas (verbas, alertas, inconsistencias) em TEXT com JSON.
 */
import type { Banco } from './conexao.js';

interface Migracao {
  nome: string;
  sql: string;
}

const MIGRACOES: Migracao[] = [
  {
    nome: '001-estrutura-inicial',
    sql: `
CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  cnpj        TEXT NOT NULL,
  cnae        TEXT,
  endereco    TEXT,
  cidade      TEXT,
  uf          TEXT,
  cep         TEXT,
  criado_em   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tenants_cnpj ON tenants (cnpj);

CREATE TABLE IF NOT EXISTS usuarios (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  email         TEXT NOT NULL,
  senha_hash    TEXT NOT NULL,
  papel         TEXT NOT NULL,
  ativo         INTEGER NOT NULL DEFAULT 1,
  ultimo_acesso TEXT,
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_usuarios_tenant ON usuarios (tenant_id);
-- O login e global (nao recebe tenant), entao o e-mail precisa ser unico no sistema.
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email ON usuarios (email);

CREATE TABLE IF NOT EXISTS colaboradores (
  id                             TEXT PRIMARY KEY,
  tenant_id                      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matricula                      TEXT NOT NULL,
  nome                           TEXT NOT NULL,
  cpf                            TEXT NOT NULL,
  pis                            TEXT,
  data_nascimento                TEXT,
  funcao                         TEXT NOT NULL,
  setor                          TEXT,
  centro_custo                   TEXT NOT NULL,
  tipo_contrato                  TEXT NOT NULL,
  situacao                       TEXT NOT NULL,
  salario_base                   REAL NOT NULL DEFAULT 0,
  salario_hora                   REAL,
  carga_horaria_mensal           REAL NOT NULL DEFAULT 220,
  vale_transporte                INTEGER NOT NULL DEFAULT 0,
  vale_transporte_valor_diario   REAL,
  pontos_comissao                REAL NOT NULL DEFAULT 0,
  dependentes_irrf               INTEGER NOT NULL DEFAULT 0,
  dependentes_salario_familia    INTEGER NOT NULL DEFAULT 0,
  insalubridade_percentual       REAL,
  periculosidade                 INTEGER NOT NULL DEFAULT 0,
  admissao                       TEXT NOT NULL,
  demissao                       TEXT,
  observacoes                    TEXT,
  banco_codigo                   TEXT,
  banco_nome                     TEXT,
  agencia                        TEXT,
  agencia_digito                 TEXT,
  conta                          TEXT,
  conta_digito                   TEXT,
  tipo_conta                     TEXT,
  tipo_pix                       TEXT,
  chave_pix                      TEXT,
  criado_em                      TEXT NOT NULL,
  atualizado_em                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_colaboradores_tenant ON colaboradores (tenant_id);
CREATE INDEX IF NOT EXISTS ix_colaboradores_situacao ON colaboradores (tenant_id, situacao);
CREATE INDEX IF NOT EXISTS ix_colaboradores_centro ON colaboradores (tenant_id, centro_custo);
CREATE UNIQUE INDEX IF NOT EXISTS ux_colaboradores_matricula ON colaboradores (tenant_id, matricula);
CREATE UNIQUE INDEX IF NOT EXISTS ux_colaboradores_cpf ON colaboradores (tenant_id, cpf);

CREATE TABLE IF NOT EXISTS faltas (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  data           TEXT NOT NULL,
  tipo           TEXT NOT NULL,
  horas          REAL,
  justificativa  TEXT,
  documento      TEXT,
  registrado_por TEXT,
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_faltas_tenant ON faltas (tenant_id);
CREATE INDEX IF NOT EXISTS ix_faltas_colaborador ON faltas (tenant_id, colaborador_id, data);
CREATE INDEX IF NOT EXISTS ix_faltas_data ON faltas (tenant_id, data);

CREATE TABLE IF NOT EXISTS ferias (
  id                          TEXT PRIMARY KEY,
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  colaborador_id              TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  periodo_aquisitivo_inicio   TEXT NOT NULL,
  periodo_aquisitivo_fim      TEXT NOT NULL,
  inicio_gozo                 TEXT NOT NULL,
  fim_gozo                    TEXT NOT NULL,
  dias_gozo                   INTEGER NOT NULL,
  dias_abono                  INTEGER NOT NULL DEFAULT 0,
  adiantar_decimo_terceiro    INTEGER NOT NULL DEFAULT 0,
  status                      TEXT NOT NULL,
  valor_ferias                REAL NOT NULL DEFAULT 0,
  valor_terco                 REAL NOT NULL DEFAULT 0,
  valor_abono                 REAL NOT NULL DEFAULT 0,
  valor_terco_abono           REAL NOT NULL DEFAULT 0,
  valor_adiantamento_decimo   REAL NOT NULL DEFAULT 0,
  inss                        REAL NOT NULL DEFAULT 0,
  irrf                        REAL NOT NULL DEFAULT 0,
  liquido                     REAL NOT NULL DEFAULT 0,
  competencia_pagamento       TEXT,
  observacoes                 TEXT,
  criado_em                   TEXT NOT NULL,
  atualizado_em               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ferias_tenant ON ferias (tenant_id);
CREATE INDEX IF NOT EXISTS ix_ferias_colaborador ON ferias (tenant_id, colaborador_id, inicio_gozo);

CREATE TABLE IF NOT EXISTS periodos_comissao (
  id                   TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ano                  INTEGER NOT NULL,
  semana               INTEGER NOT NULL,
  data_inicio          TEXT NOT NULL,
  data_fim             TEXT NOT NULL,
  competencia          TEXT NOT NULL,
  valor_arrecadado     REAL NOT NULL DEFAULT 0,
  percentual_retencao  REAL NOT NULL DEFAULT 0,
  criterio_rateio      TEXT NOT NULL,
  status               TEXT NOT NULL,
  data_pagamento       TEXT,
  total_distribuido    REAL NOT NULL DEFAULT 0,
  observacoes          TEXT,
  criado_em            TEXT NOT NULL,
  fechado_em           TEXT,
  pago_em              TEXT
);
CREATE INDEX IF NOT EXISTS ix_periodos_tenant ON periodos_comissao (tenant_id);
CREATE INDEX IF NOT EXISTS ix_periodos_competencia ON periodos_comissao (tenant_id, competencia);
CREATE UNIQUE INDEX IF NOT EXISTS ux_periodos_semana ON periodos_comissao (tenant_id, ano, semana);

CREATE TABLE IF NOT EXISTS lancamentos_comissao (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  periodo_id     TEXT NOT NULL REFERENCES periodos_comissao(id) ON DELETE CASCADE,
  colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  pontos         REAL NOT NULL DEFAULT 0,
  horas          REAL NOT NULL DEFAULT 0,
  ajuste         REAL NOT NULL DEFAULT 0,
  valor          REAL NOT NULL DEFAULT 0,
  observacao     TEXT
);
CREATE INDEX IF NOT EXISTS ix_lancamentos_tenant ON lancamentos_comissao (tenant_id);
CREATE INDEX IF NOT EXISTS ix_lancamentos_colaborador ON lancamentos_comissao (tenant_id, colaborador_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lancamentos_periodo_colab ON lancamentos_comissao (periodo_id, colaborador_id);

CREATE TABLE IF NOT EXISTS folhas (
  id                          TEXT PRIMARY KEY,
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  competencia                 TEXT NOT NULL,
  tipo                        TEXT NOT NULL,
  status                      TEXT NOT NULL,
  descricao                   TEXT,
  data_pagamento              TEXT NOT NULL,
  total_proventos             REAL NOT NULL DEFAULT 0,
  total_descontos             REAL NOT NULL DEFAULT 0,
  total_liquido               REAL NOT NULL DEFAULT 0,
  total_comissoes_adiantadas  REAL NOT NULL DEFAULT 0,
  total_transferir            REAL NOT NULL DEFAULT 0,
  quantidade_colaboradores    INTEGER NOT NULL DEFAULT 0,
  criado_em                   TEXT NOT NULL,
  fechado_em                  TEXT,
  pago_em                     TEXT
);
CREATE INDEX IF NOT EXISTS ix_folhas_tenant ON folhas (tenant_id);
CREATE INDEX IF NOT EXISTS ix_folhas_competencia ON folhas (tenant_id, competencia);
-- Uma folha viva por competencia/tipo; as canceladas ficam no historico.
CREATE UNIQUE INDEX IF NOT EXISTS ux_folhas_competencia_tipo
  ON folhas (tenant_id, competencia, tipo) WHERE status <> 'CANCELADA';

CREATE TABLE IF NOT EXISTS itens_folha (
  id                        TEXT PRIMARY KEY,
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  folha_id                  TEXT NOT NULL REFERENCES folhas(id) ON DELETE CASCADE,
  colaborador_id            TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  colaborador_nome          TEXT NOT NULL,
  funcao                    TEXT NOT NULL,
  centro_custo              TEXT NOT NULL,
  salario_base              REAL NOT NULL DEFAULT 0,
  dias_trabalhados          REAL NOT NULL DEFAULT 0,
  faltas_dias               REAL NOT NULL DEFAULT 0,
  faltas_horas              REAL NOT NULL DEFAULT 0,
  desconto_faltas           REAL NOT NULL DEFAULT 0,
  desconto_dsr              REAL NOT NULL DEFAULT 0,
  comissoes                 REAL NOT NULL DEFAULT 0,
  horas_extras              REAL NOT NULL DEFAULT 0,
  adicional_noturno         REAL NOT NULL DEFAULT 0,
  outros_proventos          REAL NOT NULL DEFAULT 0,
  desconto_vale_transporte  REAL NOT NULL DEFAULT 0,
  outros_descontos          REAL NOT NULL DEFAULT 0,
  base_inss                 REAL NOT NULL DEFAULT 0,
  inss                      REAL NOT NULL DEFAULT 0,
  base_irrf                 REAL NOT NULL DEFAULT 0,
  irrf                      REAL NOT NULL DEFAULT 0,
  base_fgts                 REAL NOT NULL DEFAULT 0,
  fgts                      REAL NOT NULL DEFAULT 0,
  salario_familia           REAL NOT NULL DEFAULT 0,
  total_proventos           REAL NOT NULL DEFAULT 0,
  total_descontos           REAL NOT NULL DEFAULT 0,
  salario_liquido           REAL NOT NULL DEFAULT 0,
  comissoes_adiantadas      REAL NOT NULL DEFAULT 0,
  valor_transferir          REAL NOT NULL DEFAULT 0,
  verbas                    TEXT NOT NULL DEFAULT '[]',
  alertas                   TEXT NOT NULL DEFAULT '[]',
  alertas_reconhecidos      INTEGER NOT NULL DEFAULT 0,
  -- Eventos avulsos lancados na tela do contracheque; guardados para que o
  -- reprocessamento do item nao perca o ajuste manual do RH.
  entrada_manual            TEXT,
  observacoes               TEXT
);
CREATE INDEX IF NOT EXISTS ix_itens_tenant ON itens_folha (tenant_id);
CREATE INDEX IF NOT EXISTS ix_itens_folha ON itens_folha (folha_id);
CREATE INDEX IF NOT EXISTS ix_itens_colaborador ON itens_folha (tenant_id, colaborador_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_itens_folha_colab ON itens_folha (folha_id, colaborador_id);

CREATE TABLE IF NOT EXISTS rescisoes (
  id                             TEXT PRIMARY KEY,
  tenant_id                      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  colaborador_id                 TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  colaborador_nome               TEXT NOT NULL,
  data_aviso                     TEXT NOT NULL,
  data_desligamento              TEXT NOT NULL,
  motivo                         TEXT NOT NULL,
  tipo_aviso                     TEXT NOT NULL,
  dias_aviso_previo              INTEGER NOT NULL DEFAULT 0,
  saldo_salario                  REAL NOT NULL DEFAULT 0,
  aviso_previo_indenizado        REAL NOT NULL DEFAULT 0,
  decimo_terceiro_proporcional   REAL NOT NULL DEFAULT 0,
  ferias_vencidas                REAL NOT NULL DEFAULT 0,
  terco_ferias_vencidas          REAL NOT NULL DEFAULT 0,
  ferias_proporcionais           REAL NOT NULL DEFAULT 0,
  terco_ferias_proporcionais     REAL NOT NULL DEFAULT 0,
  saldo_comissoes                REAL NOT NULL DEFAULT 0,
  outros_proventos               REAL NOT NULL DEFAULT 0,
  total_proventos                REAL NOT NULL DEFAULT 0,
  inss                           REAL NOT NULL DEFAULT 0,
  irrf                           REAL NOT NULL DEFAULT 0,
  aviso_previo_descontado        REAL NOT NULL DEFAULT 0,
  outros_descontos               REAL NOT NULL DEFAULT 0,
  total_descontos                REAL NOT NULL DEFAULT 0,
  liquido                        REAL NOT NULL DEFAULT 0,
  saldo_fgts                     REAL NOT NULL DEFAULT 0,
  multa_fgts                     REAL NOT NULL DEFAULT 0,
  habilita_seguro_desemprego     INTEGER NOT NULL DEFAULT 0,
  verbas                         TEXT NOT NULL DEFAULT '[]',
  status                         TEXT NOT NULL,
  criado_em                      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_rescisoes_tenant ON rescisoes (tenant_id);
CREATE INDEX IF NOT EXISTS ix_rescisoes_colaborador ON rescisoes (tenant_id, colaborador_id);

CREATE TABLE IF NOT EXISTS remessas (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  origem                  TEXT NOT NULL,
  origem_id               TEXT NOT NULL,
  descricao               TEXT NOT NULL,
  layout                  TEXT NOT NULL,
  banco_codigo            TEXT NOT NULL,
  data_pagamento          TEXT NOT NULL,
  numero_remessa          INTEGER NOT NULL,
  quantidade_pagamentos   INTEGER NOT NULL DEFAULT 0,
  valor_total             REAL NOT NULL DEFAULT 0,
  nome_arquivo            TEXT NOT NULL,
  conteudo                TEXT NOT NULL,
  status                  TEXT NOT NULL,
  inconsistencias         TEXT NOT NULL DEFAULT '[]',
  gerado_por              TEXT,
  criado_em               TEXT NOT NULL,
  enviado_em              TEXT,
  confirmado_em           TEXT
);
CREATE INDEX IF NOT EXISTS ix_remessas_tenant ON remessas (tenant_id);
CREATE INDEX IF NOT EXISTS ix_remessas_origem ON remessas (tenant_id, origem, origem_id);
-- Regra 4 do contrato: uma unica remessa ativa por origem.
CREATE UNIQUE INDEX IF NOT EXISTS ux_remessas_origem_ativa
  ON remessas (tenant_id, origem, origem_id) WHERE status <> 'CANCELADA';

CREATE TABLE IF NOT EXISTS conta_pagadora (
  tenant_id              TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  banco_codigo           TEXT NOT NULL,
  banco_nome             TEXT NOT NULL,
  agencia                TEXT NOT NULL,
  agencia_digito         TEXT NOT NULL DEFAULT '',
  conta                  TEXT NOT NULL,
  conta_digito           TEXT NOT NULL DEFAULT '',
  convenio               TEXT NOT NULL DEFAULT '',
  nome_empresa           TEXT NOT NULL,
  cnpj                   TEXT NOT NULL,
  -- NSA: sequencial exigido pelo banco, incrementado a cada arquivo gerado.
  proximo_numero_remessa INTEGER NOT NULL DEFAULT 1,
  atualizado_em          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auditoria (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id  TEXT,
  acao        TEXT NOT NULL,
  recurso     TEXT NOT NULL,
  recurso_id  TEXT,
  detalhes    TEXT,
  criado_em   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_auditoria_tenant ON auditoria (tenant_id, criado_em);
CREATE INDEX IF NOT EXISTS ix_auditoria_recurso ON auditoria (tenant_id, recurso, recurso_id);
`,
  },
];

export function aplicarMigracoes(db: Banco): void {
  db.exec(`CREATE TABLE IF NOT EXISTS migracoes (
    nome      TEXT PRIMARY KEY,
    aplicada_em TEXT NOT NULL
  );`);

  const jaAplicada = db.prepare<[string], { nome: string }>('SELECT nome FROM migracoes WHERE nome = ?');
  const registrar = db.prepare('INSERT INTO migracoes (nome, aplicada_em) VALUES (?, ?)');

  for (const migracao of MIGRACOES) {
    if (jaAplicada.get(migracao.nome)) continue;
    db.transaction(() => {
      db.exec(migracao.sql);
      registrar.run(migracao.nome, new Date().toISOString());
    })();
  }
}
