import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AGENT-OS — Kernel v0.1',
  description: 'Multi-agent operating system with Z3 formal verification',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
