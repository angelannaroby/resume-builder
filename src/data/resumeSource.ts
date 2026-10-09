import type { Resume } from "@/domain/resume";
import { resumeTemplate } from "./resumeTemplate";

type LocalResumeModule = { defaultResume?: Resume };

/**
 * Optional private master resume.
 *
 * `defaultResume*.ts` is intentionally ignored by Git. A fresh public clone
 * works with `resumeTemplate`; local users can add their own master resume without
 * changing tracked source files.
 */
const localModules = import.meta.glob<LocalResumeModule>(
  "./defaultResume*.ts",
  { eager: true },
);

const localResume = Object.values(localModules)[0]?.defaultResume;

export const defaultResume: Resume = structuredClone(
  localResume ?? resumeTemplate,
);

/** Accepts current and older backups; returns null if the required shape is invalid. */
export function normalizeResume(value: unknown): Resume | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, any>;
  if (
    !Array.isArray(input.jobs) ||
    !Array.isArray(input.education) ||
    !Array.isArray(input.skills)
  ) {
    return null;
  }

  const resume: Resume = { ...structuredClone(defaultResume), ...input };
  resume.skills = input.skills.map((skill: any) => ({
    label: String(skill?.label ?? ""),
    items: String(skill?.items ?? ""),
    ...(skill?.hidden === true ? { hidden: true } : {}),
  }));
  resume.jobs = input.jobs.map((job: any) => ({
    title: "",
    org: "",
    dates: "",
    location: "",
    ...job,
    bullets: (job.bullets ?? []).map((bullet: any) =>
      typeof bullet === "string"
        ? { text: bullet, hidden: false }
        : { text: String(bullet?.text ?? ""), hidden: !!bullet?.hidden },
    ),
  }));
  return resume;
}
