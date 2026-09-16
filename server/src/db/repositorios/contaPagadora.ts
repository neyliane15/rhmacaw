import type { ContaPagadora } from '@rhmacaw/shared';
import { agora, obterBanco } from '../conexao.js';

interface LinhaConta {
  tenant_id: string;
  banco_codigo: string;
  banco_nome: string;
  agencia: string;
  agencia_digito: string;
  conta: string;
  conta_digito: string;
  convenio: string;
  nome_empresa: string;
  cnpj: string;
  proximo_numero_remessa: number;
  atualizado_em: string;
}

const paraConta = (l: LinhaConta): ContaPagadora => ({
  bancoCodigo: l.banco_codigo,
  bancoNome: l.banco_nome,
  agencia: l.agencia,
  agenciaDigito: l.agencia_digito,
  conta: l.conta,
  contaDigito: l.conta_digito,
  convenio: l.convenio,
  nomeEmpresa: l.nome_empresa,
  cnpj: l.cnpj,
});

export function buscarContaPagadora(tenantId: string): ContaPagadora | null {
  const linha = obterBanco()
    .prepare<[string], LinhaConta>('SELECT * FROM conta_pagadora WHERE tenant_id = ?')
    .get(tenantId);
  return linha ? paraConta(linha) : null;
}

export function salvarContaPagadora(tenantId: string, conta: ContaPagadora): ContaPagadora {
  obterBanco()
    .prepare<unknown[], unknown>(
      `INSERT INTO conta_pagadora (
         tenant_id, banco_codigo, banco_nome, agencia, agencia_digito, conta, conta_digito, convenio,
         nome_empresa, cnpj, proximo_numero_remessa, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT (tenant_id) DO UPDATE SET
         banco_codigo = excluded.banco_codigo, banco_nome = excluded.banco_nome, agencia = excluded.agencia,
         agencia_digito = excluded.agencia_digito, conta = excluded.conta, conta_digito = excluded.conta_digito,
         convenio = excluded.convenio, nome_empresa = excluded.nome_empresa, cnpj = excluded.cnpj,
         atualizado_em = excluded.atualizado_em`,
    )
    .run(
      tenantId,
      conta.bancoCodigo,
      conta.bancoNome,
      conta.agencia,
      conta.agenciaDigito,
      conta.conta,
      conta.contaDigito,
      conta.convenio,
      conta.nomeEmpresa,
      conta.cnpj,
      agora(),
    );
  return conta;
}

/**
 * Reserva o proximo NSA (numero sequencial de arquivo).
 *
 * O incremento acontece na mesma instrucao da leitura para que duas geracoes
 * simultaneas nunca recebam o mesmo numero — o banco rejeita NSA repetido.
 */
export function reservarNumeroRemessa(tenantId: string): number {
  const linha = obterBanco()
    .prepare<[string], { proximo_numero_remessa: number }>(
      `UPDATE conta_pagadora SET proximo_numero_remessa = proximo_numero_remessa + 1
       WHERE tenant_id = ? RETURNING proximo_numero_remessa - 1 AS proximo_numero_remessa`,
    )
    .get(tenantId);
  if (!linha) throw new Error('Conta pagadora nao configurada para este tenant.');
  return linha.proximo_numero_remessa;
}
