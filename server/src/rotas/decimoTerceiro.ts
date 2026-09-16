import { Router } from 'express';
import { autenticar, exigirPermissao, sessaoDe } from '../auth/middleware.js';
import { erroValidacao } from '../erros.js';
import * as decimoTerceiroServico from '../servicos/decimoTerceiroServico.js';
import { query } from './http.js';
import { esquemaDecimoTerceiro, validar } from './validacao.js';

export const rotasDecimoTerceiro = Router();
rotasDecimoTerceiro.use(autenticar);

rotasDecimoTerceiro.get('/', exigirPermissao('folha:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const ano = Number(query(req, 'ano') ?? new Date().getFullYear());
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    throw erroValidacao('Informe um ano válido (YYYY).', [{ campo: 'ano', mensagem: 'Ano invalido.' }]);
  }
  res.json(decimoTerceiroServico.calcularAno(identidade.tenantId, ano));
});

rotasDecimoTerceiro.post('/processar', exigirPermissao('folha:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaDecimoTerceiro, req.body);
  res
    .status(201)
    .json(
      decimoTerceiroServico.processarParcela(
        identidade.tenantId,
        dados.ano,
        dados.parcela,
        dados.dataPagamento,
        identidade.usuarioId,
      ),
    );
});
