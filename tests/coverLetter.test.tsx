import { expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApplicationNotes } from '@/features/application-notes/ApplicationNotes'
import { CoverLetterEditor } from '@/features/cover-letter/CoverLetterEditor'
import { defaultResume } from '@/data/resumeSource'
import { buildCoverLetter, initialLetter } from '@/features/cover-letter/coverLetterPdf'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { coverLetterArchiveName, currentCoverLetterName, resumeArchiveName, currentResumeName } from '@/services/outputFiles'
function folderMock() {
 const writes: Record<string,Blob> = {}
 const dirs: string[] = []
 const folder:any={queryPermission:async()=> 'granted',getDirectoryHandle:async(name:string)=>{dirs.push(name);return folder},getFileHandle:async(name:string,options?:{create?:boolean})=>{if(!options?.create)throw new DOMException('Missing','NotFoundError');return {createWritable:async()=>({write:async(data:Blob)=>{writes[name]=data},close:async()=>{}})}}}
 return {folder,writes,dirs}
}
it('saves JD and notes independently without generating a PDF or tracker',async()=>{
 const {folder,writes,dirs}=folderMock(),say=vi.fn()
 render(<ApplicationNotes draft={{company:'Manex',role:'Frontend',jd:'React required',notes:'Available immediately'}} setDraft={vi.fn()} folder={folder} showToast={say}/> )
 await userEvent.click(screen.getByText('Save JD & notes'))
 await waitFor(()=>expect(say).toHaveBeenCalled())
 expect(Object.keys(writes)).toEqual(['Manex_Application_Notes.txt'])
 expect(dirs).toEqual(['ApplicationInfo'])
})
it('saves identical generated CL bytes to current and archived copies',async()=>{
 const {folder,writes,dirs}=folderMock(),say=vi.fn()
 render(<CoverLetterEditor resume={defaultResume} folder={folder} showToast={say} application={{company:"Manex",role:"",jd:"",notes:""}} setApplication={vi.fn()}/> )
 const u=userEvent.setup()
 await u.type(document.querySelector('.rich textarea') as HTMLTextAreaElement,'Dear Hiring Team,\n\nI build **React** interfaces.')
 await u.click(screen.getByText('Save CL'))
 await waitFor(()=>expect(say).toHaveBeenCalled())
 const archived=coverLetterArchiveName('Manex',defaultResume.name),current=currentCoverLetterName(defaultResume.name)
 expect(Object.keys(writes)).toEqual([archived,current])
 expect(writes[archived]).toBe(writes[current])
 expect(dirs).toEqual(['Save CLs'])
})
it('generates extractable bold text, fixed closing, A4 and embedded Unicode fonts',async()=>{
 const letter={...initialLetter(defaultResume),subject:'Application: Frontend',body:'I build **React** interfaces. Grüße.'}
 const out=buildCoverLetter(letter),raw=out.doc.output()
 expect(raw.match(/\/FontFile2/g)).toHaveLength(2)
 expect(raw.match(/\/ToUnicode/g)).toHaveLength(2)
 const pdf=await getDocument({data:new Uint8Array(out.doc.output('arraybuffer')),useSystemFonts:true}).promise
 const page=await pdf.getPage(1),items=await page.getTextContent(),text=items.items.map((x:any)=>x.str).join(' ')
 expect(text).toContain('Subject: Application: Frontend');expect(text).toContain('Dear Hiring Team,');
 const annotations=await page.getAnnotations(); expect(annotations.some((x:any)=>x.url===`https://${defaultResume.portfolio}/`)).toBe(true);
 expect(text).toContain('Portfolio');
 expect(text).toContain('React');expect(text).toContain('Grüße');expect(text).not.toContain('**')
 expect(text).toContain('Kind regards,');expect(text).toContain(defaultResume.name)
 expect(page.view[2]).toBeCloseTo(595.28,1)
 await pdf.destroy()
})
it('flows long content onto more pages without truncating its final paragraph',async()=>{
 const out=buildCoverLetter({...initialLetter(defaultResume),body:'Long paragraph with **bold** content.\n\n'.repeat(100)+'Final paragraph.'})
 expect(out.pages).toBeGreaterThan(1)
 const pdf=await getDocument({data:new Uint8Array(out.doc.output('arraybuffer')),useSystemFonts:true}).promise
 const texts=[]
 for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);texts.push((await page.getTextContent()).items.map((x:any)=>x.str).join(' '))}
 expect(texts.join(' ')).toContain('Final paragraph.')
 await pdf.destroy()
})
it('retains JD and cover-letter drafts when switching editors',async()=>{
 const {default:App}=await import('@/app/App')
 const u=userEvent.setup();render(<App/> )
 await u.click(screen.getByRole('button',{name:'Application JD & notes'}))
 await u.type(screen.getByLabelText('Paste JD'),'React job description')
 await u.click(screen.getByRole('button',{name:'Edit Cover Letter'}))
 const letterMain=screen.getByRole('heading',{name:'Edit cover letter'}).closest('main')!
 await u.type(letterMain.querySelector('.rich textarea') as HTMLTextAreaElement,'Dear Hiring Team, draft letter.')
 await u.click(screen.getByRole('button',{name:'Edit Resume'}))
 expect(screen.getByRole('heading',{name:'Edit resume'})).toBeTruthy()
 await u.click(screen.getByRole('button',{name:'Edit Cover Letter'}))
 expect((letterMain.querySelector('.rich textarea') as HTMLTextAreaElement).value).toBe('Dear Hiring Team, draft letter.')
 await u.click(screen.getByRole('button',{name:'Application JD & notes'}))
 expect((screen.getByLabelText('Paste JD') as HTMLTextAreaElement).value).toBe('React job description')
})

it('does not refresh the PDF while typing; compilation updates the preview',async()=>{
 const {folder}=folderMock()
 const create=vi.spyOn(URL,'createObjectURL')
 render(<CoverLetterEditor resume={defaultResume} folder={folder} showToast={vi.fn()} application={{company:'Test',role:'',jd:'',notes:''}} setApplication={vi.fn()}/> )
 const before=create.mock.calls.length,u=userEvent.setup()
 await u.type(document.querySelector('.rich textarea') as HTMLTextAreaElement,'Several typed characters')
 expect(create.mock.calls.length).toBe(before)
 await u.click(screen.getByRole('button',{name:/Compile preview/}))
 expect(create.mock.calls.length).toBe(before+1)
})
it('prefills the cover-letter greeting from the shared company and keeps custom edits',async()=>{
 const {default:App}=await import('@/app/App')
 render(<App/>);const u=userEvent.setup()
 await u.click(screen.getByRole('button',{name:'Application JD & notes'}))
 await u.type(screen.getByLabelText('Application company'),'Manex AI')
 await u.click(screen.getByRole('button',{name:'Edit Cover Letter'}))
 const greeting=screen.getByLabelText('Greeting') as HTMLInputElement
 expect(greeting.value).toBe('Dear Manex AI Team,')
 await u.clear(greeting);await u.type(greeting,'Dear Product Team,')
 await u.click(screen.getByRole('button',{name:'Application JD & notes'}))
 await u.clear(screen.getByLabelText('Application company'));await u.type(screen.getByLabelText('Application company'),'Other Company')
 await u.click(screen.getByRole('button',{name:'Edit Cover Letter'}))
 expect((screen.getByLabelText('Greeting') as HTMLInputElement).value).toBe('Dear Product Team,')
})

it('shares application company and role with CV saving and the CL subject',async()=>{
 const {default:App}=await import('@/app/App')
 render(<App/>);const u=userEvent.setup()
 await u.click(screen.getByRole('button',{name:'Application JD & notes'}))
 await u.type(screen.getByLabelText('Application company'),'NewCompany')
 await u.type(screen.getByLabelText('Application role'),'Frontend Engineer')
 await u.click(screen.getByRole('button',{name:'Edit Cover Letter'}))
 expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Application: Frontend Engineer')
 await u.click(screen.getByRole('button',{name:'Edit Resume'}))
 await u.click(screen.getByRole('button',{name:'Save CV'}))
 expect((screen.getByLabelText('Company (required)') as HTMLInputElement).value).toBe('NewCompany')
 expect((screen.getByLabelText('Role') as HTMLInputElement).value).toBe('Frontend Engineer')
})

it('places contextual save and JSON actions in the app header',async()=>{
 const {default:App}=await import('@/app/App')
 render(<App/>);const u=userEvent.setup()
 await u.click(screen.getByRole('button',{name:'Edit Cover Letter'}))
 const header=document.querySelector('header')!
 expect(within(header).getByRole('button',{name:'Save CL'})).toBeTruthy()
 expect(within(header).getByRole('button',{name:'Import',exact:true})).toBeTruthy()
 expect(within(header).getByRole('button',{name:'Export',exact:true})).toBeTruthy()
 await u.click(screen.getByRole('button',{name:'Application JD & notes'}))
 expect(within(header).getByRole('button',{name:'Save JD & notes'})).toBeTruthy()
 expect(within(header).queryByLabelText('Application company')).toBeNull()
})
it('starts a new application by clearing all job-specific drafts and restoring the default CV',async()=>{
 const {default:App}=await import('@/app/App')
 const u=userEvent.setup();render(<App/> )
 await u.click(screen.getByRole('button',{name:'Application JD & notes'}))
 await u.type(screen.getByLabelText('Application company'),'Previous company')
 await u.type(screen.getByLabelText('Application role'),'Previous role')
 await u.type(screen.getByLabelText('Paste JD'),'Old JD')
 await u.type(screen.getByLabelText('Notes'),'Old motivation')
 await u.click(screen.getByRole('button',{name:'Edit Cover Letter'}))
 const letterMain=screen.getByRole('heading',{name:'Edit cover letter'}).closest('main')!
 await u.type(letterMain.querySelector('.rich textarea') as HTMLTextAreaElement,'Old letter')
 await u.click(screen.getByRole('button',{name:'Edit Resume'}))
 await u.clear(screen.getByLabelText('Headline'));await u.type(screen.getByLabelText('Headline'),'Tailored headline')
 vi.mocked(window.confirm).mockReturnValueOnce(false)
 await u.click(screen.getByRole('button',{name:'New application'}))
 expect((screen.getByLabelText('Headline') as HTMLInputElement).value).toBe('Tailored headline')
 await u.click(screen.getByRole('button',{name:'New application'}))
 expect((screen.getByLabelText('Application company') as HTMLInputElement).value).toBe('')
 expect((screen.getByLabelText('Application role') as HTMLInputElement).value).toBe('')
 expect((screen.getByLabelText('Paste JD') as HTMLTextAreaElement).value).toBe('')
 expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('')
 expect((screen.getByLabelText('Headline') as HTMLInputElement).value).toBe(defaultResume.headline)
 await u.click(screen.getByRole('button',{name:'Edit Cover Letter'}))
 expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('')
 expect((letterMain.querySelector('.rich textarea') as HTMLTextAreaElement).value).toBe('')
 expect(screen.queryByRole('button',{name:'Clear letter'})).toBeNull()
})
it('one confirmed Save CV writes both identical PDF copies and the tracker',async()=>{
 const store=await import('@/services/fileSystem')
 const {folder,writes,dirs}=folderMock()
 vi.spyOn(store,'getSavedDirectory').mockResolvedValue(folder)
 const {default:App}=await import('@/app/App')
 render(<App/>);const u=userEvent.setup()
 await u.click(screen.getByRole('button',{name:'Application JD & notes'}))
 await u.type(screen.getByLabelText('Application company'),'Test company')
 await u.click(screen.getByRole('button',{name:'Edit Resume'}))
 await u.click(screen.getByRole('button',{name:'Save CV'}))
 const modal=document.querySelector('.modal')!
 await u.click(within(modal).getByRole('button',{name:'Save CV'}))
 await waitFor(()=>expect(writes['Applications.xlsx']).toBeTruthy())
 expect(writes[resumeArchiveName('Test company',defaultResume.name)]).toBe(writes[currentResumeName(defaultResume.name)])
 expect(dirs).toEqual(['Save CVs','Save CVs'])
 expect(screen.queryByRole('button',{name:/Download .*_CV.pdf/})).toBeNull()
})
it('resume-only Reset preserves application and CL drafts and respects cancellation',async()=>{
 const {default:App}=await import('@/app/App')
 render(<App/>);const u=userEvent.setup()
 await u.click(screen.getByRole('button',{name:'Application JD & notes'}))
 await u.type(screen.getByLabelText('Application company'),'Keep company')
 await u.type(screen.getByLabelText('Application role'),'Keep role')
 await u.type(screen.getByLabelText('Paste JD'),'Keep JD')
 await u.type(screen.getByLabelText('Notes'),'Keep notes')
 await u.click(screen.getByRole('button',{name:'Edit Cover Letter'}))
 const letterMain=screen.getByRole('heading',{name:'Edit cover letter'}).closest('main')!
 await u.type(letterMain.querySelector('.rich textarea') as HTMLTextAreaElement,'Keep letter')
 await u.click(screen.getByRole('button',{name:'Edit Resume'}))
 await u.clear(screen.getByLabelText('Headline'));await u.type(screen.getByLabelText('Headline'),'Temporary headline')
 vi.mocked(window.confirm).mockReturnValueOnce(false)
 await u.click(screen.getByRole('button',{name:'Reset',exact:true}))
 expect((screen.getByLabelText('Headline') as HTMLInputElement).value).toBe('Temporary headline')
 await u.click(screen.getByRole('button',{name:'Reset',exact:true}))
 expect((screen.getByLabelText('Headline') as HTMLInputElement).value).toBe(defaultResume.headline)
 expect((screen.getByLabelText('Application company') as HTMLInputElement).value).toBe('Keep company')
 expect((screen.getByLabelText('Application role') as HTMLInputElement).value).toBe('Keep role')
 expect((screen.getByLabelText('Paste JD') as HTMLTextAreaElement).value).toBe('Keep JD')
 expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Keep notes')
 await u.click(screen.getByRole('button',{name:'Edit Cover Letter'}))
 expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Application: Keep role')
 expect((letterMain.querySelector('.rich textarea') as HTMLTextAreaElement).value).toBe('Keep letter')
})
