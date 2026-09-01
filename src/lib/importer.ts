import type { FileMap } from '../types'

interface ImportResult {
  name: string
  files: FileMap
}

/**
 * Import a project from a URL.
 * Supports:
 *  - Raw HTML page (extracts inline + linked CSS/JS)
 *  - CodePen embed (https://codepen.io/user/pen/ID or /full/ID)
 *  - GitHub raw file URL
 *  - Plain text/code URL
 */
export async function importFromUrl(url: string): Promise<ImportResult> {
  const clean = url.trim()

  // CodePen
  if (/codepen\.io\/[^/]+\/(?:pen|full|details)\//.test(clean)) {
    return importCodePen(clean)
  }

  // GitHub raw
  if (/raw\.githubusercontent\.com\//.test(clean)) {
    return importRawFile(clean)
  }

  // GitHub repo view → try to fetch as raw
  if (/github\.com\/[^/]+\/[^/]+\/blob\//.test(clean)) {
    const raw = clean
      .replace('github.com/', 'raw.githubusercontent.com/')
      .replace('/blob/', '/')
    return importRawFile(raw)
  }

  // Regular URL — fetch and parse
  const res = await fetch(clean)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`)
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()

  // If it's JSON, create a data.json
  if (contentType.includes('json') || clean.endsWith('.json')) {
    const name = extractFilename(clean) || 'data.json'
    return { name: 'imported-project', files: { [name]: text } }
  }

  // If it's plain code
  if (!contentType.includes('html') && !text.trimStart().startsWith('<')) {
    const name = extractFilename(clean) || 'code.txt'
    return { name: 'imported-project', files: { [name]: text } }
  }

  // HTML — parse and extract resources
  return importHtml(text, clean)
}

function extractFilename(url: string): string {
  try {
    const u = new URL(url)
    const seg = u.pathname.split('/').pop() ?? ''
    return seg || ''
  } catch {
    return ''
  }
}

async function importCodePen(url: string): Promise<ImportResult> {
  // CodePen embed URLs have /pen/, /full/, /details/
  // We can fetch the embed which has data attributes for HTML/CSS/JS
  const embedUrl = url.replace(/\/(pen|full|details)\//, '/embed/')
  const res = await fetch(embedUrl)
  const html = await res.text()

  const files: FileMap = {}

  // Extract from data attributes or script/style tags
  const htmlMatch = html.match(/data-default-tab="html"[^>]*>([\s\S]*?)<\/textarea>/)
  const cssMatch = html.match(/data-default-tab="css"[^>]*>([\s\S]*?)<\/textarea>/)
  const jsMatch = html.match(/data-default-tab="js"[^>]*>([\s\S]*?)<\/textarea>/)

  // Fallback: look for CodePen's pen data script
  const scriptMatch = html.match(/__CALLBACK_DATA__\s*=\s*({[\s\S]*?});/)

  if (scriptMatch) {
    try {
      const data = JSON.parse(scriptMatch[1])
      if (data.html) files['index.html'] = data.html
      if (data.css) files['style.css'] = data.css
      if (data.js) files['script.js'] = data.js
    } catch { /* fall through */ }
  }

  if (!files['index.html'] && htmlMatch) {
    files['index.html'] = decodeTextarea(htmlMatch[1])
  }
  if (!files['style.css'] && cssMatch) {
    files['style.css'] = decodeTextarea(cssMatch[1])
  }
  if (!files['script.js'] && jsMatch) {
    files['script.js'] = decodeTextarea(jsMatch[1])
  }

  if (Object.keys(files).length === 0) {
    // Last resort: just wrap whatever we got
    files['index.html'] = '<!DOCTYPE html>\n<html>\n<head></head>\n<body>\n<!-- Imported from CodePen -->\n</body>\n</html>'
  }

  // Ensure index.html references the CSS/JS
  if (files['index.html'] && files['style.css'] && !files['index.html'].includes('style.css')) {
    files['index.html'] = files['index.html'].replace('</head>', '  <link rel="stylesheet" href="style.css" />\n</head>')
  }
  if (files['index.html'] && files['script.js'] && !files['index.html'].includes('script.js')) {
    files['index.html'] = files['index.html'].replace('</body>', '  <script src="script.js"></script>\n</body>')
  }

  return { name: 'codepen-import', files }
}

function decodeTextarea(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim()
}

async function importRawFile(url: string): Promise<ImportResult> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
  const text = await res.text()
  const filename = extractFilename(url) || 'imported.txt'
  return { name: 'imported-project', files: { [filename]: text } }
}

async function importHtml(html: string, baseUrl: string): Promise<ImportResult> {
  const files: FileMap = {}
  const base = new URL(baseUrl)
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // Extract inline styles
  let inlineCss = ''
  doc.querySelectorAll('style').forEach((el) => {
    inlineCss += el.textContent + '\n'
  })

  // Extract linked stylesheets
  const cssLinks = doc.querySelectorAll('link[rel="stylesheet"][href]')
  const fetchedCss = await Promise.all(
    Array.from(cssLinks).map(async (el) => {
      const href = el.getAttribute('href')!
      try {
        const u = new URL(href, base)
        const res = await fetch(u.toString())
        if (res.ok) return await res.text()
      } catch { /* skip */ }
      return ''
    }),
  )
  if (inlineCss || fetchedCss.length) {
    files['style.css'] = [inlineCss, ...fetchedCss].filter(Boolean).join('\n')
  }

  // Remove styles from HTML
  const cleaned = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi, '')

  // Extract inline scripts (skip external)
  let inlineJs = ''
  doc.querySelectorAll('script:not([src])').forEach((el) => {
    if (el.textContent) inlineJs += el.textContent + '\n'
  })
  if (inlineJs.trim()) {
    files['script.js'] = inlineJs.trim()
  }

  // Extract linked scripts
  const scriptLinks = doc.querySelectorAll('script[src]')
  const fetchedJs = await Promise.all(
    Array.from(scriptLinks).map(async (el) => {
      const src = el.getAttribute('src')!
      if (/^https?:\/\//.test(src)) return '' // skip CDN scripts
      try {
        const u = new URL(src, base)
        const res = await fetch(u.toString())
        if (res.ok) return await res.text()
      } catch { /* skip */ }
      return ''
    }),
  )
  if (fetchedJs.length) {
    files['script.js'] = [...(files['script.js'] ? [files['script.js']] : []), ...fetchedJs]
      .filter(Boolean)
      .join('\n')
  }

  // Clean HTML: remove local script/link tags that we extracted
  let finalHtml = cleaned
    for (const el of Array.from(scriptLinks)) {
      const src = el.getAttribute('src')!
      if (!/^https?:\/\//.test(src)) {
        finalHtml = finalHtml.replace(el.outerHTML, '')
      }
    }

  if (files['style.css'] && !finalHtml.includes('style.css')) {
    finalHtml = finalHtml.replace('</head>', '  <link rel="stylesheet" href="style.css" />\n</head>')
  }
  if (files['script.js'] && !finalHtml.includes('script.js')) {
    finalHtml = finalHtml.replace('</body>', '  <script src="script.js"></script>\n</body>')
  }

  files['index.html'] = finalHtml.trim() || '<!DOCTYPE html>\n<html><head></head><body></body></html>'

  return { name: 'imported-project', files }
}
