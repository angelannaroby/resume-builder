import { Workbook } from "exceljs";
import type { Worksheet } from "exceljs";
import { writeFile, type DirectoryHandle } from "@/services/fileSystem";

export interface ApplicationInfo {
  company: string;
  role: string;
  link: string;
  location: string;
}

interface TrackerRecord {
  n: number;
  company: string;
  role: string;
  location: string;
  link: string;
  date: string;
  file: string;
}


export type InterviewCallStatus = "Yes" | "No";

export interface TrackerApplication {
  n: number;
  company: string;
  role: string;
  location: string;
  jobLink: string;
  interviewCall: InterviewCallStatus;
  appliedOn: string;
  resumeFile: string;
  notes: string;
}

const COLUMNS: [string, number][] = [
  ["No.", 6],
  ["Company", 26],
  ["Role", 28],
  ["Location", 22],
  ["Job Link", 14],
  ["Interview Call", 15],
  ["Applied On", 14],
  ["Resume File", 46],
  ["Notes", 36],
];
const BORDER = { style: "thin" as const, color: { argb: "FFE4E7EC" } };
const TRACKER_FILE = "Applications.xlsx";
const TRACKER_SHEET = "Applications";

function configureSheet(sheet: Worksheet) {
  sheet.columns = COLUMNS.map(([header, width], index) => ({
    header,
    key: String(index),
    width,
  }));
  const header = sheet.getRow(1);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F2A44" },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "I1" };
  sheet.addConditionalFormatting({
    ref: "F2:F500",
    rules: [
      {
        type: "cellIs",
        operator: "equal",
        formulae: ['"Yes"'],
        priority: 1,
        style: {
          fill: {
            type: "pattern",
            pattern: "solid",
            bgColor: { argb: "FFD9F2E4" },
          },
          font: { bold: true, color: { argb: "FF17794A" } },
        },
      },
      {
        type: "cellIs",
        operator: "equal",
        formulae: ['"No"'],
        priority: 2,
        style: { font: { color: { argb: "FF667085" } } },
      },
    ],
  });
}

function appendRow(sheet: Worksheet, record: TrackerRecord, rowIndex: number) {
  const row = sheet.getRow(rowIndex);
  const setCell = (column: number, value: any) => {
    row.getCell(column).value = value;
    return row.getCell(column);
  };

  setCell(1, record.n);
  setCell(2, record.company);
  setCell(3, record.role);
  setCell(4, record.location);

  const url = /^https?:\/\//i.test(record.link)
    ? record.link
    : record.link
      ? `https://${record.link}`
      : "";
  const link = setCell(
    5,
    url ? { text: "Open job", hyperlink: url, tooltip: url } : null,
  );
  if (url) link.font = { color: { argb: "FF1D4ED8" }, underline: true };

  const interview = setCell(6, "No");
  interview.dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: ['"Yes,No"'],
    showErrorMessage: true,
    errorTitle: "Interview Call",
    error: "Choose Yes or No",
  };

  const date = setCell(7, new Date(`${record.date}T00:00:00Z`));
  date.numFmt = "d mmm yyyy";
  setCell(8, record.file);
  setCell(9, null);
  row.height = 22;

  for (let column = 1; column <= 9; column += 1) {
    const cell = row.getCell(column);
    cell.border = {
      top: BORDER,
      bottom: BORDER,
      left: BORDER,
      right: BORDER,
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: [1, 6, 7].includes(column) ? "center" : "left",
      wrapText: column === 9,
    };
    if (rowIndex % 2 === 1) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF7F8FA" },
      };
    }
  }
}

async function loadWorkbook(dir: DirectoryHandle) {
  const workbook = new Workbook();
  try {
    const file = await (await dir.getFileHandle(TRACKER_FILE)).getFile();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.getWorksheet(TRACKER_SHEET);
    if (!sheet) throw new Error(`${TRACKER_FILE} is missing its ${TRACKER_SHEET} sheet.`);
    return { workbook, sheet };
  } catch (error) {
    if ((error as Error).name === "NotFoundError") return { workbook, sheet: undefined };
    throw new Error(
      `Could not read ${TRACKER_FILE}. Close it in Excel and check the file before retrying. ${(error as Error).message}`,
    );
  }
}

export async function addApplication(
  dir: DirectoryHandle,
  application: ApplicationInfo,
  resumeFile: string,
): Promise<ArrayBuffer> {
  const { workbook, sheet: existingSheet } = await loadWorkbook(dir);
  const sheet = existingSheet ?? workbook.addWorksheet(TRACKER_SHEET);
  if (!existingSheet) configureSheet(sheet);

  let rowIndex = 2;
  while (sheet.getCell(rowIndex, 1).value) rowIndex += 1;

  let maxSerial = 0;
  sheet.eachRow((row, index) => {
    if (index > 1) maxSerial = Math.max(maxSerial, Number(row.getCell(1).value) || 0);
  });

  const today = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  appendRow(
    sheet,
    {
      n: maxSerial + 1,
      company: application.company,
      role: application.role,
      location: application.location,
      link: application.link.trim(),
      date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
      file: resumeFile,
    },
    rowIndex,
  );

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function countApplications(dir: DirectoryHandle): Promise<number> {
  const { sheet } = await loadWorkbook(dir);
  if (!sheet) return 0;
  let count = 0;
  sheet.eachRow((row, index) => {
    const serial = Number(row.getCell(1).value);
    if (
      index > 1 &&
      Number.isInteger(serial) &&
      serial > 0 &&
      row.getCell(2).text.trim()
    ) {
      count += 1;
    }
  });
  return count;
}

function toIsoDate(value: unknown, fallback: string) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86_400_000));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return fallback.trim();
}

export async function updateInterviewCall(
  dir: DirectoryHandle,
  applicationNumber: number,
  status: InterviewCallStatus,
): Promise<void> {
  const { workbook, sheet } = await loadWorkbook(dir);
  if (!sheet) throw new Error(`${TRACKER_FILE} was not found.`);

  let targetRow: number | undefined;
  sheet.eachRow((row, index) => {
    if (index > 1 && Number(row.getCell(1).value) === applicationNumber) {
      targetRow = index;
    }
  });

  if (!targetRow) {
    throw new Error(`Application #${applicationNumber} was not found in ${TRACKER_FILE}.`);
  }

  const cell = sheet.getCell(targetRow, 6);
  cell.value = status;
  cell.dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: ['"Yes,No"'],
    showErrorMessage: true,
    errorTitle: "Interview Call",
    error: "Choose Yes or No",
  };

  try {
    const bytes = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
    await writeFile(dir, TRACKER_FILE, bytes);
  } catch (error) {
    throw new Error(
      `Could not update ${TRACKER_FILE}. Close it in Excel and retry. ${(error as Error).message}`,
    );
  }
}

export async function readApplications(
  dir: DirectoryHandle,
): Promise<TrackerApplication[]> {
  const { sheet } = await loadWorkbook(dir);
  if (!sheet) return [];

  const applications: TrackerApplication[] = [];
  sheet.eachRow((row, index) => {
    if (index <= 1) return;
    const n = Number(row.getCell(1).value);
    const company = row.getCell(2).text.trim();
    if (!Number.isInteger(n) || n <= 0 || !company) return;

    const linkValue = row.getCell(5).value as any;
    const jobLink =
      typeof linkValue === "object" && linkValue?.hyperlink
        ? String(linkValue.hyperlink)
        : row.getCell(5).text.trim().replace(/^Open job$/i, "");

    applications.push({
      n,
      company,
      role: row.getCell(3).text.trim(),
      location: row.getCell(4).text.trim(),
      jobLink,
      interviewCall: row.getCell(6).text.trim().toLowerCase() === "yes" ? "Yes" : "No",
      appliedOn: toIsoDate(row.getCell(7).value, row.getCell(7).text),
      resumeFile: row.getCell(8).text.trim(),
      notes: row.getCell(9).text.trim(),
    });
  });
  return applications;
}
