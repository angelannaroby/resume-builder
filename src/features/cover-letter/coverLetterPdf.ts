import { jsPDF } from 'jspdf'
import { sanitizePdfText, unsupportedCharacters, measureTextWidth } from '@/features/resume/pdf/resumePdf'
import { registerPdfFonts } from '@/features/resume/pdf/pdfFonts'
import type { Resume } from '@/domain/resume'
export interface CoverLetter { name: string; location: string; email: string; phone: string; portfolio: string; subject: string; greeting: string; body: string }
export const initialLetter = (r: Resume): CoverLetter => ({ name: r.name, location: r.location, email: r.email, phone: r.phone, portfolio: r.portfolio, subject: '', greeting: 'Dear Hiring Team,', body: '' })
export function buildCoverLetter(letter: CoverLetter) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', putOnlyUsedFonts: true })
  registerPdfFonts(doc)
  const margin = 52, width = 595.28 - margin * 2, bottom = 790
  const top = 80
  let y = top
  const font = (bold: boolean, size: number) => { doc.setFont('ResumeSans', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(22,22,22) }
  const need = () => { if (y > bottom) { doc.addPage(); y = top } }
  const paragraph = (text: string, size = 12, allBold = false) => {
    let x = margin
    sanitizePdfText(text).split('**').forEach((segment, index) => {
      const bold = allBold || index % 2 === 1
      for (const token of segment.split(/(\s+)/).filter(Boolean)) {
        const t = /^\s+$/.test(token) ? ' ' : token
        const tw = measureTextWidth(t, bold, size)
        if (x > margin && x + tw > margin + width) { y += 17; x = margin }
        if (t === ' ' && x === margin) continue
        if (tw > width) {
          for (const ch of t) { const cw = measureTextWidth(ch, bold, size); if (x + cw > margin + width) { y += 17; x = margin } need(); font(bold,size); doc.text(ch,x,y); x += cw }
        } else { need(); font(bold,size); doc.text(t,x,y); x += tw }
      }
    })
    y += 17
  }
  paragraph(letter.name,16,true)
  for (const line of [letter.location, [letter.email,letter.phone].filter(Boolean).join(' | ')].filter(Boolean)) paragraph(line,11)
  if (letter.portfolio.trim()) {
    const url = /^https?:\/\//i.test(letter.portfolio.trim()) ? letter.portfolio.trim() : 'https://' + letter.portfolio.trim()
    font(false,11); doc.setTextColor(29,78,216); need(); doc.textWithLink('Portfolio',margin,y,{url}); y += 17
  }
  y += 18
  if (letter.subject.trim()) { paragraph('Subject: ' + letter.subject.replace(/^subject\s*:\s*/i,''),12,true); y += 14 }
  if (letter.greeting.trim()) { paragraph(letter.greeting.trim()); y += 10 }
  for (const block of letter.body.replace(/\r\n?/g,'\n').split(/\n\s*\n/)) {
    for (const line of block.split('\n')) paragraph(line)
    y += 10
  }
  if (y + 34 > bottom) { doc.addPage(); y = top }
  paragraph('Kind regards,'); paragraph(letter.name || 'Your Name')
  doc.setProperties({ title: `${letter.name || 'Your Name'} - Cover Letter`, author: letter.name || 'Your Name', subject: letter.subject })
  doc.setLanguage('en-US')
  return { doc, pages: doc.getNumberOfPages(), unsupported: unsupportedCharacters(Object.values(letter).join('\n')) }
}
