import { afterEach, beforeEach, vi } from 'vitest'

// Browser-only setup. The PDF tests run in plain Node and skip all of this.
const browser = typeof window !== 'undefined'
if (browser) {
  // jsdom lacks File.text()
  if (!(File.prototype as any).text) {
    ;(File.prototype as any).text = function (this: Blob) {
      return new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(this) })
    }
  }
  beforeEach(() => {
    localStorage.clear()
    ;(URL as any).createObjectURL = () => 'blob:test'
    ;(URL as any).revokeObjectURL = () => {}
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(async () => {
    const { cleanup } = await import('@testing-library/react')
    cleanup(); vi.restoreAllMocks()
  })
}
