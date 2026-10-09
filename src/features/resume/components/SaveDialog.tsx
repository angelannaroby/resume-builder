import type { FormEvent } from "react";
import type { ApplicationInfo } from "@/features/application-tracker/applicationTracker";
import { TextField } from "@/shared/ui";

interface SaveDialogProps {
  busy?: boolean;
  application: ApplicationInfo;
  onApplicationChange: (next: ApplicationInfo) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}

export function SaveDialog({
  busy,
  application,
  onApplicationChange,
  onSubmit,
  onClose,
}: SaveDialogProps) {
  const update = (key: keyof ApplicationInfo) => (value: string) => {
    onApplicationChange({ ...application, [key]: value });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal"
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
      >
        <h2>Save CV for an application</h2>
        <TextField
          l="Company (required)"
          req
          v={application.company}
          on={update("company")}
        />
        <TextField l="Role" v={application.role} on={update("role")} />
        <TextField l="Job link" v={application.link} on={update("link")} />
        <TextField l="Location" v={application.location} on={update("location")} />

        <div className="foot">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy} type="submit">
            {busy ? "Saving…" : "Save CV"}
          </button>
        </div>
      </form>
    </div>
  );
}
