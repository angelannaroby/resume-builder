import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { defaultResume } from '@/data/resumeSource'
import { applyChange, buildReview, loadReview } from '@/features/resume/review/reviewEngine'
import type { Proposal } from '@/features/resume/review/reviewEngine'

const tailored = JSON.parse(readFileSync('tests/fixtures/tailored.json', 'utf8'))
const master = () => structuredClone(defaultResume)
const build = (raw: unknown) => buildReview(master(), raw, 'file.json')
const blocked = (p: Proposal) => p.flags.some((f) => f.sev === 'block')

describe('review engine', () => {
  const rv = build(tailored)!

  it('never proposes locked data, only reports it', () => {
    expect(rv.locked.some((l) => l.field === 'phone')).toBe(true)
    expect(rv.locked.some((l) => l.where.startsWith('Education'))).toBe(true)
    expect(rv.locked.some((l) => l.field === 'German')).toBe(true)
    expect(rv.proposals.every((p) => p.ch.t !== 'field' || ['headline', 'summary'].includes(p.ch.key))).toBe(true)
  })

  it('has no category-order proposal; new categories are appended at the end', () => {
    const d = master()
    const before = d.skills.map((s) => s.label)
    for (const p of rv.proposals.filter((x) => x.ch.t === 'skillNew')) applyChange(d, p.ch)
    expect(d.skills.map((s) => s.label).slice(0, before.length)).toEqual(before)
    expect(d.skills.at(-1)!.label).toBe('Working Style')
  })

  it('keeps the suggested bullet order as reference data, not as a proposal', () => {
    expect(rv.proposals.every((p) => p.ch.t !== ('bOrder' as string))).toBe(true)
    expect(Object.keys(rv.orders).length).toBeGreaterThan(0)
  })

  it('visibility proposals say the right thing: hidden -> visible means SHOW', () => {
    const show = rv.proposals.filter((p) => p.ch.t === 'bVis' && p.ch.from === true && p.ch.to === false)
    expect(show.length).toBeGreaterThan(0)
    const d = master()
    for (const p of show) {
      const ch = p.ch as Extract<typeof p.ch, { t: 'bVis' }>
      const bulletOf = () => d.jobs.flatMap((j) => j.bullets).find((b) => ch.ref.includes(b.text))!
      expect(bulletOf().hidden).toBe(true)
      applyChange(d, p.ch)
      expect(bulletOf().hidden).toBe(false)
    }
  })

  it('flags invented numbers, AI wording and dashes; arrows and dashes are normalised', () => {
    const all = rv.proposals.flatMap((p) => p.flags.map((f) => f.msg)).join(' | ')
    expect(all).toMatch(/New number 40%/)
    expect(all).toMatch(/AI wording: passionate/)
    expect(all).toMatch(/Dashes replaced/)
    expect(JSON.stringify(rv.proposals)).not.toMatch(/\u2014|\u2192/)
  })

  it('accepting everything and then undoing returns exactly the original', () => {
    const d = master()
    const all = rv.proposals.filter((p) => !blocked(p))
    all.forEach((p) => expect(applyChange(d, p.ch)).toBe(true))
    expect(JSON.stringify(d)).not.toBe(JSON.stringify(master()))
    ;[...all].reverse().forEach((p) => applyChange(d, p.ch, true))
    expect(d).toEqual(master())
  })

  it('accepting everything leaves locked data untouched', () => {
    const d = master()
    rv.proposals.filter((p) => !blocked(p)).forEach((p) => applyChange(d, p.ch))
    const o = master()
    for (const k of ['name', 'email', 'phone', 'location', 'relocation', 'linkedin', 'github', 'portfolio'] as const) expect(d[k]).toBe(o[k])
    expect(d.education).toEqual(o.education); expect(d.extras).toEqual(o.extras)
    d.jobs.forEach((j, i) => expect([j.title, j.org, j.dates, j.location]).toEqual([o.jobs[i].title, o.jobs[i].org, o.jobs[i].dates, o.jobs[i].location]))
  })

  it('never deletes: a bullet missing from the file is only proposed to be hidden', () => {
    const d = master(); const n = d.jobs.reduce((s, j) => s + j.bullets.length, 0)
    rv.proposals.filter((p) => p.ch.t === 'bDrop').forEach((p) => applyChange(d, p.ch))
    expect(d.jobs.reduce((s, j) => s + j.bullets.length, 0)).toBe(n)
  })
})

describe('input safety', () => {
  it('rejects files that are not resumes', () => {
    for (const bad of [null, 5, 'x', [1, 2], {}, { hello: 1 }]) expect(build(bad)).toBeNull()
  })
  it('accepts a partial file; a long headline is allowed (the PDF wraps it) with a note', () => {
    const rv = build({ headline: 'Frontend Developer ' + '| React.js | TypeScript | Test Automation | Accessibility '.repeat(4) })!
    expect(rv.proposals).toHaveLength(1)
    expect(blocked(rv.proposals[0])).toBe(false)
    expect(rv.proposals[0].flags.map((f) => f.msg)).toContain('Wraps to two lines')
  })
  it('removes characters the PDF cannot show (and says so); unpaired bold markers block', () => {
    const rv = build({ summary: 'A **broken bold ' + 'word '.repeat(40) + '\u{1F680} Gr\u00F6\u00DFe \u010Cesko' })!
    const p = rv.proposals[0]
    expect(p.flags.map((f) => f.msg).join('|')).toMatch(/Removed .*\u{1F680}/u)
    expect(p.flags.map((f) => f.msg)).toContain('Unpaired **')
    expect(blocked(p)).toBe(true)
    const to = (p.ch as { to: string }).to
    expect(to).not.toMatch(/\u{1F680}/u); expect(to).toContain('Gr\u00F6\u00DFe Cesko')
  })
  it('ignores unknown jobs and a partial bullet list leaves the rest alone', () => {
    const rv = build({ jobs: [{ title: 'CTO', org: 'Google', dates: '2020', bullets: [{ text: 'x', hidden: false }] },
      { org: defaultResume.jobs[0].org, dates: defaultResume.jobs[0].dates, bullets: [{ text: 'A brand new bullet about unit tests with Jest.', hidden: false }] }] })!
    expect(rv.locked.some((l) => l.inc.includes('Google'))).toBe(true)
    expect(rv.proposals.filter((p) => p.ch.t === 'bDrop')).toHaveLength(0)
  })
  it('survives odd types and prototype pollution attempts', () => {
    const rv = build({ headline: 42, skills: [{ label: 1, items: null }, 's'], jobs: [{ org: defaultResume.jobs[0].org, bullets: [null, 5, { text: {} }] }], __proto__: { polluted: true } })
    expect(rv).not.toBeNull(); expect(({} as any).polluted).toBeUndefined()
  })
})

describe('saved review', () => {
  it('restores a valid saved review and discards one from an older format', () => {
    const rv = build(tailored)!
    expect(loadReview(JSON.stringify(rv))).not.toBeNull()
    const old = { ...rv, orders: undefined, proposals: [...rv.proposals, { id: 'x', ch: { t: 'bOrder' }, flags: [], decision: 'pending' }] }
    expect(loadReview(JSON.stringify(old))).toBeNull()
    expect(loadReview('not json')).toBeNull(); expect(loadReview(null)).toBeNull()
  })
})
