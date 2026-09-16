// GitHub OAuth + repo creation / pushing via the Git Data API.

const API = 'https://api.github.com'

interface GithubError extends Error {
  status?: number
}

async function gh(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...((init.headers as Record<string, string>) ?? {}),
    },
  })
  if (!res.ok) {
    let message = `GitHub error (${res.status})`
    try {
      const body = (await res.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      /* not json */
    }
    const err = new Error(message) as GithubError
    err.status = res.status
    throw err
  }
  return res
}

export async function githubUser(token: string): Promise<Record<string, unknown>> {
  return (await gh(token, '/user')).json()
}

export interface RepoInfo {
  owner: string
  repo: string
  fullName: string
  defaultBranch: string
  url: string
  cloneUrl: string
}

export async function ensureRepo(
  token: string,
  name: string,
  isPrivate: boolean,
): Promise<RepoInfo> {
  const user = (await githubUser(token)) as { login?: string }
  const login = user.login ?? ''
  if (!login) throw new Error('Could not determine your GitHub username')

  let existing: {
    name?: string
    full_name?: string
    owner?: { login?: string }
    default_branch?: string
  } | null = null
  const probe = await gh(token, `/repos/${encodeURIComponent(login)}/${encodeURIComponent(name)}`)
  if (probe.ok) existing = (await probe.json()) as typeof existing
  else if (probe.status !== 404) {
    const err = new Error('Could not reach GitHub') as GithubError
    err.status = probe.status
    throw err
  }

  let info: { name: string; full_name: string; owner: { login: string }; default_branch: string }
  if (existing) {
    info = existing as typeof info
  } else {
    const created = await gh(token, '/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name,
        private: isPrivate,
        description: 'Created with zut',
        auto_init: false,
      }),
    })
    info = (await created.json()) as typeof info
  }

  const owner = info.owner.login
  const repo = info.name
  const defaultBranch = info.default_branch || 'main'
  return {
    owner,
    repo,
    fullName: info.full_name,
    defaultBranch,
    url: `https://github.com/${info.full_name}`,
    cloneUrl: `https://github.com/${info.full_name}.git`,
  }
}

export interface PushResult {
  repoUrl: string
  cloneUrl: string
  defaultBranch: string
  commitSha: string
  created: boolean
}

export interface FileToPush {
  path: string
  content: string
}

export async function pushFiles(
  token: string,
  info: RepoInfo,
  files: FileToPush[],
): Promise<PushResult> {
  const full = info.fullName
  const branch = info.defaultBranch

  // 1. Upload every file as a blob.
  const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = []
  for (const file of files) {
    const blob = await gh(token, `/repos/${full}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
    })
    const blobData = (await blob.json()) as { sha: string }
    treeEntries.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha,
    })
  }

  // 2. Build the tree.
  const tree = await gh(token, `/repos/${full}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree: treeEntries }),
  })
  const treeData = (await tree.json()) as { sha: string }

  // 3. Find the parent commit, if the branch already exists.
  let parentSha: string | null = null
  const refProbe = await gh(token, `/repos/${full}/git/ref/heads/${branch}`)
  if (refProbe.ok) {
    const refData = (await refProbe.json()) as { object: { sha: string } }
    parentSha = refData.object.sha
  }

  // 4. Create the commit.
  const commit = await gh(token, `/repos/${full}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: parentSha ? 'Update from zut' : `Initial commit: ${info.repo}`,
      tree: treeData.sha,
      parents: parentSha ? [parentSha] : [],
    }),
  })
  const commitData = (await commit.json()) as { sha: string }

  // 5. Point the branch at the new commit.
  if (parentSha) {
    await gh(token, `/repos/${full}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commitData.sha, force: false }),
    })
  } else {
    await gh(token, `/repos/${full}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitData.sha }),
    })
  }

  return {
    repoUrl: info.url,
    cloneUrl: info.cloneUrl,
    defaultBranch: branch,
    commitSha: commitData.sha,
    created: !parentSha,
  }
}