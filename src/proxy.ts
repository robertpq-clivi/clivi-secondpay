import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const auth = request.cookies.get('clivi_auth')?.value

  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/api/auth')
  if (!isPublic && auth !== 'ok') {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (pathname === '/login' && auth === 'ok') {
    return NextResponse.redirect(new URL('/', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
