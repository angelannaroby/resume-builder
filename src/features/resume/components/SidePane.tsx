import { Icon } from "@/shared/ui";

interface ReviewStatus {
  locked: number;
  pending: number;
  onAcceptAll: () => void;
  onDiscard: () => void;
}

interface SidePaneProps {
  url: string;
  pages: number;
  review: ReviewStatus | null;
  onCompile?: () => void;
  dirty?: boolean;
  pageLimit?: number | null;
}

export function SidePane({
  url,
  pages,
  review,
  onCompile,
  dirty,
  pageLimit = 2,
}: SidePaneProps) {
  const exceedsPageLimit = pageLimit !== null && pages > pageLimit;

  return (
    <aside className="side">
      <div className="lane">
        <h2>PDF preview</h2>
        <span className="grow" />

        {review && (
          <>
            <span
              className="rvchip"
              title={
                review.locked
                  ? `${review.locked} locked difference${
                      review.locked > 1 ? "s" : ""
                    } in the file were ignored`
                  : undefined
              }
            >
              <span className="dot" aria-hidden="true" />
              Review mode
              <button
                type="button"
                className="link"
                onClick={review.onDiscard}
              >
                Discard review
              </button>
            </span>
            <button
              type="button"
              className="accept-all"
              disabled={!review.pending}
              onClick={review.onAcceptAll}
            >
              Accept all
            </button>
          </>
        )}

        <span
          className={`pill page-count${exceedsPageLimit ? " over-limit" : ""}`}
          title={exceedsPageLimit ? `Longer than ${pageLimit} pages` : undefined}
          aria-label={
            exceedsPageLimit
              ? `${pages} pages, warning: exceeds ${pageLimit} pages`
              : undefined
          }
        >
          {exceedsPageLimit && (
            <Icon d="M10.3 3.9L1.8 18.6A2 2 0 003.5 21h17a2 2 0 001.7-2.4L13.7 3.9a2 2 0 00-3.4 0zM12 9v4m0 4h.01" />
          )}
          {pages} page{pages > 1 ? "s" : ""}
        </span>

        {onCompile && (
          <button className="compile" onClick={onCompile}>
            Compile preview{dirty ? " •" : ""}
          </button>
        )}
      </div>
      <iframe title="PDF preview" src={url} />
    </aside>
  );
}
