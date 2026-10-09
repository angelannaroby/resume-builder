import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import App from '@/app/App'
import { defaultResume } from '@/data/resumeSource'
import { buildPdf } from '@/features/resume/pdf/resumePdf'

const tailored = readFileSync('tests/fixtures/tailored.json', 'utf8')
const saved = async () => { await new Promise((r) => setTimeout(r, 600)); return JSON.parse(localStorage.getItem('resume-builder-v1')!) }
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const setup = async (json: string | null = tailored, name = 'tailored.json') => {
  const u = userEvent.setup()
  render(<App />)
  if (json !== null) {
    await u.upload(document.querySelector('input[type=file]') as HTMLInputElement, new File([json], name, { type: 'application/json' }))
    await screen.findByText('Review mode', { selector: '.rvchip' }).catch(() => screen.findByText(/Review mode/))
  }
  return u
}
const group = (name: RegExp | string) => screen.getByRole('group', { name })
const rowOf = (title: string) => [...document.querySelectorAll<HTMLElement>('.row')].find((x) => x.querySelector('strong')?.textContent === title)!

describe('clutter removed', () => {
  it('has no Bold button, no hint text, and no instruction sentences on cards', async () => {
    await setup()
    expect(document.querySelector('button.bold, .boldbtn')).toBeNull()
    expect(screen.queryByLabelText(/Bold the selected text/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/Ctrl\+B|Keep only what you have really used|Nothing to accept here/)
    expect(screen.queryByText(/ATS check/)).toBeNull()
    expect(screen.queryByText(/Accept \d+ safe|Reject all|need a look/)).toBeNull()
  })
  it('Ctrl+B still bolds the selection', async () => {
    const u = await setup(null)
    const ta = document.querySelector('.rich textarea') as HTMLTextAreaElement
    ta.focus(); ta.setSelectionRange(0, 8)
    await u.keyboard('{Control>}b{/Control}')
    expect(ta.value.startsWith('**')).toBe(true)
  })
})

describe('review mode', () => {
  it('shows only a small "Review mode" chip with Discard at the end of the preview lane; nothing is applied on import', async () => {
    await setup(null)
    const before = field('Headline').value
    cleanup(); localStorage.clear()
    await setup()
    const chip = document.querySelector('.lane .rvchip') as HTMLElement
    expect(chip.textContent).toContain('Review mode'); expect(within(chip).getByText('Discard review')).toBeTruthy()
    expect(document.querySelector('.rvstrip')).toBeNull()
    expect(field('Headline').value).toBe(before)
    expect(field('Phone').value).toBe(defaultResume.phone)
  })

  it('card footer: "Show removed words" on the left, Accept and Reject on the right', async () => {
    await setup()
    const foot = group('Proposed summary').querySelector('.rvfoot') as HTMLElement
    expect(foot.firstElementChild!.textContent).toBe('Show removed words')
    expect(foot.lastElementChild!.textContent).toBe('AcceptReject')
  })

  it('accept, undo, reject, restore', async () => {
    const u = await setup()
    const before = field('Headline').value
    await u.click(within(group('Proposed headline')).getByText('Accept'))
    expect(field('Headline').value).toBe('Frontend Developer | React.js | TypeScript | Test Automation')
    await u.click(within(group('Proposed headline: accepted')).getByText('Undo'))
    expect(field('Headline').value).toBe(before)
    await u.click(within(group('Proposed headline')).getByText('Reject'))
    const rej = group('Proposed headline: rejected')
    expect(rej.className).toContain('rejected'); expect(field('Headline').value).toBe(before)
    await u.click(within(rej).getByText('Restore'))
    expect(group('Proposed headline').className).toContain('pending')
  })

  it('"Show removed words" reveals struck-through words', async () => {
    const u = await setup()
    const card = group('Proposed summary')
    expect(card.querySelector('.del')).toBeNull()
    await u.click(within(card).getByText('Show removed words'))
    expect(card.querySelector('.del')).not.toBeNull()
  })

  it('bullet order is not shown in the editor at all (only inside the Reorder window)', async () => {
    await setup()
    expect(screen.queryByRole('group', { name: /bullet order/i })).toBeNull()
    expect(document.body.textContent).not.toMatch(/Proposed bullet order/)
  })

  it('no skill category order proposal exists', async () => {
    await setup()
    expect(screen.queryByRole('group', { name: /category order/i })).toBeNull()
  })

  it('flags are short tags in the header; blocked proposals cannot be accepted', async () => {
    await setup(JSON.stringify({ headline: 'Frontend **Developer | React.js' }), 'bad.json')
    const card = group('Proposed headline')
    expect(card.querySelector('.rvhead .tag.block')?.textContent).toBe('Unpaired **')
    expect((within(card).getByText('Accept') as HTMLButtonElement).disabled).toBe(true)
  })

  it('one-line cards: the title says it all, buttons sit on the same row, and the wording is right', async () => {
    const u = await setup()
    const show = screen.getAllByRole('group', { name: 'Show this bullet in the PDF' })[0]
    expect(show.className).toContain('compact')
    expect(show.querySelector('.txt, .rvfoot')).toBeNull()                    // no second sentence, no footer
    expect(show.querySelector('.rvhead')!.querySelector('.rvbtn')).not.toBeNull() // buttons on the title row
    expect(screen.queryByRole('group', { name: /Proposed: (show|hide)/ })).toBeNull()
    // accepting "Show" really makes the bullet visible again
    const hiddenBefore = document.querySelectorAll('.bullet.off').length
    await u.click(within(show).getByText('Accept'))
    expect(document.querySelectorAll('.bullet.off').length).toBe(hiddenBefore - 1)
  })

  it('a hidden bullet whose wording is accepted is offered "Show" (never "Hide"), and accepting it makes it visible', async () => {
    const u = await setup()
    const groupOf = () => [...document.querySelectorAll<HTMLElement>('.bgroup')].find((g) => g.querySelector('textarea')?.value.startsWith('Created storyboards'))!
    expect(groupOf().querySelector('.bullet')!.className).toContain('off')           // hidden by default
    await u.click(within(groupOf()).getByText('Accept', { selector: '.rv:not(.compact) button' }))   // accept the new wording
    expect(within(groupOf()).getByText(/Accepted/)).toBeTruthy()
    expect(within(groupOf()).getByRole('group', { name: 'Show this bullet in the PDF' })).toBeTruthy()
    expect(within(groupOf()).queryByRole('group', { name: 'Hide this bullet from the PDF' })).toBeNull()
    await u.click(within(within(groupOf()).getByRole('group', { name: 'Show this bullet in the PDF' })).getByText('Accept'))
    expect(groupOf().querySelector('.bullet')!.className).not.toContain('off')       // now shown
    expect((await saved()).jobs[0].bullets.find((b: any) => b.text.startsWith('Created storyboards')).hidden).toBe(false)
  })

  it('survives a reload, and re-importing the current CV says "No differences"', async () => {
    const u = await setup()
    await u.click(within(group('Proposed summary')).getByText('Reject'))
    cleanup(); render(<App />)
    expect(group('Proposed summary: rejected')).toBeTruthy()
    await u.click(screen.getByText('Discard review'))
    expect(screen.queryByText('Review mode')).toBeNull()
    const cur = (await saved())
    await u.upload(document.querySelector('input[type=file]') as HTMLInputElement, new File([JSON.stringify(cur)], 'same.json'))
    await waitFor(() => expect(screen.getByText(/No differences/)).toBeTruthy())
  })
})

describe('skills', () => {
  it('a new category is added at the end and can be hidden; hidden skills leave the PDF', async () => {
    const base = structuredClone(defaultResume)
    base.skills = base.skills.filter(skill => skill.label !== 'Working Style')
    localStorage.setItem('resume-builder-v1', JSON.stringify(base))
    const u = await setup()
    await u.click(within(group('New skill category')).getByText('Accept'))
    const skillRows = Array.from(rowOf('Working Style').parentElement!.querySelectorAll(':scope > .row'))
    expect(skillRows.at(-1)).toBe(rowOf('Working Style'))
    const row = rowOf('Working Style')
    await u.click(within(row).getByLabelText('Shown in PDF. Click to hide'))
    expect(row.className).toContain('off'); expect(within(row).getByText('Hidden')).toBeTruthy()
    const cv = await saved()
    expect(cv.skills.at(-1)).toMatchObject({ label: 'Working Style', hidden: true })
    const hiddenPdf = buildPdf(cv)
    const shown = structuredClone(cv); delete shown.skills.at(-1).hidden
    expect(hiddenPdf.doc.getNumberOfPages()).toBeLessThanOrEqual(buildPdf(shown).doc.getNumberOfPages())
    expect(hiddenPdf.pages).toBeLessThanOrEqual(2)
    await u.click(within(row).getByLabelText('Hidden from PDF. Click to show'))
    expect((await saved()).skills.at(-1).hidden).toBeUndefined()
  })

  it('Reorder categories lets you place a category yourself', async () => {
    const u = await setup(null)
    await u.click(screen.getByRole('button', { name: /Reorder categories/ }))
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).queryByText('Proposed order')).toBeNull()
    await u.click(within(dlg.querySelectorAll('li')[2] as HTMLElement).getByLabelText(/Move up/))
    await u.click(within(dlg).getByText('Save order'))
    const cv = await saved()
    expect(cv.skills.map((s: any) => s.label)).toEqual([0, 2, 1, ...defaultResume.skills.slice(3).map((_, i) => i + 3)].map((i) => defaultResume.skills[i].label))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('bullets', () => {
  it('Reorder bullets lists visible bullets only, shows the proposal on the left, keeps hidden bullets in place', async () => {
    const u = await setup()
    await saved()
    const cvBefore = JSON.parse(localStorage.getItem('resume-builder-v1')!)
    const before = cvBefore.jobs[0].bullets
    await u.click(screen.getAllByRole('button', { name: /Reorder bullets/ })[0])
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).getByText('Proposed order')).toBeTruthy()
    const rows = within(dlg).getByText('Your order').parentElement!.querySelectorAll('li')
    expect(rows.length).toBe(before.filter((b: any) => !b.hidden).length)
    await u.click(within(rows[0] as HTMLElement).getByLabelText(/Move down/))
    await u.click(within(dlg).getByText('Save order'))
    const after = (await saved()).jobs[0].bullets
    expect(after.map((b: any) => b.text).sort()).toEqual(before.map((b: any) => b.text).sort())
    expect([after[0].text, after[1].text]).toEqual([before[1].text, before[0].text])
    before.forEach((b: any, i: number) => { if (b.hidden) expect(after[i].hidden).toBe(true) })
  })
})

describe('integrity', () => {
  it('accepting every non-blocked card keeps the schema and locked data, and the PDF within 2 pages', async () => {
    const u = await setup()
    for (let i = 0; i < 80; i++) {
      const b = [...document.querySelectorAll<HTMLButtonElement>('.rv.pending button.accept')].find((x) => !x.disabled)
      if (!b) break
      await u.click(b)
    }
    const cv = await saved()
    expect(Object.keys(cv)).toEqual(Object.keys(defaultResume))
    cv.jobs.forEach((j: any) => { expect(Object.keys(j)).toEqual(['title', 'org', 'dates', 'location', 'bullets']); j.bullets.forEach((b: any) => expect(Object.keys(b)).toEqual(['text', 'hidden'])) })
    for (const k of ['name', 'email', 'phone', 'location', 'relocation', 'linkedin', 'github', 'portfolio']) expect(cv[k]).toBe((defaultResume as any)[k])
    expect(cv.education).toEqual(defaultResume.education); expect(cv.extras).toEqual(defaultResume.extras)
    const out = buildPdf(cv)
    expect(out.pages).toBeLessThanOrEqual(2)
  })
})
