import { useRef } from "react";
import type { ReactNode } from "react";

export type Setter = (value: string) => void;

export const iconPaths = {
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z",
  off: "M3 3l18 18M10.6 5.1A9.6 9.6 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6A16.6 16.6 0 002 12s3.5 7 10 7a9.7 9.7 0 004.4-1M9.9 9.9a3 3 0 004.2 4.2",
  x: "M18 6L6 18M6 6l12 12",
  sort: "M7 4v16m0 0l-3-3m3 3l3-3M17 20V4m0 0l-3 3m3-3l3 3",
  up: "M12 15V4m0 0L8 8m4-4l4 4M4 20h16",
  out: "M12 4v11m0 0l-4-4m4 4l4-4M5 20h14",
  pdf: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M12 11v6m0 0l-2.5-2.5M12 17l2.5-2.5",
  folder:
    "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z",
} as const;

export function Icon({ d }: { d: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export function IconButton({
  d,
  label,
  on,
  cls = "",
}: {
  d: string;
  label: string;
  on: () => void;
  cls?: string;
}) {
  return (
    <button
      type="button"
      className={`icon ${cls}`}
      title={label}
      aria-label={label}
      onClick={on}
    >
      <Icon d={d} />
    </button>
  );
}

export function VisibilityButton({ off, on }: { off: boolean; on: () => void }) {
  return (
    <IconButton
      d={off ? iconPaths.off : iconPaths.eye}
      cls={off ? "is-off" : ""}
      label={
        off
          ? "Hidden from PDF. Click to show"
          : "Shown in PDF. Click to hide"
      }
      on={on}
    />
  );
}

interface RichTextAreaProps {
  v: string;
  on: Setter;
  rows: number;
  tools?: ReactNode;
}

/** Textarea where Ctrl/Cmd+B toggles **bold** markers around the selection. */
export function RichTextArea({ v, on, rows, tools }: RichTextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const toggleBold = () => {
    const element = ref.current;
    if (!element) return;

    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (start === end) return;

    const selection = v.slice(start, end);
    let output: string;
    let nextStart: number;
    let nextEnd: number;

    if (v.slice(start - 2, start) === "**" && v.slice(end, end + 2) === "**") {
      output = v.slice(0, start - 2) + selection + v.slice(end + 2);
      nextStart = start - 2;
      nextEnd = end - 2;
    } else if (
      selection.length > 4 &&
      selection.startsWith("**") &&
      selection.endsWith("**")
    ) {
      output = v.slice(0, start) + selection.slice(2, -2) + v.slice(end);
      nextStart = start;
      nextEnd = end - 4;
    } else {
      output = `${v.slice(0, start)}**${selection}**${v.slice(end)}`;
      nextStart = start + 2;
      nextEnd = end + 2;
    }

    on(output);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(nextStart, nextEnd);
    });
  };

  return (
    <div className="rich">
      <textarea
        ref={ref}
        rows={rows}
        value={v}
        onChange={(event) => on(event.target.value)}
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "b"
          ) {
            event.preventDefault();
            toggleBold();
          }
        }}
      />
      {tools && <div className="tools">{tools}</div>}
    </div>
  );
}

export function TextField({
  l,
  v,
  on,
  req,
  mark,
}: {
  l: string;
  v: string;
  on: Setter;
  req?: boolean;
  mark?: boolean;
}) {
  return (
    <label className={mark ? "same" : undefined}>
      {l}
      <input
        required={req}
        value={v}
        onChange={(event) => on(event.target.value)}
      />
    </label>
  );
}

export function EditorSection({
  t,
  open,
  badge,
  children,
}: {
  t: string;
  open?: boolean;
  badge?: number;
  children: ReactNode;
}) {
  return (
    <details className="card" open={open}>
      <summary>
        <span>
          {t}
          {badge ? <span className="pill warn">{badge} to review</span> : null}
        </span>
      </summary>
      <div className="body">{children}</div>
    </details>
  );
}

export function EditorRow({
  t,
  rm,
  same,
  off,
  toggle,
  children,
}: {
  t: string;
  rm: () => void;
  same?: boolean;
  off?: boolean;
  toggle?: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`row${same ? " same" : ""}${off ? " off" : ""}`}>
      <div className="rowhead">
        <strong>{t}</strong>
        {off && <span className="tag hid">Hidden</span>}
        <span className="rowbtns">
          {toggle && <VisibilityButton off={Boolean(off)} on={toggle} />}
          <IconButton d={iconPaths.x} label="Remove" on={rm} />
        </span>
      </div>
      {children}
    </div>
  );
}

export function JsonIcon({
  direction,
}: {
  direction: "import" | "export";
}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 26 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H5v20h14V7zM14 2v5h5M9 10H8v2l-1 1 1 1v2h1M13 10h1v2l1 1-1 1v2h-1" />
      <path
        d={
          direction === "import"
            ? "M22 15v6m-2-2 2 2 2-2"
            : "M22 21v-6m-2 2 2-2 2 2"
        }
      />
    </svg>
  );
}
