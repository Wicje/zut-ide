// One canonical run-backend URL. `VITE_BROKER_URL` is the documented name;
// `VITE_RUNTIME_URL` stays as a compatibility alias so existing deployments
// and docs from the runtime era keep working.
export type BrokerEnv = {
  VITE_BROKER_URL?: string
  VITE_RUNTIME_URL?: string
}

export function resolveBrokerUrl(env: BrokerEnv): string {
  const raw = (env.VITE_BROKER_URL ?? '').trim() || (env.VITE_RUNTIME_URL ?? '').trim()
  return raw.replace(/\/+$/, '')
}
