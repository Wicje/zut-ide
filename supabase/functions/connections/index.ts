import {
  deleteConnection,
  json,
  listConnections,
  requireUser,
  serve,
} from '../_shared/hosting.ts'

export default async function handler(req: Request) {
  return serve(req, async (request) => {
    const user = await requireUser(request)

    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      provider?: string
    }

    if (body.action === 'disconnect' && (body.provider === 'github' || body.provider === 'vercel')) {
      await deleteConnection(user.id, body.provider)
      return json(200, { connections: [] })
    }

    const rows = await listConnections(user.id)
    return json(200, {
      connections: rows.map((r) => ({
        provider: r.provider,
        connected: true,
        login: r.meta.login ?? r.meta.username ?? null,
        name: r.meta.name ?? null,
      })),
    })
  })
}