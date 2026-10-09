import type { DirectoryHandle } from "@/services/fileSystem";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import {
  requireDirectory,
  SAVE_FOLDERS,
  toSafeFilenamePart,
  writeFile,
} from "@/services/fileSystem";
import { TextField, EditorSection } from "@/shared/ui";

const STORAGE_KEY = "application-draft-v1";
const NOTES_LIMIT = 1_500;

export interface ApplicationDraft {
  company: string;
  role: string;
  jd: string;
  notes: string;
}

const emptyDraft = (): ApplicationDraft => ({
  company: "",
  role: "",
  jd: "",
  notes: "",
});

function loadDraft(): ApplicationDraft {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      company: typeof parsed.company === "string" ? parsed.company : "",
      role: typeof parsed.role === "string" ? parsed.role : "",
      jd: typeof parsed.jd === "string" ? parsed.jd : "",
      notes:
        typeof parsed.notes === "string"
          ? parsed.notes.slice(0, NOTES_LIMIT)
          : "",
    };
  } catch {
    return emptyDraft();
  }
}

export function useApplicationDraft() {
  const [draft, setDraft] = useState<ApplicationDraft>(loadDraft);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  return [draft, setDraft] as const;
}

interface ApplicationNotesProps {
  draft: ApplicationDraft;
  setDraft: (next: ApplicationDraft) => void;
  folder: DirectoryHandle | undefined;
  showToast: (message: string) => void;
  onSavingChange?: (busy: boolean) => void;
}

export function ApplicationNotes({
  draft,
  setDraft,
  folder,
  showToast,
  onSavingChange,
}: ApplicationNotesProps) {
  const [busy, setBusy] = useState(false);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    onSavingChange?.(busy);
  }, [busy, onSavingChange]);

  useEffect(() => {
    setToolbarTarget(document.getElementById("application-actions"));
  }, []);

  const save = async () => {
    if (!draft.company.trim() || (!draft.jd.trim() && !draft.notes.trim())) {
      showToast("Enter the company and a JD or notes.");
      return;
    }
    if (!folder) {
      showToast("Choose your save folder first.");
      return;
    }

    setBusy(true);
    try {
      await requireDirectory(folder);
      const directory = await folder.getDirectoryHandle(SAVE_FOLDERS.info, {
        create: true,
      });
      const filename = `${toSafeFilenamePart(draft.company)}_Application_Notes.txt`;

      let exists = false;
      try {
        await directory.getFileHandle(filename);
        exists = true;
      } catch (error) {
        if ((error as Error).name !== "NotFoundError") throw error;
      }

      if (exists && !confirm(`Replace ${filename}?`)) return;

      const content = [
        `Company: ${draft.company.trim()}`,
        draft.role.trim() ? `Role: ${draft.role.trim()}` : "",
        draft.jd.trim() ? `JOB DESCRIPTION\n\n${draft.jd}` : "",
        draft.notes.trim()
          ? `APPLICATION NOTES / MOTIVATION\n\n${draft.notes}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      await writeFile(
        directory,
        filename,
        new Blob([content], { type: "text/plain;charset=utf-8" }),
      );
      showToast(`Saved ${filename} in ${SAVE_FOLDERS.info}.`);
    } catch (error) {
      showToast(`Could not save application notes: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveButton = (
    <button className="primary" disabled={busy} onClick={save}>
      {busy ? "Saving…" : "Save JD & notes"}
    </button>
  );

  return (
    <main className="notes-main">
      <div className="editor">
        <div className="editor-head">
          <h1>Application JD &amp; notes</h1>
        </div>

        <EditorSection t="Application details" open>
          <div className="two application-details">
            <TextField
              l="Application company"
              v={draft.company}
              on={(company) => setDraft({ ...draft, company })}
            />
            <TextField
              l="Application role"
              v={draft.role}
              on={(role) => setDraft({ ...draft, role })}
            />
          </div>
        </EditorSection>

        <EditorSection t="Job description" open>
          <label className="cl-field">
            Paste JD
            <textarea
              rows={18}
              value={draft.jd}
              onChange={(event) =>
                setDraft({ ...draft, jd: event.target.value })
              }
            />
          </label>
        </EditorSection>

        <EditorSection t="Application notes / motivation" open>
          <label className="cl-field">
            Notes
            <textarea
              rows={8}
              maxLength={NOTES_LIMIT}
              value={draft.notes}
              onChange={(event) =>
                setDraft({ ...draft, notes: event.target.value })
              }
            />
          </label>
          <p className="muted">
            {draft.notes.length} / {NOTES_LIMIT} characters
          </p>
        </EditorSection>

        {toolbarTarget ? createPortal(saveButton, toolbarTarget) : saveButton}
      </div>
    </main>
  );
}
