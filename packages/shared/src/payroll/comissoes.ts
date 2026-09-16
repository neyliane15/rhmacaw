/**
 * Rateio das comissoes semanais.
 *
 * O restaurante arrecada um valor na semana (gorjeta/servico/meta), retem um
 * percentual da casa e distribui o restante entre os colaboradores conforme o
 * criterio do periodo. O resultado e pago na propria semana e depois abatido
 * do liquido da folha mensal.
 */
import { arredondar, naoNegativo } from '../util/money.js';
import type { CriterioRateio } from '../domain/tipos.js';

export interface ParticipanteRateio {
  colaboradorId: string;
  nome: string;
  /** Peso do colaborador quando o criterio e PONTOS. */
  pontos: number;
  /** Horas trabalhadas na semana, usadas quando o criterio e HORAS. */
  horas: number;
  /** Valor fixo quando o criterio e MANUAL. */
  valorManual?: number;
  /** Somado depois do rateio (bonus, correcao, desconto). */
  ajuste?: number;
}

export interface EntradaRateio {
  valorArrecadado: number;
  percentualRetencao: number;
  criterio: CriterioRateio;
  participantes: ParticipanteRateio[];
}

export interface LinhaRateio {
  colaboradorId: string;
  nome: string;
  pontos: number;
  horas: number;
  /** Participacao proporcional antes do ajuste. */
  valorRateado: number;
  ajuste: number;
  valor: number;
}

export interface ResultadoRateio {
  valorArrecadado: number;
  valorRetido: number;
  valorDistribuivel: number;
  totalDistribuido: number;
  /** Sobra por arredondamento, sempre alocada ao maior beneficiario. */
  diferencaArredondamento: number;
  linhas: LinhaRateio[];
  alertas: string[];
}

/**
 * Distribui o valor da semana entre os participantes.
 *
 * O rateio proporcional gera dizimas; a diferenca de centavos e somada ao
 * participante de maior valor para que a soma das linhas bata exatamente com
 * o valor distribuivel — sem isso, a remessa bancaria fecha com divergencia.
 */
export function ratearComissoes(entrada: EntradaRateio): ResultadoRateio {
  const alertas: string[] = [];
  const arrecadado = naoNegativo(entrada.valorArrecadado);
  const percentual = Math.min(100, Math.max(0, entrada.percentualRetencao));
  const retido = arredondar(arrecadado * (percentual / 100));
  const distribuivel = arredondar(arrecadado - retido);

  const participantes = entrada.participantes;
  if (participantes.length === 0) {
    return {
      valorArrecadado: arrecadado,
      valorRetido: retido,
      valorDistribuivel: distribuivel,
      totalDistribuido: 0,
      diferencaArredondamento: 0,
      linhas: [],
      alertas: ['Nenhum participante no período: nada a distribuir.'],
    };
  }

  // Peso nao e dinheiro: `naoNegativo` arredondaria para centavos e distorceria
  // a proporcao (1,6764 ponto viraria 1,68). Aqui so se descarta o invalido.
  const pesoValido = (valor: number): number => (Number.isFinite(valor) && valor > 0 ? valor : 0);

  const pesoDe = (p: ParticipanteRateio): number => {
    switch (entrada.criterio) {
      case 'PONTOS':
        return pesoValido(p.pontos);
      case 'HORAS':
        return pesoValido(p.horas);
      case 'IGUALITARIO':
        return 1;
      case 'MANUAL':
        return 0;
    }
  };

  let linhas: LinhaRateio[];
  /** `true` so quando houve rateio proporcional de verdade — e o que autoriza realocar a sobra. */
  let rateouProporcional = false;

  if (entrada.criterio === 'MANUAL') {
    linhas = participantes.map((p) => {
      const valorRateado = arredondar(naoNegativo(p.valorManual ?? 0));
      const ajuste = arredondar(p.ajuste ?? 0);
      return {
        colaboradorId: p.colaboradorId,
        nome: p.nome,
        pontos: p.pontos,
        horas: p.horas,
        valorRateado,
        ajuste,
        valor: arredondar(valorRateado + ajuste),
      };
    });
    const somaManual = arredondar(linhas.reduce((a, l) => a + l.valorRateado, 0));
    if (Math.abs(somaManual - distribuivel) > 0.01) {
      alertas.push(
        `Lancamento manual soma ${somaManual.toFixed(2)}, diferente do valor distribuivel ${distribuivel.toFixed(2)}.`,
      );
    }
  } else {
    const pesoTotal = participantes.reduce((a, p) => a + pesoDe(p), 0);
    if (pesoTotal <= 0) {
      alertas.push(`Criterio ${entrada.criterio} sem peso valido: verifique pontos/horas dos participantes.`);
      linhas = participantes.map((p) => ({
        colaboradorId: p.colaboradorId,
        nome: p.nome,
        pontos: p.pontos,
        horas: p.horas,
        valorRateado: 0,
        ajuste: arredondar(p.ajuste ?? 0),
        valor: arredondar(p.ajuste ?? 0),
      }));
    } else {
      rateouProporcional = true;
      linhas = participantes.map((p) => {
        const valorRateado = arredondar((distribuivel * pesoDe(p)) / pesoTotal);
        const ajuste = arredondar(p.ajuste ?? 0);
        return {
          colaboradorId: p.colaboradorId,
          nome: p.nome,
          pontos: p.pontos,
          horas: p.horas,
          valorRateado,
          ajuste,
          valor: arredondar(valorRateado + ajuste),
        };
      });
    }
  }

  // Aloca a sobra de centavos no maior valor rateado.
  //
  // So quando o rateio proporcional aconteceu: sem peso valido nenhuma linha foi
  // calculada, e a "sobra" seria o valor distribuivel inteiro — jogar isso no
  // primeiro participante pagaria a semana toda a uma pessoa so.
  let diferenca = 0;
  if (rateouProporcional && linhas.length > 0) {
    const somaRateada = arredondar(linhas.reduce((a, l) => a + l.valorRateado, 0));
    diferenca = arredondar(distribuivel - somaRateada);
    if (diferenca !== 0) {
      const alvo = linhas.reduce((maior, l) => (l.valorRateado > maior.valorRateado ? l : maior), linhas[0] as LinhaRateio);
      alvo.valorRateado = arredondar(alvo.valorRateado + diferenca);
      alvo.valor = arredondar(alvo.valorRateado + alvo.ajuste);
    }
  }

  const totalDistribuido = arredondar(linhas.reduce((a, l) => a + l.valor, 0));
  const negativos = linhas.filter((l) => l.valor < 0);
  if (negativos.length > 0) {
    alertas.push(`${negativos.length} participante(s) com valor negativo apos ajuste — nao entram na remessa bancaria.`);
  }

  return {
    valorArrecadado: arrecadado,
    valorRetido: retido,
    valorDistribuivel: distribuivel,
    totalDistribuido,
    diferencaArredondamento: diferenca,
    linhas,
    alertas,
  };
}

/**
 * Media das comissoes dos ultimos 12 meses, usada como base de ferias, 13o e
 * rescisao (Sumula 45 do TST e art. 142, par. 3o da CLT).
 */
export function mediaComissoes(valoresPorMes: number[], meses = 12): number {
  if (valoresPorMes.length === 0) return 0;
  const considerados = valoresPorMes.slice(-meses);
  const soma = considerados.reduce((a, v) => a + naoNegativo(v), 0);
  return arredondar(soma / considerados.length);
}
