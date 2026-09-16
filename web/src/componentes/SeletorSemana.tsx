import { formatarDataBR, hojeISO, intervaloDaSemanaISO, semanaISO } from '@rhmacaw/shared';
import { IconeSeta, IconeSetaEsq } from './Icones.js';

export interface PropsSeletorSemana {
  ano: number;
  semana: number;
  aoMudar: (ano: number, semana: number) => void;
}

/** Quantas semanas ISO tem o ano (52 ou 53). */
function semanasNoAno(ano: number): number {
  const trintaUmDez = `${ano}-12-31`;
  const { semana } = semanaISO(trintaUmDez);
  return semana === 1 ? 52 : semana;
}

export function SeletorSemana({ ano, semana, aoMudar }: PropsSeletorSemana): JSX.Element {
  const { inicio, fim } = intervaloDaSemanaISO(ano, semana);
  const atual = semanaISO(hojeISO());
  const ehAtual = atual.ano === ano && atual.semana === semana;

  function deslocar(passo: number): void {
    let novaSemana = semana + passo;
    let novoAno = ano;
    if (novaSemana < 1) {
      novoAno -= 1;
      novaSemana = semanasNoAno(novoAno);
    } else if (novaSemana > semanasNoAno(ano)) {
      novoAno += 1;
      novaSemana = 1;
    }
    aoMudar(novoAno, novaSemana);
  }

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-md border border-[var(--borda-forte)] bg-[var(--superficie-alta)]">
      <button type="button" aria-label="Semana anterior" onClick={() => deslocar(-1)} className="px-2 text-[var(--texto-2)] hover:bg-[var(--superficie-sutil)]">
        <IconeSetaEsq />
      </button>
      <div className="flex items-center gap-2 border-x border-[var(--borda)] px-3 py-1">
        <div className="flex flex-col leading-tight">
          <span className="sobrancelha leading-none">Semana ISO</span>
          <span className="font-mono text-sm font-semibold">
            {String(semana).padStart(2, '0')}/{ano}
          </span>
        </div>
        <span className="hidden text-xs text-[var(--texto-3)] sm:inline">
          {formatarDataBR(inicio)} a {formatarDataBR(fim)}
        </span>
      </div>
      <button type="button" aria-label="Proxima semana" onClick={() => deslocar(1)} className="px-2 text-[var(--texto-2)] hover:bg-[var(--superficie-sutil)]">
        <IconeSeta />
      </button>
      {!ehAtual ? (
        <button
          type="button"
          onClick={() => aoMudar(atual.ano, atual.semana)}
          className="border-l border-[var(--borda)] px-2 text-2xs font-semibold uppercase tracking-wide text-arara-700 hover:bg-[var(--superficie-sutil)] dark:text-arara-300"
        >
          Atual
        </button>
      ) : null}
    </div>
  );
}
