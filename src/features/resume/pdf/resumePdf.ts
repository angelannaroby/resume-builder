import { jsPDF } from 'jspdf'
import type { Resume, ResumeBullet as Bullet } from '@/domain/resume'
import { registerPdfFonts } from '@/features/resume/pdf/pdfFonts'

// ---- Fixed ATS-safe layout: A4, one column, embedded Liberation Sans, real text only (no images, tables or columns) ----
// Whatever the content, the generator itself guarantees: only characters the font can show, nothing running off
// the page, no overlapping text, and hidden items never reaching the file.
const W = 595.28, H = 841.89, M = 34
export const CONTENT_WIDTH = W - 2 * M
const BODY = 10, LH = 15, SMALL = 9
const INK = [22, 22, 22], MUTED = [85, 85, 85], RULE = [214, 214, 214]

// ---- Text cleaning: the PDF only ever receives characters the embedded font can show ----
const SUPPORTED = /^[\x20-\x7E\xA0-\xFF\u2022\u2026]$/
const ZERO_WIDTH = /^[\u200B-\u200D\u2060\uFEFF]$/
const SPACE = /^[\t\r\n\u2028\u2029]$/
const MAP: Record<string, string> = {
  '\u2013': '-', '\u2014': '-', '\u2212': '-', '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"',
  '\u00A0': ' ', '\u2192': '->', '\u2265': '>=', '\u2264': '<=',
}
/** One character -> what the PDF gets: a plain equivalent, the same character, or '' if it cannot be shown. */
function conv(ch: string): string {
  if (MAP[ch] !== undefined) return MAP[ch]
  if (SPACE.test(ch)) return ' '
  if (ZERO_WIDTH.test(ch)) return ''
  if (SUPPORTED.test(ch)) return ch
  const base = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // e.g. c-caron -> c
  return base && [...base].every((c) => SUPPORTED.test(c)) ? base : ''
}
export const sanitizePdfText = (s: string) => [...s].map(conv).join('').replace(/ {2,}/g, ' ')
/** Characters that have no usable equivalent and are left out of the PDF (emoji, symbols, other scripts). */
export const unsupportedCharacters = (s: string) => [...new Set([...s].filter((ch) => !ZERO_WIDTH.test(ch) && conv(ch) === ''))]

/** Measure using the same embedded font that draws the PDF, including bold runs. */
let measuringDoc: jsPDF | undefined
export const measureTextWidth = (s: string, bold: boolean, size: number) => {
  if (!measuringDoc) {
    measuringDoc = new jsPDF({ unit: 'pt', format: 'a4' })
    registerPdfFonts(measuringDoc)
  }
  measuringDoc.setFont('ResumeSans', bold ? 'bold' : 'normal')
  measuringDoc.setFontSize(size)
  return measuringDoc.getTextWidth(s)
}

/** Greedy wrap for single-style text. A word wider than the line is split so nothing can run off the page. */
function wrapPlain(text: string, bold: boolean, size: number, width: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const word of sanitizePdfText(text).split(' ').filter(Boolean)) {
    const pieces: string[] = []
    if (measureTextWidth(word, bold, size) <= width) pieces.push(word)
    else { let p = ''; for (const ch of word) { if (p && measureTextWidth(p + ch, bold, size) > width) { pieces.push(p); p = ch } else p += ch } if (p) pieces.push(p) }
    for (const piece of pieces) {
      const next = cur ? cur + ' ' + piece : piece
      if (cur && measureTextWidth(next, bold, size) > width) { out.push(cur); cur = piece } else cur = next
    }
  }
  if (cur) out.push(cur)
  return out
}

type Tok = { t: string; b: boolean }
type Line = Tok[]

export function buildPdf(r: Resume) {
  const d = new jsPDF({ unit: 'pt', format: 'a4', putOnlyUsedFonts: true })
  registerPdfFonts(d)
  let y = 42

  const font = (bold: boolean, size: number, c: number[] = INK) => {
    d.setFont('ResumeSans', bold ? 'bold' : 'normal')
    d.setFontSize(size)
    d.setTextColor(c[0], c[1], c[2])
  }
  const need = (h: number) => { if (y + h > H - 30) { d.addPage(); y = 38 } }
  const tw = (t: Tok) => measureTextWidth(t.t, t.b, BODY)

  /** Word-wrap text. **double asterisks** mark bold. */
  const lay = (text: string, first: number, w: number): Line[] => {
    const units: Tok[][] = []
    let u: Tok[] = []
    sanitizePdfText(text).split('**').forEach((seg, i) => seg.split(/(\s+)/).forEach((p) => {
      if (!p) return
      if (/^\s+$/.test(p)) { if (u.length) units.push(u); u = [] } else u.push({ t: p, b: i % 2 === 1 })
    }))
    if (u.length) units.push(u)
    const lim0 = Math.min(first, w)
    const fitted = units.flatMap((un) => {
      if (un.reduce((s, t) => s + tw(t), 0) <= lim0) return [un]
      const pieces: Tok[][] = []; let cur: Tok[] = [], cw = 0
      for (const t of un) for (const ch of t.t) {
        const c = measureTextWidth(ch, t.b, BODY)
        if (cur.length && cw + c > lim0) { pieces.push(cur); cur = []; cw = 0 }
        cur.push({ t: ch, b: t.b }); cw += c
      }
      if (cur.length) pieces.push(cur)
      return pieces
    })
    const sp = measureTextWidth(' ', false, BODY)
    const lines: Line[] = []
    let cur: Line = [], cw = 0, lim = first
    for (const un of fitted) {
      const uw = un.reduce((s, t) => s + tw(t), 0)
      if (cur.length && cw + sp + uw > lim) { lines.push(cur); cur = []; cw = 0; lim = w }
      if (cur.length) { cur.push({ t: ' ', b: cur[cur.length - 1].b && un[0].b }); cw += sp }
      cur.push(...un); cw += uw
    }
    if (cur.length) lines.push(cur)
    return lines
  }
  const draw = (line: Line, x: number) => {
    const runs: Tok[] = []
    for (const t of line) { const l = runs[runs.length - 1]; if (l && l.b === t.b) l.t += t.t; else runs.push({ ...t }) }
    for (const run of runs) { font(run.b, BODY); d.text(run.t, x, y); x += measureTextWidth(run.t, run.b, BODY) }
  }

  const heading = (t: string) => {
    need(48); y += 14
    font(true, 10.5); d.text(sanitizePdfText(t).toUpperCase(), M, y)
    y += 6
    d.setDrawColor(RULE[0], RULE[1], RULE[2]); d.setLineWidth(0.6); d.line(M, y, W - M, y)
    y += 16
  }
  const para = (t: string) => { for (const l of lay(t, CONTENT_WIDTH, CONTENT_WIDTH)) { need(LH); draw(l, M); y += LH } }
  const labeled = (label: string, t: string) => {
    const lw = measureTextWidth(sanitizePdfText(label) + ': ', true, BODY)
    const lines = lay(t, CONTENT_WIDTH - lw, CONTENT_WIDTH)
    need(LH * Math.max(1, lines.length))
    font(true, BODY); d.text(sanitizePdfText(label) + ':', M, y)
    if (!lines.length) y += LH
    lines.forEach((l, i) => { draw(l, i ? M : M + lw); y += LH })
    y += 3
  }
  const entry = (title: string, org: string, dates: string, loc: string) => {
    const dt = sanitizePdfText(dates), dw = dt ? measureTextWidth(dt, false, SMALL) + 12 : 0
    const tl = wrapPlain(title, true, BODY, CONTENT_WIDTH - dw)
    const o = sanitizePdfText(org), lc = sanitizePdfText(loc)
    const inline = !!o && (!lc || measureTextWidth(o, true, BODY) + measureTextWidth(' | ' + lc, false, SMALL) <= CONTENT_WIDTH)
    const ol = o ? (inline ? [o] : wrapPlain(o, true, BODY, CONTENT_WIDTH)) : []
    need(Math.max(76, 5 + LH * (Math.max(1, tl.length) + ol.length + (inline || !lc ? 0 : 1)) + 2 + 2 * LH)); y += 5
    ;(tl.length ? tl : ['']).forEach((l, i) => {
      font(true, BODY); d.text(l, M, y)
      if (i === 0 && dt) { font(false, SMALL, MUTED); d.text(dt, W - M - measureTextWidth(dt, false, SMALL), y) }
      y += LH
    })
    if (o) {
      ol.forEach((l) => { font(true, BODY); d.text(l, M, y); y += LH })
      if (lc && inline) { y -= LH; font(false, SMALL, MUTED); d.text(' | ' + lc, M + measureTextWidth(o, true, BODY), y); y += LH }
      else if (lc) { font(false, SMALL, MUTED); d.text(lc, M, y); y += LH }
      y += 2
    }
  }
  const bullets = (items: Bullet[]) => {
    for (const b of items.filter((x) => !x.hidden).map((x) => x.text.trim()).filter(Boolean)) {
      const lines = lay(b, CONTENT_WIDTH - 12, CONTENT_WIDTH - 12)
      need(LH * lines.length)
      font(false, BODY); d.text('\u2022', M + 3, y)
      for (const l of lines) { draw(l, M + 12); y += LH }
      y += 2
    }
  }

  // Header: every line wraps inside the margins
  const block = (text: string, bold: boolean, size: number, color: number[], step: number, gap = 0) => {
    font(bold, size, color)
    for (const l of wrapPlain(text, bold, size, CONTENT_WIDTH)) { d.text(l, M, y); y += step }
    y += gap
  }
  const contact = [r.email, r.phone, [r.location, r.relocation].filter(Boolean).join(' - ')].filter(Boolean).join(' | ')
  const linkItems = [r.linkedin, r.github, r.portfolio].map(sanitizePdfText).filter(Boolean)
  y += 8
  block(r.name, true, 22, INK, 21)
  block(r.headline, true, 10, INK, 13, 5)
  block(contact, false, SMALL, MUTED, 13.5)
  if (linkItems.length) {
    font(false, SMALL, MUTED)
    let x = M
    linkItems.forEach((l, i) => {
      const url = /^https?:\/\//i.test(l) ? l : 'https://' + l
      const parts = wrapPlain(l, false, SMALL, CONTENT_WIDTH) // one part unless the link alone is wider than the page
      parts.forEach((part, k) => {
        const pw = measureTextWidth(part, false, SMALL), sep = i && !k ? measureTextWidth(' | ', false, SMALL) : 0
        if (x > M && x + sep + pw > W - M) { x = M; y += 13.5 } // next line instead of running off the page
        else if (sep) { d.text(' | ', x, y); x += sep }
        d.textWithLink(part, x, y, { url })
        x += pw
        if (k < parts.length - 1) { x = M; y += 13.5 }
      })
    })
    y += 13.5
  }
  y += 4

  heading('Professional Summary'); para(r.summary)
  heading('Skills'); r.skills.filter((s) => !s.hidden).forEach((s) => labeled(s.label, s.items))
  heading('Professional Experience')
  r.jobs.forEach((j) => { entry(j.title, j.org, j.dates, j.location); bullets(j.bullets) })
  heading('Education')
  r.education.forEach((e) => {
    entry(e.degree, e.org, e.dates, e.location)
    font(false, BODY)
    if (e.details) para(e.details)
    if (e.thesis?.trim()) { need(LH + 4); y += 4; para('**Thesis:** ' + e.thesis.trim()) }
  })
  heading('Languages & Additional Information'); r.extras.forEach((x) => labeled(x.label, x.text))

  d.setProperties({ title: `${sanitizePdfText(r.name)} - CV`, author: sanitizePdfText(r.name), subject: 'Resume' })
  d.setLanguage('en-US')
  return { doc: d, pages: d.getNumberOfPages() }
}
