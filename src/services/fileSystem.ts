export interface WritableFileStream {
  write(data: Blob | ArrayBuffer | string): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

export interface FileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFileStream>;
}

export interface DirectoryHandle {
  name: string;
  queryPermission(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker: (options?: { mode?: "read" | "readwrite" }) => Promise<DirectoryHandle>;
};

export const canPickDirectory =
  typeof window !== "undefined" && "showDirectoryPicker" in window;

const DATABASE_NAME = "resume-builder-fs";
const DATABASE_VERSION = 2;
const DIRECTORY_STORE = "handles";
const LEGACY_DIRECTORY_STORE = "h";
const ROOT_DIRECTORY_KEY = "root";

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const transaction = request.transaction;
      if (!transaction) return;

      const directoryStore = db.objectStoreNames.contains(DIRECTORY_STORE)
        ? transaction.objectStore(DIRECTORY_STORE)
        : db.createObjectStore(DIRECTORY_STORE);

      // Older versions stored the selected directory in an object store named
      // `h`. Migrate that handle once so existing users keep their selection.
      if (db.objectStoreNames.contains(LEGACY_DIRECTORY_STORE)) {
        const legacyStore = transaction.objectStore(LEGACY_DIRECTORY_STORE);
        const legacyRequest = legacyStore.get(ROOT_DIRECTORY_KEY);
        legacyRequest.onsuccess = () => {
          if (legacyRequest.result) {
            directoryStore.put(legacyRequest.result, ROOT_DIRECTORY_KEY);
          }
        };
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export async function getSavedDirectory(): Promise<DirectoryHandle | undefined> {
  try {
    const db = await openDatabase();
    const handle = await new Promise<DirectoryHandle | undefined>((resolve) => {
      const request = db.transaction(DIRECTORY_STORE).objectStore(DIRECTORY_STORE).get(ROOT_DIRECTORY_KEY);
      request.onsuccess = () => resolve(request.result as DirectoryHandle | undefined);
      request.onerror = () => resolve(undefined);
    });
    db.close();
    return handle;
  } catch {
    return undefined;
  }
}

export async function pickDirectory(): Promise<DirectoryHandle> {
  const handle = await (window as DirectoryPickerWindow).showDirectoryPicker({
    mode: "readwrite",
  });
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DIRECTORY_STORE, "readwrite");
    transaction.objectStore(DIRECTORY_STORE).put(handle, ROOT_DIRECTORY_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }).finally(() => db.close());

  return handle;
}

export async function ensureWritePermission(handle: DirectoryHandle) {
  return (
    (await handle.queryPermission({ mode: "readwrite" })) === "granted" ||
    (await handle.requestPermission({ mode: "readwrite" })) === "granted"
  );
}

export async function requireDirectory(folder: DirectoryHandle | undefined) {
  if (!folder) throw new Error("Choose your parent folder in the header first.");
  if (!(await ensureWritePermission(folder))) {
    throw new Error("Allow access to your selected parent folder and retry.");
  }
  return folder;
}

export async function writeFile(
  directory: DirectoryHandle,
  name: string,
  data: Blob | ArrayBuffer,
  subfolder?: string,
) {
  const target = subfolder
    ? await directory.getDirectoryHandle(subfolder, { create: true })
    : directory;
  const writable = await (
    await target.getFileHandle(name, { create: true })
  ).createWritable();

  try {
    await writable.write(data);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch {
      // Preserve the original write failure if aborting also fails.
    }
    throw error;
  }
}

export const SAVE_FOLDERS = {
  cv: "Save CVs",
  cl: "Save CLs",
  info: "ApplicationInfo",
} as const;

/** Creates a Windows-safe filename segment while preserving international text. */
export function toSafeFilenamePart(value: string, fallback = "File") {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/[. ]+$/g, "") || fallback
  );
}

export function compactName(name: string) {
  return (
    name.replace(/\s+/g, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "") ||
    "Resume"
  );
}
