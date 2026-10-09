import { useState } from "react";
import type { ReactNode } from "react";
import {
  permute,
  plainOps,
  splitItems,
  tidy,
  wordDiff,
} from "@/features/resume/review/reviewEngine";
import type {
  Change,
  Decision,
  Flag,
  Op,
  Proposal,
  Ref,
} from "@/features/resume/review/reviewEngine";

const stripBoldMarkers = (value: string) => value.replace(/\*\*/g, "");
const truncate = (value: string, maxLength = 90) => {
  const plain = stripBoldMarkers(value);
  return plain.length > maxLength
    ? `${plain.slice(0, maxLength - 1)}...`
    : plain;
};

/** Ensures each proposal is rendered once, at the first matching editor slot. */
export function createProposalPlacer(
  proposals: Proposal[],
  render: (proposal: Proposal) => ReactNode,
) {
  const placed = new Set<string>();

  return (matches: (change: Change) => boolean) =>
    proposals
      .filter(
        (proposal) => !placed.has(proposal.id) && matches(proposal.ch),
      )
      .map((proposal) => {
        placed.add(proposal.id);
        return render(proposal);
      });
}

/** Renders word-level diffs while preserving **bold** markers as visual bold text. */
function WordDiff({ operations, showRemoved }: { operations: Op[]; showRemoved: boolean }) {
  let newTextBold = false;
  let oldTextBold = false;
  const output: ReactNode[] = [];

  operations.forEach((operation, index) => {
    const togglesBold = (operation.w.match(/\*\*/g) ?? []).length % 2 === 1;
    const isBold =
      (operation.k === "-" ? oldTextBold : newTextBold) ||
      operation.w.startsWith("**");

    if (operation.k !== "+" && togglesBold) oldTextBold = !oldTextBold;
    if (operation.k !== "-" && togglesBold) newTextBold = !newTextBold;
    if (operation.k === "-" && !showRemoved) return;

    output.push(
      <span
        key={index}
        className={`${
          operation.k === "+" ? "add" : operation.k === "-" ? "del" : ""
        }${isBold ? " b" : ""}`}
      >
        {stripBoldMarkers(operation.w)}{" "}
      </span>,
    );
  });

  return <>{output}</>;
}

function SkillItemsDiff({
  from,
  to,
  freshItems,
}: {
  from: string;
  to: string;
  freshItems: string[];
}) {
  const previousItems = splitItems(from);
  const nextItems = splitItems(to);
  const previous = new Set(previousItems.map((item) => item.toLowerCase()));
  const next = new Set(nextItems.map((item) => item.toLowerCase()));

  return (
    <div className="chips">
      {nextItems.map((item, index) => (
        <span
          key={`next-${index}`}
          className={`item${
            previous.has(item.toLowerCase()) ? "" : " add"
          }${freshItems.includes(item) ? " fresh" : ""}`}
        >
          {item}
        </span>
      ))}
      {previousItems
        .filter((item) => !next.has(item.toLowerCase()))
        .map((item, index) => (
          <span key={`previous-${index}`} className="item del">
            {item}
          </span>
        ))}
    </div>
  );
}

const REVIEW_TITLES: Record<Change["t"], (change: any) => string> = {
  field: (change) => `Proposed ${change.key}`,
  skillLabel: () => "Proposed category name",
  skillItems: () => "Proposed skills",
  skillNew: () => "New skill category",
  bText: () => "Proposed wording",
  bVis: (change) =>
    change.to ? "Hide this bullet from the PDF" : "Show this bullet in the PDF",
  bNew: () => "New bullet",
  bDrop: () => "Not in the file: hide this bullet",
};

const COMPACT_CHANGE_TYPES = new Set<Change["t"]>(["bVis", "bDrop"]);

function ProposalBody({
  proposal,
  showRemoved,
}: {
  proposal: Proposal;
  showRemoved: boolean;
}) {
  const change = proposal.ch;
  const freshItems = proposal.flags.find((flag) => flag.items)?.items ?? [];

  switch (change.t) {
    case "field":
    case "bText":
      return (
        <div className="txt">
          <WordDiff
            operations={wordDiff(tidy(change.from), change.to)}
            showRemoved={showRemoved}
          />
        </div>
      );
    case "skillLabel":
      return (
        <div className="txt">
          <WordDiff
            operations={wordDiff(tidy(change.from), change.to)}
            showRemoved
          />
        </div>
      );
    case "skillItems":
      return (
        <SkillItemsDiff
          from={change.from}
          to={change.to}
          freshItems={freshItems}
        />
      );
    case "skillNew":
      return (
        <>
          <div className="txt">
            <b>{change.to.label}</b>
          </div>
          <SkillItemsDiff from="" to={change.to.items} freshItems={freshItems} />
        </>
      );
    case "bNew":
      return (
        <div className="txt">
          <WordDiff operations={plainOps(change.to.text)} showRemoved={false} />
          {change.to.hidden && <em className="muted"> (hidden in file)</em>}
        </div>
      );
    default:
      return null;
  }
}

function ReviewFlags({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;

  return (
    <span className="tags">
      {flags.map((flag, index) => (
        <span key={index} className={`tag ${flag.sev}`}>
          {flag.msg}
        </span>
      ))}
    </span>
  );
}

interface ReviewCardProps {
  p: Proposal;
  can: boolean;
  stale?: boolean;
  on: (id: string, decision: Decision) => void;
}

export function ReviewCard({ p: proposal, can, stale, on }: ReviewCardProps) {
  const [showRemoved, setShowRemoved] = useState(false);
  const title = REVIEW_TITLES[proposal.ch.t](proposal.ch);

  if (proposal.decision === "accepted") {
    return (
      <div className="rv accepted" role="group" aria-label={`${title}: accepted`}>
        <span>
          <b>Accepted</b> · {title}
        </span>
        <button
          type="button"
          className="link"
          onClick={() => on(proposal.id, "pending")}
        >
          Undo
        </button>
      </div>
    );
  }

  const rejected = proposal.decision === "rejected";
  const compact = COMPACT_CHANGE_TYPES.has(proposal.ch.t);
  const flags: Flag[] = [
    ...(!rejected && stale
      ? [{ sev: "check" as const, msg: "Edited since import" }]
      : []),
    ...(!rejected && !can
      ? [{ sev: "block" as const, msg: "Original changed or removed" }]
      : []),
    ...proposal.flags,
  ];
  const blocked = flags.some((flag) => flag.sev === "block");
  const canShowRemoved = proposal.ch.t === "field" || proposal.ch.t === "bText";

  const actions = (
    <span className="rvbtn">
      {rejected ? (
        <button
          type="button"
          className="mini"
          onClick={() => on(proposal.id, "pending")}
        >
          Restore
        </button>
      ) : (
        <>
          <button
            type="button"
            className="mini accept"
            disabled={blocked}
            onClick={() => on(proposal.id, "accepted")}
          >
            Accept
          </button>
          <button
            type="button"
            className="mini reject"
            onClick={() => on(proposal.id, "rejected")}
          >
            Reject
          </button>
        </>
      )}
    </span>
  );

  return (
    <div
      className={`rv ${rejected ? "rejected" : "pending"}${compact ? " compact" : ""}`}
      role="group"
      aria-label={`${title}${rejected ? ": rejected" : ""}`}
    >
      <div className="rvhead">
        <b>{title}</b>
        {rejected && <span className="tag no">Rejected</span>}
        <ReviewFlags flags={flags} />
        {compact && actions}
      </div>

      {!compact && (
        <ProposalBody proposal={proposal} showRemoved={showRemoved} />
      )}

      {!compact && (
        <div className="rvfoot">
          <span>
            {canShowRemoved && (
              <button
                type="button"
                className="link"
                onClick={() => setShowRemoved((value) => !value)}
              >
                {showRemoved ? "Hide removed words" : "Show removed words"}
              </button>
            )}
          </span>
          {actions}
        </div>
      )}
    </div>
  );
}

export interface ReorderItem {
  idx: number;
  text: string;
  note?: string;
}

interface ReorderDialogProps {
  title: string;
  items: ReorderItem[];
  proposed?: Ref[] | null;
  onSave: (order: number[]) => void;
  onClose: () => void;
}

/** Arrange a list by drag/drop or arrow controls, optionally against an imported order. */
export function ReorderDialog({
  title,
  items,
  proposed,
  onSave,
  onClose,
}: ReorderDialogProps) {
  const [list, setList] = useState(items);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setList(next);
  };

  const useProposedOrder = () => {
    const next = [...list];
    permute(next, proposed ?? [], (item) => item.text);
    setList(next);
  };

  const changed = list.some((item, index) => item.idx !== items[index].idx);

  return (
    <div className="overlay" onKeyDown={(event) => event.key === "Escape" && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="mh">{title}</h2>
        <div className={`reorder${proposed ? " two" : ""}`}>
          {proposed && (
            <div>
              <div className="rvh">Proposed order</div>
              <ol className="order">
                {proposed.map((reference, index) => (
                  <li key={index}>{truncate(reference[reference.length - 1], 110)}</li>
                ))}
              </ol>
              <button type="button" className="link" onClick={useProposedOrder}>
                Start from this order
              </button>
            </div>
          )}

          <div>
            <div className="rvh">Your order</div>
            <ol className="rolist">
              {list.map((item, index) => (
                <li
                  key={item.idx}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null) move(dragIndex, index);
                    setDragIndex(null);
                  }}
                  className={dragIndex === index ? "dragging" : undefined}
                >
                  <span className="grip" aria-hidden="true">⠿</span>
                  <span className="rtxt">
                    {truncate(item.text, 120)}
                    {item.note && <em className="muted"> ({item.note})</em>}
                  </span>
                  <button
                    type="button"
                    className="mini"
                    aria-label={`Move up: ${truncate(item.text, 40)}`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="mini"
                    aria-label={`Move down: ${truncate(item.text, 40)}`}
                    disabled={index === list.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="foot">
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary"
            disabled={!changed}
            onClick={() => onSave(list.map((item) => item.idx))}
          >
            Save order
          </button>
        </div>
      </div>
    </div>
  );
}
