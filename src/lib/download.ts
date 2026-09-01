import JSZip from 'jszip'
import type { FileMap } from '../types'

export async function downloadProjectZip(name: string, files: FileMap): Promise<void> {
  const zip = new JSZip()
  for (const [filename, content] of Object.entries(files)) {
    zip.file(filename, content)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const safeName = name.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'project'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}