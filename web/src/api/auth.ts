import type { Papel, SessaoUsuario, Usuario } from '@rhmacaw/shared';
import { requisitar } from './cliente.js';

export function entrar(email: string, senha: string): Promise<SessaoUsuario> {
  return requisitar<SessaoUsuario>('/auth/login', { metodo: 'POST', corpo: { email, senha } });
}

export function sessaoAtual(): Promise<SessaoUsuario> {
  return requisitar<SessaoUsuario>('/auth/me');
}

export function listarUsuarios(): Promise<Usuario[]> {
  return requisitar<Usuario[]>('/auth/usuarios');
}

export function criarUsuario(dados: { nome: string; email: string; senha: string; papel: Papel }): Promise<Usuario> {
  return requisitar<Usuario>('/auth/usuarios', { metodo: 'POST', corpo: dados });
}
