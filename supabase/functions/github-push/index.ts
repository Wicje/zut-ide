import {
  getConnection,
  json,
  requireUser,
  saveConnection,
  serve,
  slugRepoName,
} from '../_shared/hosting.ts'
import { ensureRepo, githubUser, pushFiles } from '../_shared/github.ts'

interface PushBody {
  name?: string
  private?: boolean
  files?: Record<string, string>
  /** GitHub Personal Access Token — used instead of the OAuth connection. */
  token?: string
}

export default async function handler(req: Request) {
  return serve(req, async (request) => {
    const user = await requireUser(request)

    const body = (await request.json().catch(() => ({}))) as PushBody
    if (!body.name || !body.files || Object.keys(body.files).length === 0) {
      return json(400, { error: 'name and files are required' })
    }

    let token = body.token ?? ''
    if (token) {
      // PAT flow: validate it, then store so later pushes don't need it again.
      try {
        const ghUser = (await githubUser(token)) as { login?: string }
        await saveConnection({
          owner_id: user.id,
          provider: 'github',
          access_token: token,
          meta: { via: 'pat', login: ghUser.login ?? null },
        })
      } catch (e) {
        return json(401, { error: (e as { message?: string }).message ?? 'Invalid GitHub token' })
      }
    } else {
      const conn = await getConnection(user.id, 'github')
      if (!conn) return json(401, { error: 'Connect your GitHub account first.' })
      token = conn.access_token
    }

    const repoName = slugRepoName(body.name)
    const files = Object.entries(body.files).map(([path, content]) => ({
      path,
      content: String(content),
    }))

    const info = await ensureRepo(token, repoName, body.private !== false)
    const result = await pushFiles(token, info, files)

    return json(200, {
      url: result.repoUrl,
      cloneUrl: result.cloneUrl,
      defaultBranch: result.defaultBranch,
      created: result.created,
    })
  })
}