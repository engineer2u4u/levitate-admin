/**
 * A spreadsheet, built in the browser.
 *
 * CSV would have been fewer lines, and it is what the one older export here
 * still writes — but a CSV of Indian phone numbers and codes like `LVT-91N219`
 * is at the mercy of whatever Excel decides each column is, and a "+919899…"
 * read as a number comes out as 9.19899E+11. An .xlsx says the cell is text
 * and is believed.
 *
 * An .xlsx is a ZIP of XML parts. Entries are stored rather than deflated,
 * which keeps this to a CRC and some headers instead of a compressor: a roster
 * is a few kilobytes of text either way. The ZIP half is the same writer the
 * website uses for the reading kit (`src/lib/lms/zip.ts` there) — kept separate
 * rather than shared, because the two repos deploy independently.
 */

/** CRC-32, which every ZIP entry's header has to carry. */
const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS time and date, which is what a ZIP header stores. */
function dosStamp(at: Date) {
  const time = (at.getHours() << 11) | (at.getMinutes() << 5) | (Math.floor(at.getSeconds() / 2) & 0x1f);
  const date = ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
  return { time, date };
}

type ZipEntry = { name: string; data: Uint8Array };

function zipFiles(entries: ZipEntry[], at = new Date()): Blob {
  const { time, date } = dosStamp(at);
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, entry.data.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // no extra field
    local.set(name, 30);

    const head = new Uint8Array(46 + name.length);
    const hv = new DataView(head.buffer);
    hv.setUint32(0, 0x02014b50, true); // central directory header
    hv.setUint16(4, 20, true); // version made by
    hv.setUint16(6, 20, true); // version needed
    hv.setUint16(8, 0, true);
    hv.setUint16(10, 0, true);
    hv.setUint16(12, time, true);
    hv.setUint16(14, date, true);
    hv.setUint32(16, crc, true);
    hv.setUint32(20, entry.data.length, true);
    hv.setUint32(24, entry.data.length, true);
    hv.setUint16(28, name.length, true);
    hv.setUint16(30, 0, true); // extra
    hv.setUint16(32, 0, true); // comment
    hv.setUint16(34, 0, true); // disk
    hv.setUint16(36, 0, true); // internal attributes
    hv.setUint32(38, 0, true); // external attributes
    hv.setUint32(42, offset, true); // where its local header is
    head.set(name, 46);

    parts.push(local, entry.data);
    central.push(head);
    offset += local.length + entry.data.length;
  }

  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...parts, ...central, end] as BlobPart[], { type: "application/zip" });
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // A control character is not valid in XML at all, and one pasted into a
    // name would make the whole file unopenable rather than merely untidy.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** A1, B1 … Z1, AA1. */
const cellRef = (col: number, row: number) => {
  let name = "";
  let n = col + 1;
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = (n - 1 - rest) / 26;
  }
  return `${name}${row + 1}`;
};

const PART = {
  types: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  rels: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  bookRels: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  // Two cell formats: plain, and bold for the header row.
  styles: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
};

/**
 * One sheet of text, as an .xlsx.
 *
 * Every cell is written as an inline string — including anything that looks
 * like a number. A phone number, an enrolment code and a certificate number
 * are all identifiers: Excel guessing otherwise is the failure this exists to
 * avoid. Money and counts are formatted into text by the caller, which already
 * knows how they should read.
 *
 * The first row is treated as the header: bold, and frozen so it stays put
 * while the roster scrolls.
 */
export function sheetToXlsx(rows: string[][], sheetName = "Sheet1", widths: number[] = []): Blob {
  const body = rows
    .map((cells, r) =>
      `<row r="${r + 1}">${cells
        .map((value, c) =>
          `<c r="${cellRef(c, r)}" t="inlineStr"${r === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(value ?? "")}</t></is></c>`)
        .join("")}</row>`)
    .join("");

  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${body}</sheetData></worksheet>`;

  // Excel takes the sheet's name from here, and refuses the file over
  // characters it does not allow in one.
  const safeName = sheetName.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Sheet1";
  const book = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const enc = new TextEncoder();
  const zip = zipFiles([
    { name: "[Content_Types].xml", data: enc.encode(PART.types) },
    { name: "_rels/.rels", data: enc.encode(PART.rels) },
    { name: "xl/workbook.xml", data: enc.encode(book) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(PART.bookRels) },
    { name: "xl/styles.xml", data: enc.encode(PART.styles) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheet) },
  ]);

  return new Blob([zip], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Hands the file to the browser. */
export function downloadXlsx(rows: string[][], filename: string, sheetName?: string, widths?: number[]) {
  const url = URL.createObjectURL(sheetToXlsx(rows, sheetName, widths));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
