import type { DirectoryHandle } from "@/services/fileSystem";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { Resume } from "@/domain/resume";
import {
  buildCoverLetter,
  initialLetter,
} from "@/features/cover-letter/coverLetterPdf";
import type { CoverLetter } from "@/features/cover-letter/coverLetterPdf";
import {
  requireDirectory,
  SAVE_FOLDERS,
  writeFile,
} from "@/services/fileSystem";
import {
  coverLetterArchiveName,
  coverLetterBackupName,
  currentCoverLetterName,
} from "@/services/outputFiles";
import { TextField, RichTextArea, EditorSection, Icon, JsonIcon } from "@/shared/ui";
import { SidePane } from "@/features/resume/components/SidePane";
import type { ApplicationDraft } from "@/features/application-notes/ApplicationNotes";

const STORAGE_KEY = "cover-letter-draft-v1";

interface CoverLetterEditorProps {
  resume: Resume;
  folder: DirectoryHandle | undefined;
  showToast: (message: string) => void;
  application: ApplicationDraft;
  setApplication: (next: ApplicationDraft) => void;
  resetSignal?: number;
  onSavingChange?: (busy: boolean) => void;
}

function loadDraft(resume: Resume) {
  const base = initialLetter(resume);
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    for (const key of Object.keys(base) as (keyof CoverLetter)[]) {
      if (typeof stored[key] === "string") base[key] = stored[key];
    }
  } catch {
    // A damaged local draft should not block the editor.
  }
  return base;
}

export function CoverLetterEditor({
  resume,
  folder,
  showToast,
  application,
  setApplication,
  resetSignal = 0,
  onSavingChange,
}: CoverLetterEditorProps) {
  const [letter, setLetter] = useState<CoverLetter>(() => loadDraft(resume));
  const [compiledLetter, setCompiledLetter] = useState(letter);
  const [previewUrl, setPreviewUrl] = useState("");
  const [pages, setPages] = useState(1);
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);

  const uploadRef = useRef<HTMLInputElement>(null);
  const previousRole = useRef("");
  const previousCompany = useRef("");
  const lastReset = useRef(resetSignal);
  const company = application.company;

  useEffect(() => {
    setToolbarTarget(document.getElementById("letter-actions"));
  }, []);

  useEffect(() => {
    if (lastReset.current === resetSignal) return;
    lastReset.current = resetSignal;
    previousRole.current = "";
    previousCompany.current = "";
    const cleared = {
      ...letter,
      subject: "",
      greeting: "Dear Hiring Team,",
      body: "",
    };
    setLetter(cleared);
    setCompiledLetter(cleared);
    if (uploadRef.current) uploadRef.current.value = "";
  }, [letter, resetSignal]);

  useEffect(() => {
    onSavingChange?.(busy);
  }, [busy, onSavingChange]);

  useEffect(() => {
    const previousDefault = previousRole.current
      ? `Application: ${previousRole.current}`
      : "";
    setLetter((current) =>
      !current.subject || current.subject === previousDefault
        ? {
            ...current,
            subject: application.role ? `Application: ${application.role}` : "",
          }
        : current,
    );
    previousRole.current = application.role;
  }, [application.role]);

  useEffect(() => {
    const previousDefault = previousCompany.current
      ? `Dear ${previousCompany.current} Team,`
      : "Dear Hiring Team,";
    const nextDefault = company.trim()
      ? `Dear ${company.trim()} Team,`
      : "Dear Hiring Team,";

    setLetter((current) =>
      !current.greeting || current.greeting === previousDefault
        ? { ...current, greeting: nextDefault }
        : current,
    );
    previousCompany.current = company.trim();
  }, [company]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(letter));
  }, [letter]);

  useEffect(() => {
    const output = buildCoverLetter(compiledLetter);
    const nextUrl = URL.createObjectURL(output.doc.output("blob"));
    setPreviewUrl(nextUrl);
    setPages(output.pages);
    setUnsupported(output.unsupported);
    return () => URL.revokeObjectURL(nextUrl);
  }, [compiledLetter]);

  const updateField = (key: keyof CoverLetter) => (value: string) => {
    setLetter((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!company.trim() || !letter.body.trim()) {
      showToast("Enter the cover-letter company and body.");
      return;
    }
    if (!folder) {
      showToast("Choose your save folder first.");
      return;
    }
    if (buildCoverLetter(letter).unsupported.length) {
      showToast("Remove unsupported characters before saving.");
      return;
    }

    setBusy(true);
    let savedCopies = 0;
    try {
      await requireDirectory(folder);
      const archiveDir = await folder.getDirectoryHandle(SAVE_FOLDERS.cl, {
        create: true,
      });
      const archiveName = coverLetterArchiveName(company, letter.name);
      const currentName = currentCoverLetterName(letter.name);

      let exists = false;
      try {
        await archiveDir.getFileHandle(archiveName);
        exists = true;
      } catch (error) {
        if ((error as Error).name !== "NotFoundError") throw error;
      }

      if (exists && !confirm(`Replace ${archiveName}?`)) return;

      setCompiledLetter(structuredClone(letter));
      const blob = buildCoverLetter(letter).doc.output("blob");
      await writeFile(archiveDir, archiveName, blob);
      savedCopies += 1;
      await writeFile(folder, currentName, blob);
      savedCopies += 1;
      showToast(`Saved ${archiveName} in ${SAVE_FOLDERS.cl} and replaced ${currentName}.`);
    } catch (error) {
      showToast(
        `${savedCopies ? "Company copy saved. " : ""}Could not finish saving: ${(error as Error).message}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            type: "cover-letter",
            version: 1,
            company,
            role: application.role,
            letter,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = coverLetterBackupName(letter.name);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(
        [
          letter.greeting.trim(),
          letter.body.replace(/\*\*/g, "").trim(),
          `Kind regards,\n${letter.name || "Your Name"}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
      showToast("Copied letter text.");
    } catch {
      showToast("Clipboard access failed. Copy from the editor.");
    }
  };

  const importBackup = async (file: File) => {
    const parsed = JSON.parse(await file.text());
    if (parsed?.letter && typeof parsed.letter.greeting !== "string") {
      parsed.letter.greeting = parsed.company?.trim()
        ? `Dear ${parsed.company.trim()} Team,`
        : "Dear Hiring Team,";
    }

    const requiredKeys = Object.keys(initialLetter(resume));
    if (
      parsed.type !== "cover-letter" ||
      typeof parsed.company !== "string" ||
      !parsed.letter ||
      requiredKeys.some((key) => typeof parsed.letter[key] !== "string")
    ) {
      throw new Error("Invalid cover-letter backup");
    }

    setLetter(parsed.letter);
    setApplication({
      ...application,
      company: parsed.company,
      role: typeof parsed.role === "string" ? parsed.role : application.role,
    });
    showToast("Cover-letter draft imported.");
  };

  const toolbar = (
    <div className="actions">
      <button className="tool" onClick={copyText}>
        <Icon d="M9 9h11v11H9zM5 15H4V4h11v1" />
        Copy text
      </button>
      <button className="tool" onClick={() => uploadRef.current?.click()}>
        <JsonIcon direction="import" />
        Import
      </button>
      <button className="tool" onClick={exportBackup}>
        <JsonIcon direction="export" />
        Export
      </button>
      <button className="primary" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save CL"}
      </button>
    </div>
  );

  return (
    <main>
      <div className="editor">
        <div className="editor-head">
          <h1>Edit cover letter</h1>
        </div>

        <EditorSection t="Subject (optional)" open>
          <div className="subject-input">
            <span>Subject:</span>
            <input
              aria-label="Subject"
              value={letter.subject}
              onChange={(event) => updateField("subject")(event.target.value)}
            />
          </div>
        </EditorSection>

        <EditorSection t="Letter content" open>
          <TextField l="Greeting" v={letter.greeting} on={updateField("greeting")} />
          <RichTextArea rows={20} v={letter.body} on={updateField("body")} />
          <p>
            Kind regards,
            <br />
            {letter.name || "Your Name"}
          </p>
        </EditorSection>

        <EditorSection t="Header information">
          <div className="two">
            <TextField l="Header name" v={letter.name} on={updateField("name")} />
            <TextField
              l="Header location"
              v={letter.location}
              on={updateField("location")}
            />
          </div>
          <div className="two">
            <TextField l="Header email" v={letter.email} on={updateField("email")} />
            <TextField l="Header phone" v={letter.phone} on={updateField("phone")} />
          </div>
          <TextField
            l="Header portfolio"
            v={letter.portfolio}
            on={updateField("portfolio")}
          />
        </EditorSection>

        {pages > 1 && (
          <p role="status">
            This cover letter is {pages} pages. Shorten the content if you want one
            page.
          </p>
        )}
        {unsupported.length > 0 && (
          <p role="alert">
            Unsupported characters: {unsupported.join(" ")}. Remove these before
            saving.
          </p>
        )}

        {toolbarTarget ? createPortal(toolbar, toolbarTarget) : toolbar}
        <input
          hidden
          ref={uploadRef}
          type="file"
          accept=".json,application/json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try {
              await importBackup(file);
            } catch (error) {
              showToast((error as Error).message);
            }
          }}
        />
      </div>

      <SidePane
        pageLimit={null}
        onCompile={() => setCompiledLetter(structuredClone(letter))}
        dirty={JSON.stringify(letter) !== JSON.stringify(compiledLetter)}
        url={previewUrl}
        pages={pages}
        review={null}
      />
    </main>
  );
}
