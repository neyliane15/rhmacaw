/** Conjunto minimo de icones em SVG inline — sem dependencia externa. */
import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement> & { titulo?: string };

function Base({ titulo, children, ...resto }: Props & { children: React.ReactNode }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={titulo ? undefined : true}
      role={titulo ? 'img' : undefined}
      {...resto}
    >
      {titulo ? <title>{titulo}</title> : null}
      {children}
    </svg>
  );
}

export const IconePainel = (p: Props): JSX.Element => (
  <Base {...p}>
    <rect x="3" y="3" width="7" height="8" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="11" width="7" height="10" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </Base>
);
export const IconePessoas = (p: Props): JSX.Element => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" />
    <path d="M16.5 5.2a3 3 0 0 1 0 5.6M18 14.4c2 .7 3.4 2.4 3.4 4.6" />
  </Base>
);
export const IconeCalendario = (p: Props): JSX.Element => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Base>
);
export const IconePalmeira = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M12 21v-9" />
    <path d="M12 12c-1-3-4-4.6-7-3.6M12 12c1-3 4-4.6 7-3.6M12 12c0-3.2-1.6-5.6-4.4-6.6M12 12c0-3.2 1.6-5.6 4.4-6.6" />
  </Base>
);
export const IconeMoedas = (p: Props): JSX.Element => (
  <Base {...p}>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v5c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 11v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" />
  </Base>
);
export const IconeFolha = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v5h5M8 13h8M8 17h5" />
  </Base>
);
export const IconePresente = (p: Props): JSX.Element => (
  <Base {...p}>
    <rect x="3" y="8" width="18" height="13" rx="1.5" />
    <path d="M3 12h18M12 8v13" />
    <path d="M12 8S10.5 3 8 3a2.4 2.4 0 0 0 0 5M12 8s1.5-5 4-5a2.4 2.4 0 0 1 0 5" />
  </Base>
);
export const IconeSaida = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8" />
    <path d="M18 15l3-3-3-3M21 12h-10" />
  </Base>
);
export const IconeBanco = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M3 9.5 12 4l9 5.5" />
    <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" />
  </Base>
);
export const IconeRelatorio = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M4 20V8M9.3 20V4M14.7 20v-8M20 20v-5" />
  </Base>
);
export const IconeBusca = (p: Props): JSX.Element => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Base>
);
export const IconeFechar = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);
export const IconeMais = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);
export const IconeCheck = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Base>
);
export const IconeAtencao = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M10.6 3.8 2.5 18a1.6 1.6 0 0 0 1.4 2.4h16.2A1.6 1.6 0 0 0 21.5 18L13.4 3.8a1.6 1.6 0 0 0-2.8 0Z" />
    <path d="M12 9.5v4.2M12 17.4h.01" />
  </Base>
);
export const IconeInfo = (p: Props): JSX.Element => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6h.01" />
  </Base>
);
export const IconeCritico = (p: Props): JSX.Element => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.2v5.4M12 16.4h.01" />
  </Base>
);
export const IconeSeta = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
);
export const IconeSetaEsq = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Base>
);
export const IconeChevron = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);
export const IconeBaixar = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16" />
  </Base>
);
export const IconeSol = (p: Props): JSX.Element => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M2 12h2M20 12h2M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5" />
  </Base>
);
export const IconeLua = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
  </Base>
);
export const IconeMenu = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);
export const IconeLixeira = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 13a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9L18 7M9.5 7V4.6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" />
  </Base>
);
export const IconeEngrenagem = (p: Props): JSX.Element => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1.1Z" />
  </Base>
);
export const IconeRaio = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </Base>
);
