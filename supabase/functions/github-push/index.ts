import {
  getConnection,
  json,
  requireUser,
  serve,
  slugRepoName,
} from '../_shared/hosting.ts'
import { ensureRepo, pushFiles } from '../_shared/github.ts'

interface PushBody {
  name?: string
  private?: boolean
  files?: Record<string, string>
}

export default async function handler(req: Request) {
  return serve(req, async (request) => {
    const user = await requireUser(request)
    const conn = await getConnection(user.id, 'github')
    if (!conn) return json(401, { error: 'Connect your GitHub account first.' })

    const body = (await request.json().catch(() => ({}))) as PushBody
    if (!body.name || !body.files || Object.keys(body.files).length === 0) {
      return json(400, { error: 'name and files are required' })
    }

    const repoName = slugRepoName(body.name)
    const files = Object.entries(body.files).map(([path, content]) => ({
      path,
      content: String(content),
    }))

    const info = await ensureRepo(conn.access_token, repoName, body.private !== false)
    const result = await pushFiles(conn.access_token, info, files)

    return json(200, {
      url: result.repoUrl,
      cloneUrl: result.cloneUrl,
      defaultBranch: result.defaultBranch,
      created: result.created,
    })
  })
}