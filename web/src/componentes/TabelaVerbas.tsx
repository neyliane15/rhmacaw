import { formatarBRL, type Verba } from '@rhmacaw/shared';

const ROTULO_NATUREZA: Record<Verba['natureza'], string> = {
  PROVENTO: 'Provento',
  DESCONTO: 'Desconto',
  INFORMATIVA: 'Informativa',
};

/** Contracheque/TRCT verba a verba, no formato que o RH reconhece. */
export function TabelaVerbas({ verbas, legenda = 'Verbas' }: { verbas: Verba[]; legenda?: string }): JSX.Element {
  const proventos = verbas.filter((v) => v.natureza === 'PROVENTO').reduce((s, v) => s + v.valor, 0);
  const descontos = verbas.filter((v) => v.natureza === 'DESCONTO').reduce((s, v) => s + v.valor, 0);

  return (
    <div className="overflow-hidden rounded-md border border-[var(--borda)]">
      <div className="tabela-rolagem rolagem-fina">
        <table className="w-full text-sm">
          <caption className="sr-only">{legenda}</caption>
          <thead className="bg-[var(--superficie-sutil)]">
            <tr className="border-b border-[var(--borda-forte)] text-left">
              <th className="px-2.5 py-1.5 font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Cod.</th>
              <th className="px-2.5 py-1.5 font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Descrição</th>
              <th className="px-2.5 py-1.5 font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Referência</th>
              <th className="px-2.5 py-1.5 text-right font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Provento</th>
              <th className="px-2.5 py-1.5 text-right font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Desconto</th>
              <th className="px-2.5 py-1.5 font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Bases</th>
            </tr>
          </thead>
          <tbody>
            {verbas.map((verba, i) => (
              <tr key={`${verba.codigo}-${i}`} className="border-b border-[var(--borda)] last:border-0">
                <td className="px-2.5 py-1.5 font-mono text-xs text-[var(--texto-3)]">{verba.codigo}</td>
                <td className="px-2.5 py-1.5">
                  {verba.descricao}
                  {verba.natureza === 'INFORMATIVA' ? (
                    <span className="ml-1.5 font-mono text-2xs uppercase text-[var(--texto-3)]">{ROTULO_NATUREZA.INFORMATIVA}</span>
                  ) : null}
                </td>
                <td className="px-2.5 py-1.5 font-mono text-xs text-[var(--texto-3)]">{verba.referencia}</td>
                <td className="num px-2.5 py-1.5 text-right tabular-nums">
                  {verba.natureza === 'PROVENTO' ? formatarBRL(verba.valor) : ''}
                </td>
                <td className="num px-2.5 py-1.5 text-right tabular-nums">
                  {verba.natureza === 'DESCONTO' ? formatarBRL(verba.valor) : ''}
                </td>
                <td className="px-2.5 py-1.5 font-mono text-2xs text-[var(--texto-3)]">
                  {[verba.baseINSS ? 'INSS' : null, verba.baseIRRF ? 'IRRF' : null, verba.baseFGTS ? 'FGTS' : null]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[var(--superficie-sutil)] font-semibold">
            <tr className="border-t-2 border-[var(--borda-forte)]">
              <td className="px-2.5 py-1.5" colSpan={3}>
                Totais
              </td>
              <td className="num px-2.5 py-1.5 text-right tabular-nums">{formatarBRL(proventos)}</td>
              <td className="num px-2.5 py-1.5 text-right tabular-nums">{formatarBRL(descontos)}</td>
              <td className="px-2.5 py-1.5" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
