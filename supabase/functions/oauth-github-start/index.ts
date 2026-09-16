import {
  callbackUrl,
  json,
  requireEnv,
  requireUser,
  serve,
  signOAuthState,
} from '../_shared/hosting.ts'

export default async function handler(req: Request) {
  return serve(req, async (request) => {
    const redirectTo = (await request.json().catch(() => ({})) as { redirectTo?: string }).redirectTo
    if (!redirectTo || !redirectTo.startsWith('http')) {
      return json(400, { error: 'redirectTo is required' })
    }

    const user = await requireUser(request)
    const clientId = requireEnv('GITHUB_CLIENT_ID')
    const scope = Deno.env.get('GITHUB_OAUTH_SCOPES') ?? 'repo'
    const state = await signOAuthState({ uid: user.id, redirectTo })

    const url =
      `https://github.com/login/oauth/authorize?` +
      `client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl(request, 'oauth-github-callback'))}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}` +
      `&response_type=code`

    return json(200, { url })
  })
}