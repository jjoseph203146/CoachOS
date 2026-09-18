import type { Config } from 'tailwindcss'

/**
 * Design tokens extracted from the CoachOS V1 UX spec (preview.html, the
 * approved prototype). Superseded from the earlier docs/CoachOS.dc.html
 * system — colors, type treatment, radii and shadows below are read off
 * preview.html's `:root` variables and component classes.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // surfaces
        canvas: '#DCEEFF', // page backdrop behind the app column (preview.html body gradient, flattened)
        shell: '#FFFFFF', // app shell background — preview.html screens sit on flat white
        card: '#FFFFFF', // card surface
        sheet: '#FFFFFF', // bottom sheet / dialog surface
        navbar: '#FFFFFF', // tab bar (rendered translucent at the call site)
        track: '#F0F3F7', // segmented-control track, skeleton base
        shimmer: '#F4F8FC', // skeleton highlight
        avatar: '#CBE3FF', // avatar circle background (flattened from preview.html's gradient)
        neutral_chip: '#EEF3F8', // neutral pill background

        // ink
        ink: '#0D1B31', // primary text
        muted: '#6D7A8C', // secondary text
        subtle: '#8A94A3', // tertiary text
        faint: '#A7B0BD', // placeholder text
        nav_off: '#718095', // inactive tab icon/label
        chevron: '#9AA6B4', // chevron glyphs
        avatar_fg: '#1E5A99', // avatar initials text

        // lines
        line: '#E7EDF5', // card + input borders
        divider: '#E7EDF5', // in-card row dividers
        ring: '#DEE7F0', // app shell outline
        dashed: '#C9D3DE', // dashed "add" borders
        handle: '#D5DCE5', // sheet grab handle, inactive dots

        // accent (blue — preview.html's primary/brand color)
        accent: '#1677EE',
        accent_dark: '#125EC2',
        accent_light: '#5CA7FF',
        accent_soft: '#EDF4FF',
        accent_line: '#D5E5FA',
        accent_text: '#2263AA', // pill/badge text on accent_soft

        // success (green — preview.html reserves green for positive/present, not brand)
        success: '#159A55',
        success_bg: '#EAF8EF',

        // warning (amber — not shown explicitly in preview.html, kept for soft warnings)
        warn_bg: '#FBF3E4',
        warn_fg: '#96690F',
        warn_dot: '#C77E1F',

        // danger (red)
        danger: '#EF4759',
        danger_bg: '#FFF0F1',
        danger_fg: '#A72A38',
        danger_line: '#F6D9DC',

        // program/adult accent (purple — new category introduced by preview.html)
        purple: '#7C63F3',
        purple_bg: '#F1EFFF',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"Segoe UI"',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
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
        r28: '28px',
      },
      boxShadow: {
        card: '0 4px 16px rgba(20,55,90,.04)',
        card_hi: '0 4px 16px rgba(20,55,90,.06)',
        seg: '0 2px 8px rgba(20,50,80,.08)',
        sheet: '0 -12px 40px rgba(20,55,90,.15)',
        dialog: '0 12px 40px rgba(30,65,105,.13)',
        fab: '0 8px 22px rgba(22,119,238,.35)',
        toast: '0 8px 24px rgba(13,27,49,.28)',
        shell: '0 0 0 1px #DEE7F0',
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
