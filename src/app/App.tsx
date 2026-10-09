import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { buildPdf } from "@/features/resume/pdf/resumePdf";
import { defaultResume, normalizeResume } from "@/data/resumeSource";
import {
  canPickDirectory,
  getSavedDirectory,
  pickDirectory,
  writeFile,
  requireDirectory,
  SAVE_FOLDERS,
} from "@/services/fileSystem";
import type { DirectoryHandle } from "@/services/fileSystem";
import { addApplication, countApplications } from "@/features/application-tracker/applicationTracker";
import type { ApplicationInfo } from "@/features/application-tracker/applicationTracker";
import { currentResumeName, resumeArchiveName } from "@/services/outputFiles";
import type { Resume } from "@/domain/resume";
import { useReview } from "@/features/resume/review/useReview";
import { SaveDialog } from "@/features/resume/components/SaveDialog";
import { CoverLetterEditor } from "@/features/cover-letter/CoverLetterEditor";
import { ApplicationNotes, useApplicationDraft } from "@/features/application-notes/ApplicationNotes";
import { ApplicationsView } from "@/features/application-tracker/ApplicationsView";
import { Icon, JsonIcon, iconPaths } from "@/shared/ui";
import { ResumeEditor } from "@/features/resume/ResumeEditor";

const RESUME_STORAGE_KEY = "resume-builder-v1";
const createDefaultResume = () => structuredClone(defaultResume);
const loadResume = (): Resume => {
  try {
    return (
      normalizeResume(JSON.parse(localStorage.getItem(RESUME_STORAGE_KEY) ?? "null")) ?? createDefaultResume()
    );
  } catch {
    return createDefaultResume();
  }
};
const downloadBlob = (blob: Blob, name: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const EMPTY_APPLICATION: ApplicationInfo = { company: "", role: "", link: "", location: "" };

export default function App() {
  const [resume, setResume] = useState<Resume>(loadResume);
  const [previewUrl, setPreviewUrl] = useState("");
  const [pages, setPages] = useState(1);
  const [folder, setFolder] = useState<DirectoryHandle>();
  const [applicationCount, setApplicationCount] = useState<number | null>(null);
  const [trackerRefresh, setTrackerRefresh] = useState(0);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savingCV, setSavingCV] = useState(false);
  const [savingCL, setSavingCL] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [workspace, setWorkspace] = useState<"resume" | "letter" | "application" | "tracker">(
    "resume",
  );
  const [applicationDraft, setApplicationDraft] = useApplicationDraft();
  const [applicationDetails, setApplicationDetails] = useState<ApplicationInfo>(EMPTY_APPLICATION);
  const applicationInfo = {
    ...applicationDetails,
    company: applicationDraft.company,
    role: applicationDraft.role,
  };
  const updateApplicationInfo = (next: ApplicationInfo) => {
    setApplicationDetails(next);
    setApplicationDraft({
      ...applicationDraft,
      company: next.company,
      role: next.role,
    });
  };
  const [compiledResume, setCompiledResume] = useState(resume);
  const [toast, setToast] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 5000);
  };
  const review = useReview(resume, setResume, showToast);

  useEffect(() => {
    getSavedDirectory().then(setFolder);
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        if (
          !folder ||
          (await folder.queryPermission({ mode: "readwrite" })) !== "granted"
        ) {
          if (active) setApplicationCount(null);
          return;
        }
        const count = await countApplications(folder);
        if (active) setApplicationCount(count);
      } catch {
        if (active) setApplicationCount(null);
      }
    };
    setApplicationCount(null);
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, [folder, trackerRefresh]);
  useEffect(() => {
    try {
      localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(resume));
    } catch {}
  }, [resume]);
  useEffect(() => {
    const out = buildPdf(compiledResume);
    setPages(out.pages);
    const u = URL.createObjectURL(out.doc.output("blob"));
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [compiledResume]);

  const ownerFileStem = resume.name.replace(/\s+/g, "") || "Resume";
  const currentResumeFile = currentResumeName(resume.name);
  const buildResumeBlob = () => {
    setCompiledResume(structuredClone(resume));
    return buildPdf(resume).doc.output("blob");
  };

  const chooseFolder = async () => {
    try {
      setFolder(await pickDirectory());
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        showToast(
          `Could not remember the parent folder: ${(error as Error).message}`,
        );
    }
  };
  const saveResume = async (e: FormEvent) => {
    e.preventDefault();
    if (savingCV) return;
    if (!applicationInfo.company.trim()) {
      showToast("Enter a company name.");
      return;
    }
    const name = resumeArchiveName(applicationInfo.company, resume.name);
    setSavingCV(true);
    let savedCV = false;
    let savedCurrent = false;
    try {
      const dir = await requireDirectory(folder);
      const archive = await dir.getDirectoryHandle(SAVE_FOLDERS.cv, {
        create: true,
      });
      let exists = false;
      try {
        await archive.getFileHandle(name);
        exists = true;
      } catch (error) {
        if ((error as Error).name !== "NotFoundError") throw error;
      }
      if (exists && !confirm(`Replace ${name} and add another tracker entry?`))
        return;
      const sheet = await addApplication(
        dir,
        { ...applicationInfo, company: applicationInfo.company.trim() },
        name,
      );
      const blob = buildResumeBlob();
      await writeFile(dir, name, blob, SAVE_FOLDERS.cv);
      savedCV = true;
      await writeFile(dir, currentResumeFile, blob);
      savedCurrent = true;
      await writeFile(dir, "Applications.xlsx", sheet);
      setTrackerRefresh((value) => value + 1);
      showToast(
        `Saved ${name} in ${SAVE_FOLDERS.cv} and replaced ${currentResumeFile}; updated Applications.xlsx.`,
      );
      setSaveDialogOpen(false);
    } catch (err) {
      showToast(
        `${savedCV ? (savedCurrent ? "Both CV copies saved. " : "Company CV copy saved. ") : ""}Could not finish saving: ${(err as Error).message}`,
      );
    } finally {
      setSavingCV(false);
    }
  };

  const resetResume = () => {
    if (savingCV || savingCL || savingNotes) return;
    if (
      !confirm(
        "Reset only the resume to its default content? CV tailoring and its JSON review will be cleared. Application details, JD, notes, cover letter and saved files stay intact.",
      )
    )
      return;
    const base = createDefaultResume();
    for (const key of [
      "name",
      "email",
      "phone",
      "location",
      "relocation",
      "linkedin",
      "github",
      "portfolio",
    ] as const)
      base[key] = resume[key];
    review.reset();
    setResume(base);
    setCompiledResume(structuredClone(base));
    showToast("Resume reset.");
  };

  const newApplication = () => {
    if (savingCV || savingCL || savingNotes) return;
    if (
      !confirm(
        "Start a new application? This clears company, role, JD, notes, cover-letter body/subject and CV tailoring. The CV returns to the default resume. Saved files and your chosen folder stay intact.",
      )
    )
      return;
    const base = createDefaultResume();
    for (const key of [
      "name",
      "email",
      "phone",
      "location",
      "relocation",
      "linkedin",
      "github",
      "portfolio",
    ] as const)
      base[key] = resume[key];
    review.reset();
    setResume(base);
    setCompiledResume(structuredClone(base));
    setApplicationDraft({ company: "", role: "", jd: "", notes: "" });
    setApplicationDetails(EMPTY_APPLICATION);
    setSaveDialogOpen(false);
    setResetSignal((value) => value + 1);
    setWorkspace("application");
    showToast("New application ready.");
  };

  return (
    <div className="app">
      <header className="bar">
        <div className="brand">
          <div className="brand-title">
            <strong>Resume Application Workspace</strong>
            <span
              className="application-counter"
              aria-label={
                applicationCount === null
                  ? "Application count unavailable. Choose or allow access to your tracker folder."
                  : `${applicationCount} tracked applications`
              }
              title={
                applicationCount === null
                  ? "Choose or allow access to your tracker folder to load the count."
                  : "Applications recorded in Applications.xlsx"
              }
            >
              {applicationCount ?? "—"}
            </span>
          </div>
          <div className="quote">
            Nothing yet doesn’t mean nothing is coming. One good opportunity can
            make the whole wait worth it.
          </div>
        </div>
        <div className="actions">
          {canPickDirectory && (
            <button
              className="chip"
              onClick={chooseFolder}
              title="Parent folder for all application files"
            >
              <Icon d={iconPaths.folder} />
              {folder ? folder.name : "Choose folder"}
            </button>
          )}
          {workspace === "resume" && (
            <>
              <span className="sep" />
              <button
                className="tool"
                onClick={() => importInputRef.current?.click()}
                title="Import a JSON file and review its changes"
              >
                <JsonIcon direction="import" />
                Import
              </button>
              <button
                className="tool"
                onClick={() =>
                  downloadBlob(
                    new Blob([JSON.stringify(resume, null, 2)], {
                      type: "application/json",
                    }),
                    `${ownerFileStem}_backup.json`,
                  )
                }
                title="Export a JSON backup"
              >
                <JsonIcon direction="export" />
                Export
              </button>
              <span className="sep" />
              <button className="primary" onClick={() => setSaveDialogOpen(true)}>
                Save CV
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={review.onImport}
              />
            </>
          )}
          <div
            id="application-actions"
            className="actions"
            hidden={workspace !== "application"}
          />
          <div
            id="letter-actions"
            className="actions"
            hidden={workspace !== "letter"}
          />
        </div>
      </header>

      <nav className="workspace-tabs" aria-label="Workspace">
        <button
          className="new-application"
          disabled={savingCV || savingCL || savingNotes}
          onClick={newApplication}
        >
          New application
        </button>
        <button
          aria-pressed={workspace === "application"}
          onClick={() => setWorkspace("application")}
        >
          Application JD &amp; notes
        </button>
        <button
          aria-pressed={workspace === "resume"}
          onClick={() => setWorkspace("resume")}
        >
          Edit Resume
        </button>
        <button
          aria-pressed={workspace === "letter"}
          onClick={() => setWorkspace("letter")}
        >
          Edit Cover Letter
        </button>
        <button
          aria-pressed={workspace === "tracker"}
          onClick={() => setWorkspace("tracker")}
        >
          Applications
        </button>
      </nav>
      <div className="workspace-panel" hidden={workspace !== "application"}>
        <ApplicationNotes
          onSavingChange={setSavingNotes}
          draft={applicationDraft}
          setDraft={setApplicationDraft}
          folder={folder}
          showToast={showToast}
        />
      </div>
      <div className="workspace-panel" hidden={workspace !== "tracker"}>
        <ApplicationsView folder={folder} refreshKey={trackerRefresh} />
      </div>
      <div className="workspace-panel" hidden={workspace !== "resume"}>
        <ResumeEditor
          resume={resume}
          setResume={setResume}
          review={review}
          previewUrl={previewUrl}
          pages={pages}
          dirty={JSON.stringify(resume) !== JSON.stringify(compiledResume)}
          onCompile={() => setCompiledResume(structuredClone(resume))}
          onReset={resetResume}
          resetDisabled={savingCV || savingCL || savingNotes}
          resetSignal={resetSignal}
        />
      </div>
      <div className="workspace-panel" hidden={workspace !== "letter"}>
        <CoverLetterEditor
          resetSignal={resetSignal}
          onSavingChange={setSavingCL}
          resume={resume}
          folder={folder}
          showToast={showToast}
          application={applicationDraft}
          setApplication={setApplicationDraft}
        />
      </div>

      {saveDialogOpen && (
        <SaveDialog
          busy={savingCV}
          application={applicationInfo}
          onApplicationChange={updateApplicationInfo}
          onSubmit={saveResume}
          onClose={() => {
            if (!savingCV) setSaveDialogOpen(false);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
