import type { StatusRemessa } from '@rhmacaw/shared';
import { IconeCheck } from './Icones.js';

export type EtapaTrilho = 'origem' | 'prévia' | 'gerada' | 'enviada' | 'confirmada';

const ORDEM: { chave: EtapaTrilho; rotulo: string; nota: string }[] = [
  { chave: 'origem', rotulo: 'Origem fechada', nota: 'Folha ou semana fechada' },
  { chave: 'prévia', rotulo: 'Prévia conferida', nota: 'Favorecidos validados' },
  { chave: 'gerada', rotulo: 'Remessa gerada', nota: 'Arquivo pronto' },
  { chave: 'enviada', rotulo: 'Enviada ao banco', nota: 'Upload no internet banking' },
  { chave: 'confirmada', rotulo: 'Confirmada', nota: 'Crédito nas contas' },
];

export function etapaDaRemessa(status: StatusRemessa): EtapaTrilho {
  switch (status) {
    case 'CONFIRMADA':
      return 'confirmada';
    case 'ENVIADA':
      return 'enviada';
    default:
      return 'gerada';
  }
}

/**
 * O trilho de pagamento: a assinatura do produto. Mostra, sempre na mesma
 * ordem e sempre em ouro, onde o dinheiro esta no caminho até a conta do
 * colaborador. Aparece no banco, na folha e na comissão semanal.
 */
export function TrilhoPagamento({ etapa, compacto = false }: { etapa: EtapaTrilho; compacto?: boolean }): JSX.Element {
  const indiceAtual = ORDEM.findIndex((e) => e.chave === etapa);
  return (
    <ol className={`flex flex-wrap items-stretch gap-1 ${compacto ? '' : 'sm:flex-nowrap'}`} aria-label="Etapas do pagamento">
      {ORDEM.map((passo, i) => {
        const concluida = i < indiceAtual;
        const ativa = i === indiceAtual;
        return (
          <li
            key={passo.chave}
            aria-current={ativa ? 'step' : undefined}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border-l-[3px] px-2.5 py-1.5 ${
              ativa
                ? 'border-ouro-400 bg-ouro-100 text-ouro-700 dark:bg-ouro-700/30 dark:text-ouro-100'
                : concluida
                  ? 'border-ouro-300 bg-ouro-50 text-ouro-600 dark:border-ouro-500 dark:bg-ouro-700/15 dark:text-ouro-200'
                  : 'border-[var(--borda)] bg-[var(--superficie-sutil)] text-[var(--texto-3)]'
            }`}
          >
            <span className="shrink-0 font-mono text-2xs tabular-nums">
              {concluida ? <IconeCheck width="0.9em" height="0.9em" /> : String(i + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold leading-tight">{passo.rotulo}</span>
              {!compacto ? <span className="block truncate text-2xs opacity-75">{passo.nota}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
