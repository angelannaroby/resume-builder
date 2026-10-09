import { Workbook } from 'exceljs'
import { expect, it, vi } from 'vitest'
import { requireDirectory, SAVE_FOLDERS, writeFile } from '@/services/fileSystem'
import { addApplication, countApplications, readApplications } from '@/features/application-tracker/applicationTracker'
it('uses the requested folder names',()=>{expect(SAVE_FOLDERS).toEqual({cv:'Save CVs',cl:'Save CLs',info:'ApplicationInfo'})})
it('reuses the selected parent and requests access only when needed',async()=>{
 const root={queryPermission:vi.fn(async()=> 'granted'),requestPermission:vi.fn()}
 expect(await requireDirectory(root)).toBe(root)
 expect(root.requestPermission).not.toHaveBeenCalled()
 await expect(requireDirectory(undefined)).rejects.toThrow('parent folder')
 const denied={queryPermission:async()=> 'denied',requestPermission:async()=> 'denied'}
 await expect(requireDirectory(denied)).rejects.toThrow('Allow access')
})
it('creates the output beneath the parent and aborts a failed write',async()=>{
 const abort=vi.fn(),close=vi.fn(),write=vi.fn(async()=>{throw new Error('Disk full')})
 const child={getFileHandle:vi.fn(async()=>({createWritable:async()=>({abort,close,write})}))}
 const root={getDirectoryHandle:vi.fn(async()=>child)}
 await expect(writeFile(root,'Company_YourName_CV.pdf',new Blob(['pdf']),SAVE_FOLDERS.cv)).rejects.toThrow('Disk full')
 expect(root.getDirectoryHandle).toHaveBeenCalledWith('Save CVs',{create:true})
 expect(abort).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled()
})
it('does not replace an unreadable existing Excel tracker',async()=>{
 const root={getFileHandle:async()=>({getFile:async()=>({arrayBuffer:async()=>new TextEncoder().encode('broken workbook').buffer})})}
 await expect(addApplication(root,{company:'Company',role:'Frontend',link:'',location:''},'Company_YourName_CV.pdf')).rejects.toThrow('Could not read Applications.xlsx')
})

it('counts numbered company rows despite serial gaps and ignores blank or unnumbered rows',async()=>{
 const wb=new Workbook(),ws=wb.addWorksheet('Applications')
 ws.addRow(['No.','Company']);ws.addRow([1,'First']);ws.addRow([24,'Second']);ws.addRow([null,'Draft']);ws.addRow([25,'']);ws.addRow(['footer','Total'])
 const bytes=await wb.xlsx.writeBuffer()
 const root={getFileHandle:async()=>({getFile:async()=>({arrayBuffer:async()=>bytes})})}
 expect(await countApplications(root)).toBe(2)
})
it('shows zero only for a missing tracker and rejects unreadable trackers',async()=>{
 const missing={getFileHandle:async()=>{throw Object.assign(new Error(),{name:'NotFoundError'})}}
 expect(await countApplications(missing)).toBe(0)
 const broken={getFileHandle:async()=>({getFile:async()=>({arrayBuffer:async()=>new TextEncoder().encode('broken').buffer})})}
 await expect(countApplications(broken)).rejects.toThrow()
})

it('reads tracker rows for the in-app Applications view without changing the workbook',async()=>{
 const wb=new Workbook(),ws=wb.addWorksheet('Applications')
 ws.addRow(['No.','Company','Role','Location','Job Link','Interview Call','Applied On','Resume File','Notes'])
 ws.addRow([7,'Manex AI','Frontend Engineer','Munich',{text:'Open job',hyperlink:'https://example.com/job'},'Yes',new Date('2026-10-09T00:00:00Z'),'Manex_AI_YourName_CV.pdf','Follow up'])
 ws.addRow([null,'Draft row'])
 const bytes=await wb.xlsx.writeBuffer()
 const root={getFileHandle:async()=>({getFile:async()=>({arrayBuffer:async()=>bytes})})}
 expect(await readApplications(root)).toEqual([{
   n:7,company:'Manex AI',role:'Frontend Engineer',location:'Munich',jobLink:'https://example.com/job',interviewCall:'Yes',appliedOn:'2026-10-09',resumeFile:'Manex_AI_YourName_CV.pdf',notes:'Follow up'
 }])
})
it('returns an empty Applications view when the tracker does not exist',async()=>{
 const missing={getFileHandle:async()=>{throw Object.assign(new Error(),{name:'NotFoundError'})}}
 expect(await readApplications(missing)).toEqual([])
})
