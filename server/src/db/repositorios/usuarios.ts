import type { Papel, Usuario } from '@rhmacaw/shared';
import { agora, novoId, obterBanco } from '../conexao.js';
import { deBooleano, paraBooleano } from './comum.js';

interface LinhaUsuario {
  id: string;
  tenant_id: string;
  nome: string;
  email: string;
  senha_hash: string;
  papel: string;
  ativo: number;
  ultimo_acesso: string | null;
  criado_em: string;
}

/** Usuario + hash. So o servico de autenticacao deve tocar no hash. */
export interface UsuarioComSenha extends Usuario {
  senhaHash: string;
}

const paraUsuario = (l: LinhaUsuario): UsuarioComSenha => ({
  id: l.id,
  tenantId: l.tenant_id,
  nome: l.nome,
  email: l.email,
  papel: l.papel as Papel,
  ativo: paraBooleano(l.ativo),
  ultimoAcesso: l.ultimo_acesso,
  criadoEm: l.criado_em,
  senhaHash: l.senha_hash,
});

/** Remove o hash antes de devolver o usuario para fora da camada de auth. */
export function semSenha(usuario: UsuarioComSenha): Usuario {
  const { senhaHash: _descartado, ...publico } = usuario;
  return publico;
}

/** O login nao tem tenant: o e-mail identifica sozinho o usuario no sistema. */
export function buscarPorEmail(email: string): UsuarioComSenha | null {
  const linha = obterBanco()
    .prepare<[string], LinhaUsuario>('SELECT * FROM usuarios WHERE email = ?')
    .get(email.trim().toLowerCase());
  return linha ? paraUsuario(linha) : null;
}

export function buscarUsuario(tenantId: string, id: string): UsuarioComSenha | null {
  const linha = obterBanco()
    .prepare<[string, string], LinhaUsuario>('SELECT * FROM usuarios WHERE tenant_id = ? AND id = ?')
    .get(tenantId, id);
  return linha ? paraUsuario(linha) : null;
}

export function listarUsuarios(tenantId: string): Usuario[] {
  return obterBanco()
    .prepare<[string], LinhaUsuario>('SELECT * FROM usuarios WHERE tenant_id = ? ORDER BY nome')
    .all(tenantId)
    .map((l) => semSenha(paraUsuario(l)));
}

export interface NovoUsuario {
  nome: string;
  email: string;
  senhaHash: string;
  papel: Papel;
  ativo?: boolean;
}

export function criarUsuario(tenantId: string, dados: NovoUsuario): Usuario {
  const usuario: Usuario = {
    id: novoId('usr'),
    tenantId,
    nome: dados.nome,
    email: dados.email.trim().toLowerCase(),
    papel: dados.papel,
    ativo: dados.ativo ?? true,
    ultimoAcesso: null,
    criadoEm: agora(),
  };
  obterBanco()
    .prepare<unknown[], unknown>(
      `INSERT INTO usuarios (id, tenant_id, nome, email, senha_hash, papel, ativo, ultimo_acesso, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      usuario.id,
      tenantId,
      usuario.nome,
      usuario.email,
      dados.senhaHash,
      usuario.papel,
      deBooleano(usuario.ativo),
      null,
      usuario.criadoEm,
    );
  return usuario;
}

export function registrarAcesso(tenantId: string, id: string): void {
  obterBanco()
    .prepare<[string, string, string], unknown>('UPDATE usuarios SET ultimo_acesso = ? WHERE tenant_id = ? AND id = ?')
    .run(agora(), tenantId, id);
}
