import { NextResponse } from 'next/server'

const PIN = '54321'

export async function POST(request: Request) {
  const { pin } = await request.json()
  if (pin !== PIN) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set('clivi_auth', 'ok', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 horas
  })
  return response
}
