import type { DirectoryHandle } from "@/services/fileSystem";
import { useEffect, useMemo, useState } from "react";
import {
  readApplications,
  updateInterviewCall,
  type InterviewCallStatus,
  type TrackerApplication,
} from "@/features/application-tracker/applicationTracker";
import { requireDirectory } from "@/services/fileSystem";

type LoadStatus = "idle" | "loading" | "ready" | "permission" | "error";
const PAGE_SIZES = [10, 25, 50, 100] as const;

function displayDate(value: string) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  const [, year, month, day] = match;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

interface ApplicationsViewProps {
  folder: DirectoryHandle | undefined;
  refreshKey?: number;
}

export function ApplicationsView({
  folder,
  refreshKey = 0,
}: ApplicationsViewProps) {
  const [rows, setRows] = useState<TrackerApplication[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [savingInterview, setSavingInterview] = useState<number | null>(null);

  const load = async (requestAccess = false) => {
    if (!folder) {
      setRows([]);
      setStatus("idle");
      setMessage("Choose your parent folder to view Applications.xlsx.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      if (requestAccess) {
        await requireDirectory(folder);
      } else if (
        (await folder.queryPermission({ mode: "readwrite" })) !== "granted"
      ) {
        setRows([]);
        setStatus("permission");
        setMessage(
          "Allow access to your selected parent folder to read Applications.xlsx.",
        );
        return;
      }

      const data = await readApplications(folder);
      setRows(data.sort((a, b) => b.n - a.n));
      setStatus("ready");
    } catch (error) {
      setRows([]);
      setStatus("error");
      setMessage((error as Error).message);
    }
  };

  useEffect(() => {
    void load(false);
    // `load` intentionally depends on folder and refreshKey only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, refreshKey]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return rows;

    return rows.filter((row) =>
      [row.company, row.role, row.location, row.interviewCall, row.notes].some(
        (value) => value.toLocaleLowerCase().includes(normalizedQuery),
      ),
    );
  }, [query, rows]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [currentPage, filteredRows, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const changeInterviewCall = async (
    application: TrackerApplication,
    nextStatus: InterviewCallStatus,
  ) => {
    if (!folder || application.interviewCall === nextStatus || savingInterview) return;

    setSavingInterview(application.n);
    setMessage("");
    try {
      await requireDirectory(folder);
      await updateInterviewCall(folder, application.n, nextStatus);
      setRows((current) =>
        current.map((row) =>
          row.n === application.n ? { ...row, interviewCall: nextStatus } : row,
        ),
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSavingInterview(null);
    }
  };

  const stateTitle =
    status === "loading"
      ? "Reading Applications.xlsx…"
      : status === "error"
        ? "Could not read tracker"
        : "Applications tracker";

  const rangeStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, filteredRows.length);

  return (
    <main className="applications-main">
      <div className="applications-shell">
        <div className="applications-head">
          <div>
            <h1>Applications</h1>
            <p className="muted">
              Applications.xlsx remains the source of truth. Interview status can be updated here.
            </p>
          </div>

          <div className="applications-tools">
            <label className="applications-search">
              <span className="sr-only">Search applications</span>
              <input
                type="search"
                placeholder="Search company, role, location…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={status !== "ready"}
              />
            </label>
            <button
              onClick={() => void load(true)}
              disabled={!folder || status === "loading" || savingInterview !== null}
            >
              {status === "loading" ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {status === "ready" && (
          <div className="applications-summary-row">
            <div className="applications-summary">
              <strong>{rows.length}</strong> applications
              {query.trim() && <span> · {filteredRows.length} matching</span>}
            </div>
            {message && <div className="tracker-inline-error" role="alert">{message}</div>}
          </div>
        )}

        {status !== "ready" ? (
          <div className="tracker-state card">
            <strong>{stateTitle}</strong>
            <span>
              {message ||
                "Choose your parent folder to view Applications.xlsx."}
            </span>
            {status === "permission" && (
              <button className="primary" onClick={() => void load(true)}>
                Allow folder access
              </button>
            )}
          </div>
        ) : rows.length === 0 ? (
          <div className="tracker-state card">
            <strong>No applications yet</strong>
            <span>
              No tracked rows were found. Applications.xlsx may not have been
              created yet.
            </span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="tracker-state card">
            <strong>No matching applications</strong>
            <span>Try another company, role or location.</span>
          </div>
        ) : (
          <>
            <div className="applications-table-wrap card">
              <table className="applications-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Company</th>
                    <th>Role</th>
                    <th>Location</th>
                    <th>Job Link</th>
                    <th>Interview Call</th>
                    <th>Applied On</th>
                    <th>Resume File</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const isSaving = savingInterview === row.n;
                    return (
                      <tr key={`${row.n}-${row.company}-${row.resumeFile}`}>
                        <td className="tracker-number">{row.n}</td>
                        <td><strong>{row.company}</strong></td>
                        <td>{row.role || "—"}</td>
                        <td>{row.location || "—"}</td>
                        <td>
                          {row.jobLink ? (
                            <a href={row.jobLink} target="_blank" rel="noreferrer">Open job</a>
                          ) : "—"}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`interview-status ${row.interviewCall.toLowerCase()}`}
                            disabled={isSaving || savingInterview !== null}
                            aria-label={`Interview call for ${row.company}: ${row.interviewCall}. Click to change to ${row.interviewCall === "Yes" ? "No" : "Yes"}.`}
                            title={`Click to mark ${row.interviewCall === "Yes" ? "No" : "Yes"}`}
                            onClick={() =>
                              void changeInterviewCall(
                                row,
                                row.interviewCall === "Yes" ? "No" : "Yes",
                              )
                            }
                          >
                            {isSaving ? (
                              "…"
                            ) : row.interviewCall === "Yes" ? (
                              <>
                                <span className="interview-status-icon" aria-hidden="true">
                                  <svg viewBox="0 0 16 16" focusable="false">
                                    <path d="M4 8.2 6.7 11 12 5.5" />
                                  </svg>
                                </span>
                                <span>Yes</span>
                              </>
                            ) : (
                              "No"
                            )}
                          </button>
                        </td>
                        <td className="tracker-date">{displayDate(row.appliedOn)}</td>
                        <td className="tracker-file" title={row.resumeFile}>{row.resumeFile || "—"}</td>
                        <td className="tracker-notes" title={row.notes}>{row.notes || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="applications-pagination" aria-label="Applications pagination">
              <div className="pagination-range">
                {rangeStart}–{rangeEnd} of {filteredRows.length}
              </div>
              <div className="pagination-controls">
                <label>
                  <span>Rows</span>
                  <select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                    aria-label="Rows per page"
                  >
                    {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
                <button
                  className="pagination-icon-button"
                  onClick={() => setPage(1)}
                  disabled={currentPage === 1}
                  aria-label="First page"
                  title="First page"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M5.5 4.5v11M14.5 5.5 9.5 10l5 4.5" />
                  </svg>
                </button>
                <button
                  className="pagination-icon-button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  title="Previous page"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m12.5 5.5-5 4.5 5 4.5" />
                  </svg>
                </button>
                <span className="pagination-page">Page {currentPage} of {pageCount}</span>
                <button
                  className="pagination-icon-button"
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                  disabled={currentPage === pageCount}
                  aria-label="Next page"
                  title="Next page"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m7.5 5.5 5 4.5-5 4.5" />
                  </svg>
                </button>
                <button
                  className="pagination-icon-button"
                  onClick={() => setPage(pageCount)}
                  disabled={currentPage === pageCount}
                  aria-label="Last page"
                  title="Last page"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M14.5 4.5v11M5.5 5.5l5 4.5-5 4.5" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
