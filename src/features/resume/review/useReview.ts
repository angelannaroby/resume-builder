import { useEffect, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { Resume } from "@/domain/resume";
import {
  applyChange,
  buildReview,
  loadReview,
} from "@/features/resume/review/reviewEngine";
import type {
  Change,
  Decision,
  Review,
} from "@/features/resume/review/reviewEngine";

const STORAGE_KEY = "resume-builder-review-v1";

function loadStoredReview() {
  try {
    return loadReview(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Controls the explicit review flow for imported resume JSON. */
export function useReview(
  resume: Resume,
  setResume: Dispatch<SetStateAction<Resume>>,
  showToast: (message: string) => void,
) {
  const [review, setReview] = useState<Review | null>(loadStoredReview);
  const [openSections, setOpenSections] = useState<string[]>(
    () => review?.sections ?? [],
  );

  useEffect(() => {
    try {
      if (review) localStorage.setItem(STORAGE_KEY, JSON.stringify(review));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Local storage can be unavailable in private/restricted browser contexts.
    }
  }, [review]);

  const proposals = review?.proposals ?? [];
  const pendingProposals = proposals.filter(
    (proposal) => proposal.decision === "pending",
  );

  const pendingCount = (matches: (change: Change) => boolean) =>
    pendingProposals.filter((proposal) => matches(proposal.ch)).length;

  const onImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > 2_000_000) {
      alert("This file is too large to be a resume JSON.");
      return;
    }

    void file.text().then((text) => {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        alert("Could not read this file. Choose a valid JSON file.");
        return;
      }

      const nextReview = buildReview(resume, raw, file.name);
      if (!nextReview) {
        alert("This file does not look like a resume JSON.");
        return;
      }

      if (
        pendingProposals.length &&
        !confirm("You have an unfinished review. Replace it with this file?")
      ) {
        return;
      }

      if (!nextReview.proposals.length && !nextReview.locked.length) {
        setReview(null);
        showToast("No differences: this file matches your current CV.");
        return;
      }

      setReview(nextReview);
      setOpenSections(nextReview.sections);
      showToast(
        `${nextReview.proposals.length} change${
          nextReview.proposals.length === 1 ? "" : "s"
        } to review. Nothing is applied yet.`,
      );
    });
  };

  const decide = (id: string, decision: Decision) => {
    const proposal = proposals.find((item) => item.id === id);
    if (!proposal) return;

    if (decision === "accepted" || proposal.decision === "accepted") {
      const nextResume = structuredClone(resume);
      const undo = proposal.decision === "accepted";
      if (!applyChange(nextResume, proposal.ch, undo)) {
        showToast("That item changed or was removed since the import.");
        return;
      }
      setResume(nextResume);
    }

    setReview((current) =>
      current
        ? {
            ...current,
            proposals: current.proposals.map((item) =>
              item.id === id ? { ...item, decision } : item,
            ),
          }
        : current,
    );
  };

  const acceptAll = () => {
    if (!review) return;

    const nextResume = structuredClone(resume);
    const acceptedIds = new Set<string>();
    let skipped = 0;

    for (const proposal of proposals) {
      if (proposal.decision !== "pending") continue;
      if (proposal.flags.some((flag) => flag.sev === "block")) {
        skipped += 1;
        continue;
      }
      if (applyChange(nextResume, proposal.ch)) acceptedIds.add(proposal.id);
      else skipped += 1;
    }

    if (!acceptedIds.size) {
      showToast(
        skipped
          ? "No pending changes could be accepted safely."
          : "No pending changes to accept.",
      );
      return;
    }

    setResume(nextResume);
    setReview((current) =>
      current
        ? {
            ...current,
            proposals: current.proposals.map((proposal) =>
              acceptedIds.has(proposal.id)
                ? { ...proposal, decision: "accepted" as const }
                : proposal,
            ),
          }
        : current,
    );

    showToast(
      `Accepted ${acceptedIds.size} pending change${
        acceptedIds.size === 1 ? "" : "s"
      }${
        skipped
          ? `; ${skipped} blocked or unavailable change${
              skipped === 1 ? "" : "s"
            } left for review.`
          : "."
      }`,
    );
  };

  const close = () => {
    if (
      pendingProposals.length &&
      !confirm(
        `${pendingProposals.length} pending change${
          pendingProposals.length > 1 ? "s" : ""
        } will be discarded. Close the review?`,
      )
    ) {
      return;
    }
    setReview(null);
  };

  const reset = () => {
    setReview(null);
    setOpenSections([]);
  };

  return {
    reset,
    review,
    proposals,
    openSections,
    pendingCount,
    pendingTotal: pendingProposals.length,
    onImport,
    decide,
    acceptAll,
    close,
  };
}
