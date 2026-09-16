import { Router } from 'express';
import type { SessaoUsuario } from '@rhmacaw/shared';
import { autenticar, exigirPermissao, sessaoDe } from '../auth/middleware.js';
import { conferirSenha, gerarHash } from '../auth/senha.js';
import { emitirToken } from '../auth/token.js';
import { registrar } from '../db/repositorios/auditoria.js';
import { buscarTenant } from '../db/repositorios/tenants.js';
import * as repoUsuarios from '../db/repositorios/usuarios.js';
import { erroConflito, erroNaoAutenticado } from '../erros.js';
import { esquemaLogin, esquemaNovoUsuario, validar } from './validacao.js';

export const rotasAuth = Router();

rotasAuth.post('/login', (req, res) => {
  const { email, senha } = validar(esquemaLogin, req.body);
  const usuario = repoUsuarios.buscarPorEmail(email);

  // Mensagem unica para usuario inexistente e senha errada: nao entregamos ao
  // atacante a informacao de quais e-mails existem na base.
  if (!usuario || !usuario.ativo || !conferirSenha(senha, usuario.senhaHash)) {
    throw erroNaoAutenticado('E-mail ou senha incorretos.');
  }

  const tenant = buscarTenant(usuario.tenantId);
  if (!tenant) throw erroNaoAutenticado('Empresa do usuário não encontrada.');

  const { token, expiraEm } = emitirToken({
    usuarioId: usuario.id,
    tenantId: usuario.tenantId,
    papel: usuario.papel,
  });
  repoUsuarios.registrarAcesso(usuario.tenantId, usuario.id);
  registrar(usuario.tenantId, usuario.id, 'auth:login', 'usuario', usuario.id);

  const sessao: SessaoUsuario = { token, expiraEm, usuario: repoUsuarios.semSenha(usuario), tenant };
  res.json(sessao);
});

rotasAuth.get('/me', autenticar, (req, res) => {
  const sessao = sessaoDe(req);
  // Reemite o token a cada `me`: mantem a sessao viva enquanto o usuario usa o
  // sistema, sem precisar de refresh token separado.
  const { token, expiraEm } = emitirToken(sessao.identidade);
  const resposta: SessaoUsuario = { token, expiraEm, usuario: sessao.usuario, tenant: sessao.tenant };
  res.json(resposta);
});

rotasAuth.get('/usuarios', autenticar, exigirPermissao('usuarios:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(repoUsuarios.listarUsuarios(identidade.tenantId));
});

rotasAuth.post('/usuarios', autenticar, exigirPermissao('usuarios:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaNovoUsuario, req.body);

  if (repoUsuarios.buscarPorEmail(dados.email)) {
    throw erroConflito(`Ja existe usuario com o e-mail ${dados.email}.`);
  }

  const usuario = repoUsuarios.criarUsuario(identidade.tenantId, {
    nome: dados.nome,
    email: dados.email,
    senhaHash: gerarHash(dados.senha),
    papel: dados.papel,
  });
  registrar(identidade.tenantId, identidade.usuarioId, 'auth:criar-usuario', 'usuario', usuario.id, {
    papel: usuario.papel,
  });
  res.status(201).json(usuario);
});
