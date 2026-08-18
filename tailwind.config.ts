import type { Config } from 'tailwindcss'

/**
 * Design tokens extracted verbatim from the CoachOS design prototype
 * (docs/CoachOS.dc.html). Every value here appears literally in that file —
 * nothing is approximated or substituted with a Tailwind default.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // surfaces
        canvas: '#E7E8E2', // page backdrop behind the phone shell
        shell: '#F7F7F3', // app shell background
        card: '#FFFFFF', // card surface
        sheet: '#FCFCFA', // bottom sheet / dialog surface
        navbar: '#FBFBF8', // tab bar (rendered at 94% opacity)
        track: '#ECECE7', // segmented-control track, skeleton base
        shimmer: '#F4F4EF', // skeleton highlight
        avatar: '#E9EAE4', // avatar circle background
        neutral_chip: '#EDEDE8', // neutral pill background

        // ink
        ink: '#171918', // primary text
        muted: '#6B706C', // secondary text
        subtle: '#8A8E89', // tertiary text
        faint: '#A2A69F', // placeholder text
        nav_off: '#A8ACA5', // inactive tab icon/label
        chevron: '#B9BDB6', // chevron glyphs, today ring

        // lines
        line: '#E5E6E1', // card + input borders
        divider: '#F0F1EC', // in-card row dividers
        ring: '#DEDFD8', // phone shell outline
        dashed: '#C9CCC3', // dashed "add" borders
        handle: '#DADBD4', // sheet grab handle, inactive dots

        // accent (green)
        accent: '#3FA66B',
        accent_dark: '#2E7D4F',
        accent_light: '#7BC79A',
        accent_soft: '#E4F2E9',
        accent_line: '#D5E5DB',

        // warning (amber)
        warn_bg: '#F6EEDB',
        warn_fg: '#96690F',
        warn_dot: '#C77E1F',

        // danger (red)
        danger_bg: '#F7E9E6',
        danger_fg: '#B3402F',
        danger_line: '#EBD4D0',
      },
      fontFamily: {
        sans: ["'Geist'", "'Helvetica Neue'", '-apple-system', 'sans-serif'],
        mono: ["'Geist Mono'", 'monospace'],
      },
      // Exact type ramp used by the prototype. Key `tNNN` == NN.N px.
      fontSize: {
        t9: '9px',
        t95: '9.5px',
        t10: '10px',
        t105: '10.5px',
        t11: '11px',
        t115: '11.5px',
        t12: '12px',
        t125: '12.5px',
        t13: '13px',
        t135: '13.5px',
        t14: '14px',
        t145: '14.5px',
        t15: '15px',
        t155: '15.5px',
        t16: '16px',
        t165: '16.5px',
        t17: '17px',
        t18: '18px',
        t19: '19px',
        t20: '20px',
        t22: '22px',
        t23: '23px',
        t24: '24px',
        t25: '25px',
        t26: '26px',
        t28: '28px',
        t30: '30px',
      },
      borderRadius: {
        r3: '3px',
        r8: '8px',
        r9: '9px',
        r10: '10px',
        r11: '11px',
        r12: '12px',
        r13: '13px',
        r14: '14px',
        r16: '16px',
        r18: '18px',
        r20: '20px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(23,25,24,.04)',
        card_hi: '0 1px 2px rgba(23,25,24,.05)',
        seg: '0 1px 3px rgba(23,25,24,.10)',
        sheet: '0 -12px 40px rgba(23,25,24,.18)',
        dialog: '0 24px 60px rgba(23,25,24,.3)',
        fab: '0 6px 16px rgba(63,166,107,.38), 0 1px 2px rgba(23,25,24,.15)',
        toast: '0 8px 24px rgba(23,25,24,.28)',
        shell: '0 0 0 1px #DEDFD8',
      },
      letterSpacing: {
        mono: '.14em',
        mono2: '.13em',
        mono3: '.12em',
        mono4: '.08em',
        tight1: '-.01em',
        tight15: '-.015em',
        tight2: '-.02em',
        tight3: '-.03em',
      },
      keyframes: {
        sheetUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        popIn: {
          from: { opacity: '0', transform: 'scale(.96) translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        toastUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: {
          from: { backgroundPosition: '-390px 0' },
          to: { backgroundPosition: '390px 0' },
        },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        sheetUp: 'sheetUp .28s cubic-bezier(.32,.72,0,1)',
        fadeIn: 'fadeIn .2s ease',
        popIn: 'popIn .22s ease',
        toastUp: 'toastUp .25s ease-out',
        shimmer: 'shimmer 1.2s linear infinite',
      },
    },
  },
  plugins: [],
}
export default config
