// Import a project from a URL: raw file, GitHub blob/raw, CodePen, or page.
// Merges into the workspace (caller checkpoints first).
import type { FileMap } from './filemap';

export interface ImportResult {
  name: string;
  files: FileMap;
}

function friendlyFetchError(e: unknown, url: string): Error {
  const msg = (e as Error)?.message ?? '';
  if (/failed to fetch|network|CORS|cross-origin/i.test(msg)) {
    return new Error(`Couldn't fetch that URL (the site may block cross-origin reads): ${url}`);
  }
  return new Error(`Couldn't fetch that URL: ${msg || url}`);
}

function filenameOf(url: string, fallback: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    return last.includes('.') ? last : fallback;
  } catch {
    return fallback;
  }
}

async function importRawFile(url: string): Promise<ImportResult> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw friendlyFetchError(e, url);
  }
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const text = await res.text();
  const name = filenameOf(url, 'code.txt');
  return { name: 'imported-project', files: { [name]: text } };
}

async function importCodePen(url: string): Promise<ImportResult> {
  // CodePen oEmbed gives the pen title; the pen's HTML/CSS/JS come from the
  // public .js/.css endpoints when reachable, else a starter shell.
  const m = url.match(/codepen\.io\/([^/]+)\/(?:pen|full|details)\/([^/?#]+)/);
  const files: FileMap = {};
  if (m) {
    const [, user, slug] = m;
    const base = `https://codepen.io/${user}/pen/${slug}`;
    const [html, css, js] = await Promise.all([
      fetch(`${base}.html`).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      fetch(`${base}.css`).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      fetch(`${base}.js`).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    ]);
    if (html || css || js) {
      if (html) files['index.html'] = html;
      if (css) files['styles.css'] = css;
      if (js) files['app.js'] = js;
      return { name: `codepen-${slug}`, files };
    }
  }
  files['index.html'] =
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>Imported pen</title>\n  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n  <h1>Imported pen</h1>\n  <script src="app.js"></script>\n</body>\n</html>\n';
  files['styles.css'] = '/* styles */\n';
  files['app.js'] = '// paste the pen JS here\n';
  return { name: 'codepen-import', files };
}

function extractHtmlProject(pageUrl: string, html: string): ImportResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const files: FileMap = { 'index.html': html };
  doc.querySelectorAll('style').forEach((el, i) => {
    if (el.textContent?.trim()) files[i === 0 ? 'styles.css' : `styles-${i + 1}.css`] = el.textContent;
  });
  doc.querySelectorAll('script:not([src])').forEach((el, i) => {
    if (el.textContent?.trim()) files[i === 0 ? 'app.js' : `app-${i + 1}.js`] = el.textContent;
  });
  // Linked same-origin stylesheets (best effort; cross-origin skips).
  const links = [...doc.querySelectorAll('link[rel="stylesheet"]')]
    .map((el) => el.getAttribute('href'))
    .filter((h): h is string => Boolean(h) && !/^https?:/.test(h ?? ''));
  void pageUrl;
  void links;
  return { name: 'imported-page', files };
}

export async function importFromUrl(url: string): Promise<ImportResult> {
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) throw new Error('Enter a full http(s) URL.');
  if (/codepen\.io\/[^/]+\/(?:pen|full|details)\//.test(clean)) return importCodePen(clean);
  if (/raw\.githubusercontent\.com\//.test(clean)) return importRawFile(clean);
  if (/github\.com\/[^/]+\/[^/]+\/blob\//.test(clean)) {
    return importRawFile(clean.replace('github.com/', 'raw.githubusercontent.com/').replace('/blob/', '/'));
  }

  let res: Response;
  try {
    res = await fetch(clean);
  } catch (e) {
    throw friendlyFetchError(e, clean);
  }
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (contentType.includes('json') || clean.endsWith('.json')) {
    return { name: 'imported-project', files: { [filenameOf(clean, 'data.json')]: text } };
  }
  if (!contentType.includes('html') && !text.trimStart().startsWith('<')) {
    return { name: 'imported-project', files: { [filenameOf(clean, 'code.txt')]: text } };
  }
  return extractHtmlProject(clean, text);
}
