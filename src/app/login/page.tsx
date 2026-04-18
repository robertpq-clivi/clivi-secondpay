'use client'

import { useRef, useState, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [digits, setDigits] = useState(['', '', '', '', ''])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const router = useRouter()

  async function submit(pin: string) {
    setLoading(true)
    setError(false)
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })
    if (res.ok) {
      router.push('/')
    } else {
      setError(true)
      setDigits(['', '', '', '', ''])
      setLoading(false)
      refs[0].current?.focus()
    }
  }

  function handleChange(i: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = digit
    setDigits(next)
    setError(false)
    if (digit && i < 4) refs[i + 1].current?.focus()
    if (digit && i === 4) submit(next.join(''))
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs[i - 1].current?.focus()
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-sm px-8 py-10 rounded-2xl border bg-card shadow-sm text-center space-y-6">
        <div className="space-y-1">
          <div className="text-2xl font-bold" style={{ color: '#5C2D91' }}>Clivi</div>
          <p className="text-sm text-muted-foreground">Ingresa tu PIN para continuar</p>
        </div>

        <div className="flex gap-3 justify-center">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              autoFocus={i === 0}
              disabled={loading}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`w-11 h-14 text-center text-xl font-bold rounded-lg border-2 bg-background outline-none transition-colors
                ${error ? 'border-red-400 text-red-500' : 'border-input focus:border-[#5C2D91]'}`}
            />
          ))}
        </div>

        {error && <p className="text-sm text-red-500">PIN incorrecto, intenta de nuevo</p>}
        {loading && <p className="text-sm text-muted-foreground">Verificando...</p>}
      </div>
    </div>
  )
}
