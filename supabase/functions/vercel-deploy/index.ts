import {
  getConnection,
  json,
  requireUser,
  serve,
  slugProjectName,
} from '../_shared/hosting.ts'
import { deployFiles } from '../_shared/vercel.ts'

interface DeployBody {
  name?: string
  files?: Record<string, string>
}

export default async function handler(req: Request) {
  return serve(req, async (request) => {
    const user = await requireUser(request)
    const conn = await getConnection(user.id, 'vercel')
    if (!conn) return json(401, { error: 'Connect your Vercel account first.' })

    const body = (await request.json().catch(() => ({}))) as DeployBody
    if (!body.name || !body.files || Object.keys(body.files).length === 0) {
      return json(400, { error: 'name and files are required' })
    }

    const result = await deployFiles(conn.access_token, slugProjectName(body.name), body.files)

    return json(200, result)
  })
}