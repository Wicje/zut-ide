import {
  callbackUrl,
  redirect,
  requireEnv,
  saveConnection,
  serve,
  verifyOAuthState,
} from '../_shared/hosting.ts'
import { githubUser } from '../_shared/github.ts'

export default async function handler(req: Request) {
  return serve(req, async (request) => {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) return new Response('Missing code or state', { status: 400 })

    const payload = await verifyOAuthState(state)

    const token = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: requireEnv('GITHUB_CLIENT_ID'),
        client_secret: requireEnv('GITHUB_CLIENT_SECRET'),
        code,
        redirect_uri: callbackUrl(request, 'oauth-github-callback'),
      }),
    })
    if (!token.ok) throw new Error(`GitHub token exchange failed (${token.status})`)

    const tokenData = (await token.json()) as { access_token?: string; scope?: string; error?: string }
    if (!tokenData.access_token) {
      throw new Error(tokenData.error ?? 'GitHub token exchange failed')
    }

    const meta = await githubUser(tokenData.access_token)

    await saveConnection({
      owner_id: payload.uid,
      provider: 'github',
      access_token: tokenData.access_token,
      scope: tokenData.scope ?? null,
      meta: meta as Record<string, unknown>,
    })

    return redirect(`${payload.redirectTo}#oauth=github`)
  })
}