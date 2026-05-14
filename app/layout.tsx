import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'QED — Kernel v0.1',
  description: 'Verified agentic pipeline with Z3 formal proof and post-quantum certificates',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
