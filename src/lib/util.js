export const natCmp = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true })
export const byNumber = (a, b) => natCmp(a.number, b.number)
// Order is always by number, naturally (1.2 < 1.9 < 1.10), so the numbering alone decides the sequence.
export const bySort = (a, b) => natCmp(a.number, b.number) || (a.sort_order - b.sort_order)
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now())
export const newToken = () => uid().replace(/-/g, '')

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const fmtBytes = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB')
export const slug = (s) => String(s || 'file').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// "1.1  Hand tools | 8"  →  { number, title, hours }
export function parseBulkLines(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(\d+(?:\.\d+)*)\s*[:\-–.)]?\s+(.*)$/)
    if (!m) continue
    let title = m[2].trim(), hours = null
    const h = title.match(/^(.*?)\s*[|;\t]\s*(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours)?$/i)
    if (h) { title = h[1].trim(); hours = Number(h[2]) }
    if (title) out.push({ number: m[1], title, hours })
  }
  return out
}

// Does a stored number look like it belongs under LO "n"? (1.4 → LO 1)
export const loOf = (num) => String(num || '').split('.')[0]
