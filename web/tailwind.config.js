/**
 * Sistema de design do RH Macaw.
 *
 * Direcao: "ficha de folha" — uma ferramenta de escritorio densa, com espinha
 * tabular forte. O azul-arara e a cor estrutural (navegacao, cabecalho de
 * tabela, foco). O ouro e reservado ao TRILHO DE PAGAMENTO: so aparece onde o
 * dinheiro sai da empresa (valor a transferir, remessa, banco). Cores de status
 * nunca sao usadas como fundo de coluna, e o ouro nunca vira pilula de status —
 * papeis diferentes, formas diferentes.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-tema="escuro"]'],
  theme: {
    extend: {
      colors: {
        tinta: {
          50: '#F4F7FA',
          100: '#E8EDF2',
          200: '#D6DDE5',
          300: '#B3BFCC',
          400: '#8393A6',
          500: '#5C6B7E',
          600: '#3D4A5C',
          700: '#2B3644',
          800: '#1E2631',
          900: '#161C25',
          950: '#10151C',
        },
        arara: {
          50: '#EFF6FE',
          100: '#CDE2FB',
          200: '#9EC5F4',
          300: '#86B6EF',
          400: '#5598E7',
          500: '#2A78D6',
          600: '#256ABF',
          700: '#1C5CAB',
          800: '#184F95',
          900: '#0D366B',
        },
        ouro: {
          50: '#FDF7EA',
          100: '#F9EBCC',
          200: '#F0D79B',
          300: '#E6B85C',
          400: '#CE9227',
          500: '#B4761A',
          600: '#8F5C12',
          700: '#6B430B',
        },
        // Status: fixos, nunca tematizados, sempre acompanhados de icone/rotulo.
        bom: '#0CA30C',
        aviso: '#FAB219',
        grave: '#EC835A',
        critico: '#D03B3B',
        // Series de grafico validadas (modo claro / escuro).
        serie: {
          1: '#2A78D6',
          2: '#EB6834',
          3: '#1BAF7A',
          4: '#EDA100',
          5: '#E87BA4',
          6: '#008300',
          7: '#4A3AA7',
          8: '#E34948',
        },
      },
      fontFamily: {
        display: ['"Familjen Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        xs: ['0.75rem', { lineHeight: '1.05rem' }],
        sm: ['0.8125rem', { lineHeight: '1.15rem' }],
        base: ['0.875rem', { lineHeight: '1.35rem' }],
        lg: ['1rem', { lineHeight: '1.5rem' }],
        xl: ['1.1875rem', { lineHeight: '1.6rem' }],
        '2xl': ['1.5rem', { lineHeight: '1.8rem' }],
        '3xl': ['1.9375rem', { lineHeight: '2.2rem' }],
        '4xl': ['2.5rem', { lineHeight: '2.6rem' }],
      },
      borderRadius: {
        DEFAULT: '5px',
        md: '6px',
        lg: '9px',
        xl: '13px',
      },
      boxShadow: {
        carta: '0 1px 2px rgba(16,21,28,0.05), 0 0 0 1px rgba(16,21,28,0.06)',
        flutuante: '0 18px 40px -12px rgba(16,21,28,0.35), 0 0 0 1px rgba(16,21,28,0.08)',
      },
      spacing: {
        barra: '15rem',
        topo: '3.5rem',
      },
      keyframes: {
        entrada: { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'none' } },
        pulsoSuave: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.45' } },
      },
      animation: {
        entrada: 'entrada 160ms ease-out both',
        pulsoSuave: 'pulsoSuave 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
