import {
  callbackUrl,
  redirect,
  requireEnv,
  saveConnection,
  serve,
  verifyOAuthState,
} from '../_shared/hosting.ts'
import { vercelUser } from '../_shared/vercel.ts'

export default async function handler(req: Request) {
  return serve(req, async (request) => {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) return new Response('Missing code or state', { status: 400 })

    const payload = await verifyOAuthState(state)

    const token = await fetch('https://api.vercel.com/v1/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: requireEnv('VERCEL_CLIENT_ID'),
        client_secret: requireEnv('VERCEL_CLIENT_SECRET'),
        code,
        redirect_uri: callbackUrl(request, 'oauth-vercel-callback'),
      }),
    })
    const tokenData = (await token.json()) as {
      access_token?: string
      scope?: string
      team_id?: string
      error?: string
    }
    if (!token.ok || !tokenData.access_token) {
      throw new Error(tokenData.error ?? `Vercel token exchange failed (${token.status})`)
    }

    const user = await vercelUser(tokenData.access_token)

    await saveConnection({
      owner_id: payload.uid,
      provider: 'vercel',
      access_token: tokenData.access_token,
      scope: tokenData.scope ?? null,
      meta: {
        ...user,
        teamId: tokenData.team_id ?? null,
      },
    })

    return redirect(`${payload.redirectTo}#oauth=vercel`)
  })
}