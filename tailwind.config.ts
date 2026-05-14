import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      colors: {
        'os-bg': '#050508',
        'os-panel': '#0b0b0f',
        'os-border': '#1a1a2e',
        'os-green': '#00ff88',
        'os-amber': '#ffaa00',
        'os-red': '#ff3355',
        'os-blue': '#00aaff',
        'os-dim': '#3a3a4a',
        'os-text': '#c8c8d4',
      },
      keyframes: {
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0' } },
        pulse_dot: { '0%,100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.4', transform: 'scale(0.85)' } },
        slide_in: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scanline: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100vh)' } },
        glow_green: { '0%,100%': { boxShadow: '0 0 4px #00ff8844' }, '50%': { boxShadow: '0 0 12px #00ff8888' } },
      },
      animation: {
        blink: 'blink 1s step-end infinite',
        pulse_dot: 'pulse_dot 1.5s ease-in-out infinite',
        slide_in: 'slide_in 0.25s ease-out',
        scanline: 'scanline 8s linear infinite',
        glow_green: 'glow_green 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
