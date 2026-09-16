import { useEffect, useRef, type ReactNode } from 'react';
import { IconeFechar } from './Icones.js';

export interface PropsModal {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  subtitulo?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: 'estreito' | 'medio' | 'largo' | 'cheio';
}

const LARGURA: Record<NonNullable<PropsModal['largura']>, string> = {
  estreito: 'max-w-md',
  medio: 'max-w-2xl',
  largo: 'max-w-4xl',
  cheio: 'max-w-6xl',
};

export function Modal({ aberto, aoFechar, titulo, subtitulo, children, rodape, largura = 'medio' }: PropsModal): JSX.Element | null {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') aoFechar();
      if (e.key !== 'Tab' || !caixa.current) return;
      // Prende o foco dentro do dialogo.
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (!primeiro || !ultimo) return;
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', aoTeclar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    caixa.current?.focus();
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <button type="button" aria-label="Fechar" className="absolute inset-0 cursor-default" onClick={aoFechar} tabIndex={-1} />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full ${LARGURA[largura]} animate-entrada flex-col overflow-hidden rounded-t-xl border border-[var(--borda)] bg-[var(--superficie)] shadow-flutuante sm:rounded-xl`}
      >
        <header className="flex items-start gap-3 border-b border-[var(--borda)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold">{titulo}</h2>
            {subtitulo ? <div className="mt-0.5 text-xs text-[var(--texto-3)]">{subtitulo}</div> : null}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="botao-fantasma -mr-1 px-2 py-1 text-base">
            <IconeFechar />
          </button>
        </header>
        <div className="rolagem-fina min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {rodape ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--borda)] bg-[var(--superficie-sutil)] px-4 py-3">
            {rodape}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
