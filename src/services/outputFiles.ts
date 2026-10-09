import { compactName, toSafeFilenamePart } from "./fileSystem";

export function resumeArchiveName(company: string, owner: string) {
  return `${toSafeFilenamePart(company, "Company")}_${compactName(owner)}_CV.pdf`;
}

export function currentResumeName(owner: string) {
  return `${compactName(owner)}_CV.pdf`;
}

export function coverLetterArchiveName(company: string, owner: string) {
  return `${toSafeFilenamePart(company, "Company")}_${compactName(owner)}_CoverLetter.pdf`;
}

export function currentCoverLetterName(owner: string) {
  return `${compactName(owner)}_CoverLetter.pdf`;
}

export function coverLetterBackupName(owner: string) {
  return `${compactName(owner)}_CoverLetter_backup.json`;
}
