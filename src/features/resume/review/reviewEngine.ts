import type { Resume, ResumeBullet as Bullet, ResumeSkill as Skill } from '@/domain/resume'
import { CONTENT_WIDTH, sanitizePdfText, unsupportedCharacters, measureTextWidth } from '@/features/resume/pdf/resumePdf'

/**
 * Review engine. An imported JSON never touches the resume directly.
 * It is turned into a list of proposals; only an explicit Accept changes the resume.
 *
 * Locked (never proposed, only reported when they differ): name, contact details, links,
 * location, job title / company / dates / location, all education, all languages and extras.
 * Nothing is ever deleted: a bullet that is missing from the file is only proposed to be hidden.
 */

type Sev = 'block' | 'check' | 'note'
export interface Flag { sev: Sev; msg: string; items?: string[] }
export type Decision = 'pending' | 'accepted' | 'rejected'
/** Texts/labels that identify one item before AND after the change (so it can still be found). */
export type Ref = string[]

export type Change =
  | { t: 'field'; key: 'headline' | 'summary'; from: string; to: string }
  | { t: 'skillLabel'; ref: Ref; from: string; to: string }
  | { t: 'skillItems'; ref: Ref; from: string; to: string }
  | { t: 'skillNew'; to: Skill } // always appended at the end
  | { t: 'bText'; job: string; ref: Ref; from: string; to: string }
  | { t: 'bVis'; job: string; ref: Ref; from: boolean; to: boolean } // from/to are the bullet's `hidden` flag: to === true means HIDE
  | { t: 'bNew'; job: string; to: Bullet; after: Ref | null }
  | { t: 'bDrop'; job: string; ref: Ref }

export interface Proposal { id: string; ch: Change; flags: Flag[]; decision: Decision }
interface Lock { where: string; field: string; cur: string; inc: string }
export interface Review {
  file: string
  raw: unknown
  proposals: Proposal[]
  locked: Lock[]
  unchanged: { fields: Record<string, string>; bullets: Record<string, string[]>; skills: string[] }
  /** Bullet order suggested by the file, per job. Reference for the Reorder window only, never a proposal. */
  orders: Record<string, Ref[]>
  sections: string[]
}

// ---------- text helpers ----------
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g
/** Exactly what the PDF would show for this text, on one line. Accepted text is stored in this form. */
export const tidy = (s: string) => sanitizePdfText(s).replace(/\s+/g, ' ').trim()
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
export const jobKey = (j: { org: string; dates: string }) => norm(j.org) + '|' + norm(j.dates)

const STOP = new Set('a an the and or of to in with for on by from at as is are was were that this it its their into so per across while using used also be been has have had'.split(' '))
const stem = (w: string) => (w.length > 5 ? w.replace(/(ing|ed|s)$/, '') : w)
const toks = (s: string) =>
  new Set(s.toLowerCase().replace(/\*\*/g, '').split(/[^a-z0-9+#.%]+/).map((w) => w.replace(/^\.+|\.+$/g, '')).filter((w) => w && !STOP.has(w)).map(stem))
const dice = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0
  let n = 0; a.forEach((x) => { if (b.has(x)) n++ })
  return (2 * n) / (a.size + b.size)
}
const jac = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0
  let n = 0; a.forEach((x) => { if (b.has(x)) n++ })
  return n / (a.size + b.size - n)
}

/** Comma split that ignores commas inside brackets, e.g. "SQL (PostgreSQL, pgAdmin)". */
export const splitItems = (s: string) => {
  const out: string[] = []; let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  out.push(cur.trim())
  return out.filter(Boolean)
}

// ---------- word diff ----------
export type Op = { k: '=' | '+' | '-'; w: string }
export const plainOps = (s: string): Op[] => s.split(/\s+/).filter(Boolean).map((w) => ({ k: '=' as const, w }))
export function wordDiff(a: string, b: string): Op[] {
  const x = a.split(/\s+/).filter(Boolean), y = b.split(/\s+/).filter(Boolean)
  const n = x.length, m = y.length
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  const out: Op[] = []; let i = 0, j = 0
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ k: '=', w: y[j] }); i++; j++ }
    else if (t[i + 1][j] >= t[i][j + 1]) out.push({ k: '-', w: x[i++] })
    else out.push({ k: '+', w: y[j++] })
  }
  while (i < n) out.push({ k: '-', w: x[i++] })
  while (j < m) out.push({ k: '+', w: y[j++] })
  return out
}

// ---------- safety flags ----------
const AI_WORDS = /\b(leverag\w*|spearhead\w*|orchestrat\w*|architected|championed|pioneer\w*|revolutioni\w*|robust|seamless\w*|cutting-edge|passionate|synerg\w*|transformative)\b/gi
const numsOf = (s: string) =>
  (s.match(/\d[\d.,]*\+?%?/g) ?? []).map((n) => n.replace(/[.,]+$/, '')).filter((n) => n.includes('%') || n.endsWith('+') || n.replace(/\D/g, '').length >= 2)
type Ctx = { blob: string; nums: Set<string> }
type Kind = 'headline' | 'summary' | 'bullet' | 'label' | 'items'

function flagsFor(to: string, raw: string, kind: Kind, ctx: Ctx): Flag[] {
  const f: Flag[] = []
  if (!to.trim()) f.push({ sev: 'block', msg: 'Empty' })
  if ((to.match(/\*\*/g) ?? []).length % 2) f.push({ sev: 'block', msg: 'Unpaired **' })
  const fresh = [...new Set(numsOf(to))].filter((n) => !ctx.nums.has(n))
  if (fresh.length) f.push({ sev: 'check', msg: `New number ${fresh.join(', ')}` })
  if (kind === 'items') {
    const items = splitItems(to).filter((it) => {
      const base = it.replace(/\(.*\)/, '').trim().toLowerCase()
      return base && !ctx.blob.includes(base) && !ctx.blob.includes(base.replace(/\.js$/, ''))
    })
    if (items.length) f.push({ sev: 'check', msg: `${items.length} new skill${items.length > 1 ? 's' : ''}`, items })
  }
  const gone = unsupportedCharacters(raw)
  if (gone.length) f.push({ sev: 'note', msg: `Removed ${gone.join(' ')}` })
  if (raw.replace(INVISIBLE, '') !== raw) f.push({ sev: 'note', msg: 'Invisible characters removed' })
  if (kind === 'headline' && measureTextWidth(to, true, 10) > CONTENT_WIDTH) f.push({ sev: 'note', msg: 'Wraps to two lines' })
  if (/[\u2013\u2014]/.test(raw)) f.push({ sev: 'note', msg: 'Dashes replaced' })
  const ai = [...new Set((to.match(AI_WORDS) ?? []).map((w) => w.toLowerCase()))]
  if (ai.length) f.push({ sev: 'note', msg: `AI wording: ${ai.join(', ')}` })
  if (kind === 'bullet' && to.replace(/\*\*/g, '').length > 280) f.push({ sev: 'note', msg: 'Over 280 characters' })
  if (kind === 'summary' && (to.length < 150 || to.length > 700)) f.push({ sev: 'note', msg: `Summary ${to.length} characters` })
  return f
}

// ---------- pairing ----------
/** Greedy best-match. Returns, for every incoming item, the index of its current item (or -1). */
function pair(nc: number, ni: number, sim: (c: number, i: number) => number, min: number): number[] {
  const ps: [number, number, number][] = []
  for (let c = 0; c < nc; c++) for (let i = 0; i < ni; i++) { const s = sim(c, i); if (s >= min) ps.push([s, c, i]) }
  ps.sort((a, b) => b[0] - a[0] || Math.abs(a[1] - a[2]) - Math.abs(b[1] - b[2]))
  const out: number[] = new Array(ni).fill(-1), used = new Set<number>()
  for (const [, c, i] of ps) if (out[i] < 0 && !used.has(c)) { out[i] = c; used.add(c) }
  return out
}
const ascending = (a: number[]) => a.every((v, i) => !i || v > a[i - 1])

// ---------- input cleaning ----------
const S = (v: unknown) => (typeof v === 'string' ? v : undefined)
interface IncBullet { text: string; hidden: boolean }
interface IncJob { title?: string; org: string; dates?: string; location?: string; bullets: IncBullet[] }

function coerceJobs(v: unknown): IncJob[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((j: any) => {
    const org = S(j?.org)
    if (!org) return []
    const bullets = (Array.isArray(j.bullets) ? j.bullets : []).flatMap((b: any): IncBullet[] => {
      if (typeof b === 'string') return [{ text: b, hidden: false }]
      return typeof b?.text === 'string' ? [{ text: b.text, hidden: !!b.hidden }] : []
    })
    return [{ title: S(j.title), org, dates: S(j.dates), location: S(j.location), bullets }]
  })
}

// ---------- build ----------
export function buildReview(cur: Resume, raw: unknown, file: string): Review | null {
  const x = raw as any
  const isResume = x && typeof x === 'object' && !Array.isArray(x) &&
    (['name', 'headline', 'summary'].some((k) => typeof x[k] === 'string') || ['jobs', 'skills', 'education', 'extras'].some((k) => Array.isArray(x[k])))
  if (!isResume) return null

  const curText = JSON.stringify(cur)
  const ctx: Ctx = { blob: curText.toLowerCase(), nums: new Set(numsOf(curText)) }
  const proposals: Proposal[] = [], locked: Lock[] = []
  const unchanged: Review['unchanged'] = { fields: {}, bullets: {}, skills: [] }
  const orders: Review['orders'] = {}
  let n = 0
  const add = (ch: Change, flags: Flag[] = []) => { proposals.push({ id: `p${n++}`, ch, flags, decision: 'pending' }) }
  const lock = (where: string, field: string, c: string, i: string) => { if (tidy(c) !== tidy(i)) locked.push({ where, field, cur: c, inc: i }) }

  // Personal details: locked.
  for (const k of ['name', 'email', 'phone', 'location', 'relocation', 'linkedin', 'github', 'portfolio'] as const) {
    const v = S(x[k]); if (v !== undefined) lock('Personal information', k, cur[k], v)
  }
  // Headline and summary: reviewable.
  for (const k of ['headline', 'summary'] as const) {
    const v = S(x[k]); if (v === undefined) continue
    const to = tidy(v)
    if (to === tidy(cur[k])) unchanged.fields[k] = cur[k]
    else add({ t: 'field', key: k, from: cur[k], to }, flagsFor(to, v, k, ctx))
  }

  // Skills.
  if (Array.isArray(x.skills)) {
    const inc: Skill[] = x.skills.flatMap((s: any) => (typeof s?.label === 'string' && typeof s?.items === 'string' ? [{ label: s.label, items: s.items, ...(s.hidden === true ? { hidden: true } : {}) }] : []))
    const cs = cur.skills
    const pr = pair(cs.length, inc.length, (c, i) =>
      norm(cs[c].label) === norm(inc[i].label) ? 1 : jac(new Set(splitItems(cs[c].items).map((v) => v.toLowerCase())), new Set(splitItems(inc[i].items).map((v) => v.toLowerCase()))), 0.3)
    inc.forEach((sk, i) => {
      const c = pr[i], label = tidy(sk.label), items = tidy(sk.items)
      if (c < 0) {
        add({ t: 'skillNew', to: { label, items, ...(sk.hidden ? { hidden: true } : {}) } }, [...flagsFor(label, sk.label, 'label', ctx), ...flagsFor(items, sk.items, 'items', ctx)])
        return
      }
      const ref: Ref = [cs[c].label, label]
      let changed = false
      if (label !== tidy(cs[c].label)) { changed = true; add({ t: 'skillLabel', ref, from: cs[c].label, to: label }, flagsFor(label, sk.label, 'label', ctx)) }
      if (items !== tidy(cs[c].items)) { changed = true; add({ t: 'skillItems', ref, from: cs[c].items, to: items }, flagsFor(items, sk.items, 'items', ctx)) }
      if (!changed) unchanged.skills.push(cs[c].label)
    })
  }

  // Experience.
  const usedJobs = new Set<number>()
  for (const ij of coerceJobs(x.jobs)) {
    const cands = cur.jobs.map((_, i) => i).filter((i) => !usedJobs.has(i) && norm(cur.jobs[i].org) === norm(ij.org))
    const ci = cands.find((i) => norm(cur.jobs[i].dates) === norm(ij.dates ?? '')) ?? cands[0]
    if (ci === undefined) { locked.push({ where: 'Experience', field: 'job not found in your CV, ignored', cur: '', inc: `${ij.title ?? ''} at ${ij.org}` }); continue }
    usedJobs.add(ci)
    const cj = cur.jobs[ci], job = jobKey(cj), w = `Experience: ${cj.org}`
    if (ij.title !== undefined) lock(w, 'job title', cj.title, ij.title)
    if (ij.dates !== undefined) lock(w, 'dates', cj.dates, ij.dates)
    if (ij.location !== undefined) lock(w, 'location', cj.location, ij.location)

    const cb = cj.bullets
    const ib = ij.bullets.map((b) => ({ text: tidy(b.text), raw: b.text, hidden: b.hidden })).filter((b) => b.text)
    const pr = pair(cb.length, ib.length, (c, i) => (tidy(cb[c].text) === ib[i].text ? 1 : dice(toks(cb[c].text), toks(ib[i].text))), 0.3)
    const refOf = (i: number): Ref => [cb[pr[i]].text, ib[i].text]
    const seq = pr.filter((c) => c >= 0)
    if (!ascending(seq)) orders[job] = seq.map((c) => refOf(pr.indexOf(c)))
    unchanged.bullets[job] = []
    let prev: Ref | null = null
    ib.forEach((b, i) => {
      const c = pr[i]
      if (c >= 0) {
        let changed = false
        if (tidy(cb[c].text) !== b.text) { changed = true; add({ t: 'bText', job, ref: refOf(i), from: cb[c].text, to: b.text }, flagsFor(b.text, b.raw, 'bullet', ctx)) }
        if (cb[c].hidden !== b.hidden) { changed = true; add({ t: 'bVis', job, ref: refOf(i), from: cb[c].hidden, to: b.hidden }) }
        if (!changed) unchanged.bullets[job].push(cb[c].text)
        prev = refOf(i)
      } else {
        add({ t: 'bNew', job, to: { text: b.text, hidden: b.hidden }, after: prev }, flagsFor(b.text, b.raw, 'bullet', ctx))
        prev = [b.text]
      }
    })
    // Only suggest hiding omitted bullets when the file clearly covers this job (merges/splits).
    // A short, partial list for a job is treated as "leave the rest alone".
    if (seq.length * 2 >= cb.length) cb.forEach((b, c) => { if (!b.hidden && !pr.includes(c)) add({ t: 'bDrop', job, ref: [b.text] }) })
  }

  // Education and extras: locked, only reported.
  for (const ie of Array.isArray(x.education) ? x.education : []) {
    const ce = cur.education.find((e) => norm(e.org) === norm(S(ie?.org) ?? '\0'))
    if (!ce) { locked.push({ where: 'Education', field: 'entry not found in your CV, ignored', cur: '', inc: S(ie?.degree) ?? '' }); continue }
    for (const k of ['degree', 'dates', 'location', 'details', 'thesis'] as const) { const v = S(ie[k]); if (v !== undefined) lock(`Education: ${ce.org}`, k, ce[k] ?? '', v) }
  }
  for (const ix of Array.isArray(x.extras) ? x.extras : []) {
    const label = S(ix?.label), text = S(ix?.text)
    if (label === undefined || text === undefined) continue
    const ce = cur.extras.find((e) => norm(e.label) === norm(label))
    if (!ce) locked.push({ where: 'Languages and additional information', field: 'new item, ignored', cur: '', inc: `${label}: ${text}` })
    else lock('Languages and additional information', label, ce.text, text)
  }

  const sections = new Set<string>()
  proposals.forEach((p) => sections.add(p.ch.t === 'field' ? p.ch.key : p.ch.t.startsWith('skill') ? 'skills' : 'experience'))
  return { file, raw, proposals, locked, unchanged, orders, sections: [...sections] }
}

// ---------- apply / undo ----------
const findIn = <T,>(arr: T[], ref: Ref, get: (v: T) => string, skip?: Set<number>) =>
  arr.findIndex((v, i) => !skip?.has(i) && ref.includes(get(v)))

export function permute<T>(arr: T[], order: Ref[], get: (v: T) => string) {
  const used = new Set<number>(), idx: number[] = []
  for (const ref of order) { const i = findIn(arr, ref, get, used); if (i >= 0) { used.add(i); idx.push(i) } }
  const items = idx.map((i) => arr[i])
  ;[...idx].sort((a, b) => a - b).forEach((slot, k) => { arr[slot] = items[k] })
  return idx.length > 1
}

/** Can this change still find its target in the resume? Cheap check used to enable Accept. */
export function canApply(r: Resume, ch: Change): boolean {
  switch (ch.t) {
    case 'field': case 'skillNew': return true
    case 'skillLabel': case 'skillItems': return findIn(r.skills, ch.ref, (s) => s.label) >= 0
    default: {
      const j = r.jobs.find((x) => jobKey(x) === ch.job)
      if (!j) return false
      return ch.t === 'bNew' ? true : findIn(j.bullets, ch.ref, (b) => b.text) >= 0
    }
  }
}

/** Applies (or with undo=true, reverts) one change on a draft. Returns false if the target can no longer be found. */
export function applyChange(d: Resume, ch: Change, undo = false): boolean {
  switch (ch.t) {
    case 'field': d[ch.key] = undo ? ch.from : ch.to; return true
    case 'skillLabel': case 'skillItems': {
      const s = d.skills[findIn(d.skills, ch.ref, (v) => v.label)]
      if (!s) return false
      s[ch.t === 'skillLabel' ? 'label' : 'items'] = undo ? ch.from : ch.to
      return true
    }
    case 'skillNew': {
      const same = (s: Skill) => s.label === ch.to.label && s.items === ch.to.items
      if (undo) { const i = d.skills.findIndex(same); if (i < 0) return false; d.skills.splice(i, 1); return true }
      if (!d.skills.some(same)) d.skills.push({ ...ch.to })
      return true
    }
    default: {
      const j = d.jobs.find((x) => jobKey(x) === ch.job)
      if (!j) return false
      if (ch.t === 'bNew') {
        const same = (b: Bullet) => b.text === ch.to.text
        if (undo) { const i = j.bullets.findIndex(same); if (i < 0) return false; j.bullets.splice(i, 1); return true }
        if (j.bullets.some(same)) return true
        const a = ch.after ? findIn(j.bullets, ch.after, (b) => b.text) : -1
        j.bullets.splice(ch.after === null ? 0 : a >= 0 ? a + 1 : j.bullets.length, 0, { ...ch.to })
        return true
      }
      const b = j.bullets[findIn(j.bullets, ch.ref, (v) => v.text)]
      if (!b) return false
      if (ch.t === 'bText') b.text = undo ? ch.from : ch.to
      else if (ch.t === 'bVis') b.hidden = undo ? ch.from : ch.to
      else b.hidden = !undo // bDrop: only ever hides, never deletes
      return true
    }
  }
}

const CHANGE_TYPES = new Set<string>(['field', 'skillLabel', 'skillItems', 'skillNew', 'bText', 'bVis', 'bNew', 'bDrop'])

/** Restores a saved review. Anything from an older format (or damaged) is discarded rather than risked. */
export function loadReview(raw: string | null): Review | null {
  try {
    const v = JSON.parse(raw ?? 'null')
    const ok = v && Array.isArray(v.proposals) && Array.isArray(v.locked) && v.unchanged && v.orders && typeof v.orders === 'object' &&
      v.proposals.every((p: any) => p && CHANGE_TYPES.has(p.ch?.t) && Array.isArray(p.flags) && ['pending', 'accepted', 'rejected'].includes(p.decision))
    return ok ? (v as Review) : null
  } catch { return null }
}
