import type { Tenant } from '@rhmacaw/shared';
import { agora, novoId, obterBanco } from '../conexao.js';

interface LinhaTenant {
  id: string;
  nome: string;
  cnpj: string;
  cnae: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  criado_em: string;
}

const paraTenant = (l: LinhaTenant): Tenant => ({
  id: l.id,
  nome: l.nome,
  cnpj: l.cnpj,
  cnae: l.cnae,
  endereco: l.endereco,
  cidade: l.cidade,
  uf: l.uf,
  cep: l.cep,
  criadoEm: l.criado_em,
});

export function buscarTenant(tenantId: string): Tenant | null {
  const linha = obterBanco()
    .prepare<[string], LinhaTenant>('SELECT * FROM tenants WHERE id = ?')
    .get(tenantId);
  return linha ? paraTenant(linha) : null;
}

export function buscarTenantPorCnpj(cnpj: string): Tenant | null {
  const linha = obterBanco()
    .prepare<[string], LinhaTenant>('SELECT * FROM tenants WHERE cnpj = ?')
    .get(cnpj);
  return linha ? paraTenant(linha) : null;
}

export type NovoTenant = Omit<Tenant, 'id' | 'criadoEm'>;

export function criarTenant(dados: NovoTenant): Tenant {
  const tenant: Tenant = { ...dados, id: novoId('ten'), criadoEm: agora() };
  obterBanco()
    .prepare<unknown[], unknown>(
      `INSERT INTO tenants (id, nome, cnpj, cnae, endereco, cidade, uf, cep, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      tenant.id,
      tenant.nome,
      tenant.cnpj,
      tenant.cnae ?? null,
      tenant.endereco ?? null,
      tenant.cidade ?? null,
      tenant.uf ?? null,
      tenant.cep ?? null,
      tenant.criadoEm,
    );
  return tenant;
}
