import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Resume } from "@/domain/resume";
import { canApply, jobKey } from "@/features/resume/review/reviewEngine";
import type {
  Change,
  Proposal,
  Ref,
} from "@/features/resume/review/reviewEngine";
import type { useReview } from "@/features/resume/review/useReview";
import {
  ReviewCard,
  ReorderDialog,
  createProposalPlacer,
} from "@/features/resume/components/ReviewUI";
import type { ReorderItem } from "@/features/resume/components/ReviewUI";
import { SidePane } from "@/features/resume/components/SidePane";
import {
  VisibilityButton,
  TextField,
  Icon,
  IconButton,
  iconPaths,
  RichTextArea,
  EditorRow,
  EditorSection,
} from "@/shared/ui";
import type { Setter } from "@/shared/ui";

type ReviewController = ReturnType<typeof useReview>;
type ListName = "skills" | "jobs" | "education" | "extras";
type ReorderTarget = { kind: "skills" } | { kind: "job"; index: number } | null;

interface ResumeEditorProps {
  resume: Resume;
  setResume: Dispatch<SetStateAction<Resume>>;
  review: ReviewController;
  previewUrl: string;
  pages: number;
  dirty: boolean;
  onCompile: () => void;
  onReset: () => void;
  resetDisabled: boolean;
  resetSignal: number;
}

function fillSlots<T>(array: T[], slots: number[], order: number[]) {
  const moved = order.map((index) => array[index]);
  [...slots]
    .sort((a, b) => a - b)
    .forEach((slot, index) => {
      array[slot] = moved[index];
    });
}

export function ResumeEditor({
  resume,
  setResume,
  review,
  previewUrl,
  pages,
  dirty,
  onCompile,
  onReset,
  resetDisabled,
  resetSignal,
}: ResumeEditorProps) {
  const [reorder, setReorder] = useState<ReorderTarget>(null);

  useEffect(() => {
    setReorder(null);
  }, [resetSignal]);

  const edit = (mutate: (draft: Resume) => void) => {
    setResume((current) => {
      const draft = structuredClone(current);
      mutate(draft);
      return draft;
    });
  };

  const setTop =
    (key: string): Setter =>
    (value) =>
      edit((draft) => {
        (draft as unknown as Record<string, string>)[key] = value;
      });

  const setListField =
    (list: ListName, index: number, key: string): Setter =>
    (value) =>
      edit((draft) => {
        (draft[list][index] as unknown as Record<string, string>)[key] = value;
      });

  const deleteListItem = (list: ListName, index: number) => {
    edit((draft) => {
      draft[list].splice(index, 1);
    });
  };

  const { review: activeReview, openSections } = review;
  const marks = Boolean(activeReview);
  const proposals: Proposal[] = review.proposals;

  const renderCard = (proposal: Proposal) => (
    <ReviewCard
      key={proposal.id}
      p={proposal}
      on={review.decide}
      can={proposal.decision !== "pending" || canApply(resume, proposal.ch)}
      stale={
        proposal.decision === "pending" &&
        proposal.ch.t === "field" &&
        resume[proposal.ch.key] !== proposal.ch.from &&
        resume[proposal.ch.key] !== proposal.ch.to
      }
    />
  );

  const renderCards = (matches: (change: Change) => boolean) =>
    proposals.filter((proposal) => matches(proposal.ch)).map(renderCard);

  const fieldMatchesImportedValue = (key: "headline" | "summary") =>
    Boolean(
      marks &&
        activeReview?.unchanged.fields[key] !== undefined &&
        activeReview.unchanged.fields[key] === resume[key],
    );

  const skillCards = createProposalPlacer(
    proposals.filter((proposal) => proposal.ch.t.startsWith("skill")),
    renderCard,
  );
  const isSkillChange = (change: Change) => change.t.startsWith("skill");
  const isBulletChange = (change: Change) => change.t.startsWith("b");

  const reorderDialog = (() => {
    if (!reorder) return null;

    if (reorder.kind === "skills") {
      const slots = resume.skills.map((_, index) => index);
      const items: ReorderItem[] = resume.skills.map((skill, index) => ({
        idx: index,
        text: skill.label || "Untitled",
        note: skill.hidden ? "hidden" : undefined,
      }));
      return {
        title: "Reorder categories",
        items,
        proposed: null as Ref[] | null,
        save: (order: number[]) =>
          edit((draft) => fillSlots(draft.skills, slots, order)),
      };
    }

    const job = resume.jobs[reorder.index];
    if (!job) return null;

    const key = jobKey(job);
    const jobIndex = reorder.index;
    const items: ReorderItem[] = job.bullets
      .map((bullet, index) => ({
        idx: index,
        text: bullet.text,
        hidden: bullet.hidden,
      }))
      .filter((item) => !item.hidden && item.text.trim())
      .map((item) => ({
        idx: item.idx,
        text: item.text,
        note: proposals.some(
          (proposal) =>
            proposal.decision === "pending" &&
            proposal.ch.t === "bText" &&
            proposal.ch.job === key &&
            proposal.ch.ref.includes(item.text),
        )
          ? "wording change pending"
          : undefined,
      }));

    return {
      title: `Reorder bullets · ${job.org}`,
      items,
      proposed: activeReview?.orders[key] ?? null,
      save: (order: number[]) =>
        edit((draft) =>
          fillSlots(
            draft.jobs[jobIndex].bullets,
            items.map((item) => item.idx),
            order,
          ),
        ),
    };
  })();

  return (
    <>
      <main>
        <div className="editor">
          <div className="editor-head">
            <h1>Edit resume</h1>
            <button
              className="link"
              disabled={resetDisabled}
              onClick={() => {
                setReorder(null);
                onReset();
              }}
            >
              Reset
            </button>
          </div>

          <EditorSection
            t="Personal information"
            open={openSections.includes("headline")}
            badge={review.pendingCount(
              (change) => change.t === "field" && change.key === "headline",
            )}
          >
            <div className="two">
              <TextField l="Name" v={resume.name} on={setTop("name")} />
              <TextField
                l="Headline"
                v={resume.headline}
                on={setTop("headline")}
                mark={fieldMatchesImportedValue("headline")}
              />
            </div>
            {renderCards(
              (change) => change.t === "field" && change.key === "headline",
            )}
            <div className="two">
              <TextField l="Email" v={resume.email} on={setTop("email")} />
              <TextField l="Phone" v={resume.phone} on={setTop("phone")} />
            </div>
            <div className="two">
              <TextField l="Location" v={resume.location} on={setTop("location")} />
              <TextField
                l="Relocation note"
                v={resume.relocation}
                on={setTop("relocation")}
              />
            </div>
            <div className="two">
              <TextField l="LinkedIn" v={resume.linkedin} on={setTop("linkedin")} />
              <TextField l="GitHub" v={resume.github} on={setTop("github")} />
            </div>
            <TextField l="Portfolio" v={resume.portfolio} on={setTop("portfolio")} />
          </EditorSection>

          <EditorSection
            t="Professional summary"
            open
            badge={review.pendingCount(
              (change) => change.t === "field" && change.key === "summary",
            )}
          >
            <div
              className={
                fieldMatchesImportedValue("summary") ? "same" : undefined
              }
            >
              <RichTextArea rows={6} v={resume.summary} on={setTop("summary")} />
            </div>
            {renderCards(
              (change) => change.t === "field" && change.key === "summary",
            )}
          </EditorSection>

          <EditorSection
            t="Skills"
            open={openSections.includes("skills")}
            badge={review.pendingCount(isSkillChange)}
          >
            {resume.skills.map((skill, index) => (
              <EditorRow
                key={index}
                t={skill.label || "New category"}
                rm={() => deleteListItem("skills", index)}
                same={marks && Boolean(activeReview?.unchanged.skills.includes(skill.label))}
                off={Boolean(skill.hidden)}
                toggle={() =>
                  edit((draft) => {
                    if (draft.skills[index].hidden) {
                      delete draft.skills[index].hidden;
                    } else {
                      draft.skills[index].hidden = true;
                    }
                  })
                }
              >
                <TextField
                  l="Category"
                  v={skill.label}
                  on={setListField("skills", index, "label")}
                />
                {skillCards(
                  (change) =>
                    change.t === "skillLabel" && change.ref.includes(skill.label),
                )}
                <label>
                  Skills
                  <textarea
                    rows={2}
                    value={skill.items}
                    onChange={(event) =>
                      setListField("skills", index, "items")(event.target.value)
                    }
                  />
                </label>
                {skillCards(
                  (change) =>
                    change.t === "skillItems" && change.ref.includes(skill.label),
                )}
              </EditorRow>
            ))}
            {skillCards((change) => change.t === "skillNew")}
            <div className="rowfoot">
              <button
                className="link"
                onClick={() =>
                  edit((draft) => {
                    draft.skills.push({ label: "", items: "" });
                  })
                }
              >
                + Add category
              </button>
              <button
                className="link"
                disabled={resume.skills.length < 2}
                onClick={() => setReorder({ kind: "skills" })}
              >
                <Icon d={iconPaths.sort} />
                Reorder categories
              </button>
            </div>
          </EditorSection>

          <EditorSection
            t="Experience"
            open
            badge={review.pendingCount(isBulletChange)}
          >
            {resume.jobs.map((job, jobIndex) => {
              const key = jobKey(job);
              const jobCards = createProposalPlacer(
                proposals.filter(
                  (proposal) => "job" in proposal.ch && proposal.ch.job === key,
                ),
                renderCard,
              );

              return (
                <EditorRow
                  key={jobIndex}
                  t={`${job.org || "New job"}${job.title ? ` · ${job.title}` : ""}`}
                  rm={() => deleteListItem("jobs", jobIndex)}
                >
                  <div className="two">
                    <TextField
                      l="Job title"
                      v={job.title}
                      on={setListField("jobs", jobIndex, "title")}
                    />
                    <TextField
                      l="Company"
                      v={job.org}
                      on={setListField("jobs", jobIndex, "org")}
                    />
                  </div>
                  <div className="two">
                    <TextField
                      l="Dates (Month YYYY - Month YYYY)"
                      v={job.dates}
                      on={setListField("jobs", jobIndex, "dates")}
                    />
                    <TextField
                      l="Location"
                      v={job.location}
                      on={setListField("jobs", jobIndex, "location")}
                    />
                  </div>

                  <div className="label">Bullets</div>
                  {jobCards(
                    (change) => change.t === "bNew" && change.after === null,
                  )}
                  {job.bullets.map((bullet, bulletIndex) => (
                    <div className="bgroup" key={bulletIndex}>
                      <div
                        className={`bullet${bullet.hidden ? " off" : ""}${marks && activeReview?.unchanged.bullets[key]?.includes(bullet.text) ? " same" : ""}`}
                      >
                        <RichTextArea
                          rows={Math.max(2, Math.ceil(bullet.text.length / 60))}
                          v={bullet.text}
                          on={(text) =>
                            edit((draft) => {
                              draft.jobs[jobIndex].bullets[bulletIndex].text = text;
                            })
                          }
                          tools={
                            <>
                              <VisibilityButton
                                off={bullet.hidden}
                                on={() =>
                                  edit((draft) => {
                                    const target =
                                      draft.jobs[jobIndex].bullets[bulletIndex];
                                    target.hidden = !target.hidden;
                                  })
                                }
                              />
                              <IconButton
                                d={iconPaths.x}
                                label="Remove bullet"
                                on={() =>
                                  edit((draft) => {
                                    draft.jobs[jobIndex].bullets.splice(
                                      bulletIndex,
                                      1,
                                    );
                                  })
                                }
                              />
                            </>
                          }
                        />
                      </div>
                      {jobCards(
                        (change) =>
                          (change.t === "bText" ||
                            change.t === "bVis" ||
                            change.t === "bDrop") &&
                          change.ref.includes(bullet.text),
                      )}
                      {jobCards(
                        (change) =>
                          change.t === "bNew" &&
                          Boolean(change.after?.includes(bullet.text)),
                      )}
                    </div>
                  ))}
                  {jobCards(() => true)}

                  <div className="rowfoot">
                    <button
                      className="link"
                      onClick={() =>
                        edit((draft) => {
                          draft.jobs[jobIndex].bullets.push({
                            text: "",
                            hidden: false,
                          });
                        })
                      }
                    >
                      + Add bullet
                    </button>
                    <button
                      className="link"
                      disabled={
                        job.bullets.filter(
                          (bullet) => !bullet.hidden && bullet.text.trim(),
                        ).length < 2
                      }
                      onClick={() => setReorder({ kind: "job", index: jobIndex })}
                    >
                      <Icon d={iconPaths.sort} />
                      Reorder bullets
                    </button>
                  </div>
                </EditorRow>
              );
            })}

            <button
              className="link"
              onClick={() =>
                edit((draft) => {
                  draft.jobs.push({
                    title: "",
                    org: "",
                    dates: "",
                    location: "",
                    bullets: [{ text: "", hidden: false }],
                  });
                })
              }
            >
              + Add job
            </button>
          </EditorSection>

          <EditorSection t="Education">
            {resume.education.map((education, index) => (
              <EditorRow
                key={index}
                t={education.degree || "New education"}
                rm={() => deleteListItem("education", index)}
              >
                <div className="two">
                  <TextField
                    l="Degree"
                    v={education.degree}
                    on={setListField("education", index, "degree")}
                  />
                  <TextField
                    l="University"
                    v={education.org}
                    on={setListField("education", index, "org")}
                  />
                </div>
                <div className="two">
                  <TextField
                    l="Dates (Month YYYY - Month YYYY)"
                    v={education.dates}
                    on={setListField("education", index, "dates")}
                  />
                  <TextField
                    l="Location"
                    v={education.location}
                    on={setListField("education", index, "location")}
                  />
                </div>
                <TextField
                  l="Grades and honours"
                  v={education.details}
                  on={setListField("education", index, "details")}
                />
                <label>
                  Thesis (optional)
                  <RichTextArea
                    rows={3}
                    v={education.thesis ?? ""}
                    on={setListField("education", index, "thesis")}
                  />
                </label>
              </EditorRow>
            ))}
            <button
              className="link"
              onClick={() =>
                edit((draft) => {
                  draft.education.push({
                    degree: "",
                    org: "",
                    dates: "",
                    location: "",
                    details: "",
                  });
                })
              }
            >
              + Add education
            </button>
          </EditorSection>

          <EditorSection t="Languages and additional information">
            {resume.extras.map((extra, index) => (
              <EditorRow
                key={index}
                t={extra.label || "New item"}
                rm={() => deleteListItem("extras", index)}
              >
                <div className="two">
                  <TextField
                    l="Label"
                    v={extra.label}
                    on={setListField("extras", index, "label")}
                  />
                  <TextField
                    l="Text"
                    v={extra.text}
                    on={setListField("extras", index, "text")}
                  />
                </div>
              </EditorRow>
            ))}
            <button
              className="link"
              onClick={() =>
                edit((draft) => {
                  draft.extras.push({ label: "", text: "" });
                })
              }
            >
              + Add item
            </button>
          </EditorSection>
        </div>

        <SidePane
          onCompile={onCompile}
          dirty={dirty}
          url={previewUrl}
          pages={pages}
          review={
            activeReview
              ? {
                  locked: activeReview.locked.length,
                  pending: review.pendingTotal,
                  onAcceptAll: review.acceptAll,
                  onDiscard: review.close,
                }
              : null
          }
        />
      </main>

      {reorderDialog && (
        <ReorderDialog
          key={reorder?.kind === "job" ? reorder.index : "skills"}
          title={reorderDialog.title}
          items={reorderDialog.items}
          proposed={reorderDialog.proposed}
          onClose={() => setReorder(null)}
          onSave={(order) => {
            reorderDialog.save(order);
            setReorder(null);
          }}
        />
      )}
    </>
  );
}
