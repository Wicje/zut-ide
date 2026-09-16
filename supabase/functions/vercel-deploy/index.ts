import {
  getConnection,
  json,
  requireUser,
  saveConnection,
  serve,
  slugProjectName,
} from '../_shared/hosting.ts'
import { deployFiles, vercelUser } from '../_shared/vercel.ts'

interface DeployBody {
  name?: string
  files?: Record<string, string>
  /** Vercel API token — used instead of the OAuth connection. */
  token?: string
}

export default async function handler(req: Request) {
  return serve(req, async (request) => {
    const user = await requireUser(request)

    const body = (await request.json().catch(() => ({}))) as DeployBody
    if (!body.name || !body.files || Object.keys(body.files).length === 0) {
      return json(400, { error: 'name and files are required' })
    }

    let token = body.token ?? ''
    if (token) {
      // Token flow: validate it, then store so later deploys don't need it again.
      try {
        const vUser = (await vercelUser(token)) as { username?: string; name?: string }
        await saveConnection({
          owner_id: user.id,
          provider: 'vercel',
          access_token: token,
          meta: { via: 'token', login: vUser.username ?? vUser.name ?? null },
        })
      } catch (e) {
        return json(401, { error: (e as { message?: string }).message ?? 'Invalid Vercel token' })
      }
    } else {
      const conn = await getConnection(user.id, 'vercel')
      if (!conn) return json(401, { error: 'Connect your Vercel account first.' })
      token = conn.access_token
    }

    const result = await deployFiles(token, slugProjectName(body.name), body.files)

    return json(200, result)
  })
}