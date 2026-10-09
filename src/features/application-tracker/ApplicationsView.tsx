import type { DirectoryHandle } from "@/services/fileSystem";
import { useEffect, useMemo, useState } from "react";
import {
  readApplications,
  type TrackerApplication,
} from "@/features/application-tracker/applicationTracker";
import { requireDirectory } from "@/services/fileSystem";

type LoadStatus = "idle" | "loading" | "ready" | "permission" | "error";

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

  const stateTitle =
    status === "loading"
      ? "Reading Applications.xlsx…"
      : status === "error"
        ? "Could not read tracker"
        : "Applications tracker";

  return (
    <main className="applications-main">
      <div className="applications-shell">
        <div className="applications-head">
          <div>
            <h1>Applications</h1>
            <p className="muted">
              Read-only view of Applications.xlsx. The spreadsheet remains the
              source of truth.
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
              disabled={!folder || status === "loading"}
            >
              {status === "loading" ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {status === "ready" && (
          <div className="applications-summary">
            <strong>{rows.length}</strong> applications
            {query.trim() && <span>· {filteredRows.length} shown</span>}
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
                {filteredRows.map((row) => (
                  <tr key={`${row.n}-${row.company}-${row.resumeFile}`}>
                    <td className="tracker-number">{row.n}</td>
                    <td>
                      <strong>{row.company}</strong>
                    </td>
                    <td>{row.role || "—"}</td>
                    <td>{row.location || "—"}</td>
                    <td>
                      {row.jobLink ? (
                        <a href={row.jobLink} target="_blank" rel="noreferrer">
                          Open job
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <span
                        className={`interview-status ${
                          row.interviewCall.toLowerCase() === "yes" ? "yes" : ""
                        }`}
                      >
                        {row.interviewCall || "No"}
                      </span>
                    </td>
                    <td className="tracker-date">
                      {displayDate(row.appliedOn)}
                    </td>
                    <td className="tracker-file" title={row.resumeFile}>
                      {row.resumeFile || "—"}
                    </td>
                    <td className="tracker-notes" title={row.notes}>
                      {row.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
