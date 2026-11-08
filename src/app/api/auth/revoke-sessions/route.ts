import { NextRequest, NextResponse } from 'next/server';
import { createRevokeSessionsRoute } from '@/lib/revoke-sessions.mjs';

export async function POST(request: NextRequest) {
  const route = createRevokeSessionsRoute({
    env: process.env,
    getSession: async () => {
      const { getCurrentFirstPartyWebSession } = await import('@/lib/session');
      return getCurrentFirstPartyWebSession();
    },
    revoke: async (userId: string, authVersion: number) => {
      const { revokeAllFirstPartySessions } = await import('@/lib/session');
      return revokeAllFirstPartySessions(userId, authVersion);
    },
  });
  const response = await route(request);
  const output = new NextResponse(response.body, { status: response.status, headers: response.headers });
  if (response.status === 200) {
    const { sessionCookieOptions } = await import('@/lib/session');
    output.cookies.set({ ...sessionCookieOptions(), value: '', maxAge: 0 });
  }
  return output;
}
