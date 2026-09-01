let prettierPromise: Promise<typeof import('prettier/standalone')> | null = null

function getPrettier() {
  if (!prettierPromise) {
    prettierPromise = import('prettier/standalone') as Promise<typeof import('prettier/standalone')>
  }
  return prettierPromise
}

const PARSERS: Record<string, string> = {
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  js: 'babel',
  jsx: 'babel',
  mjs: 'babel',
  ts: 'babel',
  tsx: 'babel',
  json: 'json',
  jsonc: 'json',
}

export async function formatCode(
  code: string,
  parser: string,
): Promise<string> {
  const prettier = await getPrettier()
  const parserName = PARSERS[parser] ?? parser

  const plugins = await Promise.all([
    import('prettier/plugins/html'),
    import('prettier/plugins/postcss'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
    import('prettier/plugins/typescript'),
  ])

  try {
    return await prettier.format(code, {
      parser: parserName,
      plugins,
      semi: true,
      singleQuote: true,
      tabWidth: 2,
      trailingComma: 'all',
      printWidth: 100,
    })
  } catch {
    return code
  }
}
