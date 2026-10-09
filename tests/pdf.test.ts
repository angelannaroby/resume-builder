// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { defaultResume } from '@/data/resumeSource'
import { buildPdf } from '@/features/resume/pdf/resumePdf'
import { applyChange, buildReview } from '@/features/resume/review/reviewEngine'
import { readFileSync } from 'node:fs'
import type { Resume } from '@/domain/resume'

/**
 * Offline ATS simulation: generate the PDF, then read it back the way a parser does
 * (text extraction with positions), and check everything an ATS depends on.
 */
const W = 595.28, H = 841.89, M = 34
type Item = { str: string; x: number; y: number; w: number }
interface Parsed { text: string; items: Item[]; pages: number; raw: string; links: string[] }

async function parse(r: Resume): Promise<Parsed> {
  const { doc } = buildPdf(r)
  const bytes = new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
  const raw = Buffer.from(bytes).toString('latin1')
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true, isEvalSupported: false }).promise
  const items: Item[] = []; const links: string[] = []
  const lines: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    let lastY: number | null = null, line = ''
    for (const it of content.items as any[]) {
      if (!('str' in it) || !it.str) continue
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width })
      if (lastY !== null && Math.abs(it.transform[5] - lastY) > 2) { lines.push(line); line = '' }
      line += it.str; lastY = it.transform[5]
    }
    if (line) lines.push(line)
    for (const a of (await page.getAnnotations()) as any[]) if (a.url) links.push(a.url)
  }
  return { text: lines.join('\n'), items, pages: pdf.numPages, raw, links }
}
const base = (): Resume => structuredClone(defaultResume)

describe('PDF is ATS-safe (default CV)', () => {
  let out: Parsed
  beforeAll(async () => { out = await parse(base()) })

  it('is real, selectable text with the expected content', () => {
    for (const s of [defaultResume.name, defaultResume.email, defaultResume.location, ...defaultResume.jobs.map((j) => j.org), ...defaultResume.education.map((e) => e.org)]) expect(out.text).toContain(s)
  })
  it('keeps the standard reading order: name, headline, contact, then sections', () => {
    const order = [defaultResume.name, defaultResume.headline, defaultResume.email, 'PROFESSIONAL SUMMARY', 'SKILLS', 'PROFESSIONAL EXPERIENCE', 'EDUCATION', 'LANGUAGES & ADDITIONAL INFORMATION']
    const at = order.map((s) => out.text.indexOf(s))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
  it('puts jobs in the order given and each bullet starts with a bullet glyph', () => {
    for (let i = 1; i < defaultResume.jobs.length; i++) expect(out.text.indexOf(defaultResume.jobs[i - 1].org)).toBeLessThan(out.text.indexOf(defaultResume.jobs[i].org))
    const shown = base().jobs.flatMap((j) => j.bullets).filter((b) => !b.hidden).length
    expect(out.text.split('\u2022').length - 1).toBe(shown)
    expect(out.text).toMatch(/\u2022 Owned end-to-end/)
  })
  it('keeps every piece of text inside the page margins', () => {
    for (const i of out.items) {
      expect(i.x).toBeGreaterThanOrEqual(M - 1)
      expect(i.x + i.w).toBeLessThanOrEqual(W - M + 1.5)
      expect(i.y).toBeGreaterThan(20); expect(i.y).toBeLessThan(H - 20)
    }
  })
  it('embeds regular and bold fonts with Unicode maps, without images or form fields', () => {
    expect(out.raw).toMatch(/\/BaseFont\s*\/ResumeSans/ )
    expect(out.raw.match(/\/FontFile2/g)?.length).toBe(2)
    expect(out.raw.match(/\/ToUnicode/g)?.length).toBe(2)
    expect(out.raw).not.toMatch(/\/Subtype\s*\/Image|\/AcroForm|\/S\s*\/JavaScript|\/JS\s*[(<]/)
  })
  it('has no garbled characters', () => {
    expect(out.text).not.toMatch(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/)
    expect(out.text).not.toMatch(/\?{2,}/)
  })
  it('is at most 2 pages, has metadata, language, and working link annotations', () => {
    expect(out.pages).toBeLessThanOrEqual(2)
    expect(out.raw).toMatch(/\/Title\s*\(/); expect(out.raw).toMatch(/\/Lang\s*\(en-US\)/)
    expect(out.links).toEqual(expect.arrayContaining([`https://${defaultResume.linkedin}`]))
  })
})

describe('PDF stays safe whatever is typed', () => {
  it('never emits hidden bullets or hidden skill categories', async () => {
    const r = base()
    r.jobs[0].bullets[0].text = 'SECRET-BULLET-TEXT'; r.jobs[0].bullets[0].hidden = true
    r.skills[0].label = 'SECRET-SKILL'; r.skills[0].hidden = true
    const out = await parse(r)
    expect(out.text).not.toContain('SECRET-BULLET-TEXT'); expect(out.text).not.toContain('SECRET-SKILL')
  })
  it('wraps a very long headline, contact line and links inside the margins', async () => {
    const r = base()
    r.headline = 'Frontend Developer | ' + 'React.js | TypeScript | Test Automation | Accessibility | Design Systems | '.repeat(4)
    r.relocation = 'Open to relocation anywhere in Germany, remote, hybrid or on site, available immediately for full time roles'
    r.portfolio = 'portfolio.example.com/' + 'a'.repeat(120)
    const out = await parse(r)
    for (const i of out.items) { expect(i.x).toBeGreaterThanOrEqual(M - 1); expect(i.x + i.w).toBeLessThanOrEqual(W - M + 1.5) }
    expect(out.text).toContain('Design Systems')
  })
  it('never lets a long job title collide with the dates, or a long unbroken word overflow', async () => {
    const r = base()
    r.jobs[0].title = 'Senior Principal Staff Frontend Development Engineer and Technical Lead for Platform Experience - Werkstudent'
    r.jobs[0].bullets[1].text = 'Maintained ' + 'x'.repeat(200) + ' in production.'
    const out = await parse(r)
    for (const i of out.items) { expect(i.x).toBeGreaterThanOrEqual(M - 1); expect(i.x + i.w).toBeLessThanOrEqual(W - M + 1.5) }
    const dates = out.items.find((i) => i.str.includes(defaultResume.jobs[0].dates.split(' - ')[0]))!
    const titleParts = out.items.filter((i) => Math.abs(i.y - dates.y) < 1 && i !== dates)
    for (const t of titleParts) expect(t.x + t.w).toBeLessThanOrEqual(dates.x + 0.5)
  })
  it('turns smart punctuation into plain text, keeps German letters, and drops what the font cannot show', async () => {
    const r = base()
    r.summary = 'Entwickler \u2014 \u201Cquick learner\u201D \u2192 M\u00FCnchen, Gr\u00F6\u00DFe, \u010Cesko \u{1F680} \u200B done.'
    const out = await parse(r)
    expect(out.text).toContain('Entwickler - "quick learner" -> M\u00FCnchen, Gr\u00F6\u00DFe, Cesko done.')
    expect(out.text).not.toMatch(/[\u{1F680}\u200B\u2014\u201C]/u)
  })
  it('stays readable when fields are empty', async () => {
    const r = base(); r.name = ''; r.headline = ''; r.jobs = []; r.education = []; r.extras = []; r.skills = []
    const out = await parse(r)
    expect(out.text).toContain('PROFESSIONAL SUMMARY')
  })
})

describe('PDF of a CV that went through import and review', () => {
  it('parses cleanly after every proposed change from a tailored file is accepted', async () => {
    const r = base()
    const rv = buildReview(r, JSON.parse(readFileSync('tests/fixtures/tailored.json', 'utf8')), 'tailored.json')!
    rv.proposals.filter((p) => !p.flags.some((f) => f.sev === 'block')).forEach((p) => applyChange(r, p.ch))
    const out = await parse(r)
    expect(out.pages).toBeLessThanOrEqual(2)
    for (const i of out.items) { expect(i.x).toBeGreaterThanOrEqual(M - 1); expect(i.x + i.w).toBeLessThanOrEqual(W - M + 1.5) }
    const order = ['PROFESSIONAL SUMMARY', 'SKILLS', 'PROFESSIONAL EXPERIENCE', 'EDUCATION', 'LANGUAGES & ADDITIONAL INFORMATION']
    const at = order.map((x) => out.text.indexOf(x))
    expect(at.every((i) => i >= 0) && [...at].sort((a, b) => a - b).join() === at.join()).toBe(true)
    expect(out.text).toContain('Working Style:')                    // new category was appended and is visible
    expect(out.text.indexOf('Working Style:')).toBeGreaterThan(out.text.indexOf('State, Forms & Data:'))
    expect(out.text).not.toMatch(/[\u2014\u2192\uFFFD]/)
    const visible = r.jobs.flatMap((j) => j.bullets).filter((b) => !b.hidden).length
    expect(out.text.split('\u2022').length - 1).toBe(visible)      // every visible bullet, no hidden one
  })
})
