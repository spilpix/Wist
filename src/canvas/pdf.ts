// Minimal multi-page PDF that embeds one JPEG per page (DCTDecode). No deps.
// Each page is sized to its image's pixel dimensions (1px = 1pt).

interface Page {
  bytes: Uint8Array
  width: number
  height: number
}

export function buildPdf(pages: Page[]): Uint8Array {
  const chunks: Uint8Array[] = []
  let len = 0
  const enc = (s: string) => {
    // ASCII-only dictionary text — UTF-8 == Latin-1 here
    const u = new TextEncoder().encode(s)
    chunks.push(u)
    len += u.length
    return u
  }
  const raw = (u: Uint8Array) => {
    chunks.push(u)
    len += u.length
  }

  // object numbering: 1=catalog, 2=pages, then per page: page, content, image
  const offsets: number[] = []
  const objCount = 2 + pages.length * 3
  const mark = (num: number) => {
    offsets[num] = len
  }

  enc('%PDF-1.4\n')

  // 1: catalog
  mark(1)
  enc('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')

  // 2: pages
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')
  mark(2)
  enc(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`)

  pages.forEach((pg, i) => {
    const pageNum = 3 + i * 3
    const contentNum = pageNum + 1
    const imgNum = pageNum + 2
    const W = pg.width
    const H = pg.height

    // page object
    mark(pageNum)
    enc(
      `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
        `/Resources << /XObject << /Im0 ${imgNum} 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`
    )

    // content stream: paint the image to fill the page
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`
    mark(contentNum)
    enc(`${contentNum} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`)

    // image XObject (JPEG, DCTDecode)
    mark(imgNum)
    enc(
      `${imgNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.bytes.length} >>\nstream\n`
    )
    raw(pg.bytes)
    enc('\nendstream\nendobj\n')
  })

  // xref
  const xrefOffset = len
  enc(`xref\n0 ${objCount + 1}\n`)
  enc('0000000000 65535 f\r\n')
  for (let i = 1; i <= objCount; i++) {
    enc(`${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n\r\n`)
  }
  enc(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  // concat
  const out = new Uint8Array(len)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}
