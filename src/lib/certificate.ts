import type { CertificateIssue, CertificateSettings } from "./types";

/** Everything a certificate needs before any artwork has been uploaded. */
export const DEFAULT_CERTIFICATE: CertificateSettings = {
  orgName: "Levitate PeopleSoft",
  website: "www.levitatepeoplesoft.com",
  logoUrl: "",
  sealUrl: "",
  accreditationLogoUrl: "",
  recognitionStripUrl: "",
  borderUrl: "",
  shrmPlateUrl: "",
  excellencePlateUrl: "",
  plateHasSampleText: true,
  primarySignatureUrl: "",
  primaryName: "Parichita Kotnala",
  primaryTitle: "Trainer",
  secondSignatureUrl: "",
  secondName: "",
  secondTitle: "",
  closingNote: "under the **Prevention of Sexual Harassment at Workplace** (POSH Act, 2013).",
  accreditationNote:
    "Levitate PeopleSoft is approved by SHRM to offer Professional Development Credits (PDCs) for the SHRM Certification Program (SHRM-CP® or SHRM-SCP®). For more information about SHRM certification or recertification, please visit www.shrmcertification.org.",
};

/**
 * One canvas per format, matching the artwork's own proportions.
 *
 * Not a shared A4 box: the two designs are 3:2 and 16:9, and forcing either
 * into the other's shape would letterbox the plate or crop it. Print pages are
 * sized to match, below.
 */
export const CANVASES = {
  shrm: { w: 1536, h: 1024, pageMm: { w: 297, h: 198 } },
  excellence: { w: 1600, h: 900, pageMm: { w: 297, h: 167 } },
} as const;

/**
 * Splits text into lines of at most `max` characters, breaking on spaces.
 *
 * SVG text does not wrap, and a certificate carries exactly one piece of
 * unpredictable text — the course name. This is enough for that, and keeps the
 * layout free of foreignObject, which does not survive being rasterised.
 */
export function wrap(text: string, max: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w;
    else if (`${line} ${w}`.length <= max) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  lines.push(line);
  return lines;
}

export type RichWord = { text: string; bold: boolean };
export type RichLine = RichWord[];

/**
 * Wraps a run of mixed-weight words into lines.
 *
 * The Award format sets the course title on the same line as its lead-in —
 * "for satisfactorily completing the **Certified POSH…**" — so the two cannot
 * be laid out as separate blocks without gaining a line the artwork has no
 * room for.
 */
export function wrapRich(words: RichWord[], max: number): RichLine[] {
  const lines: RichLine[] = [];
  let line: RichLine = [];
  let length = 0;

  for (const word of words) {
    const cost = (line.length ? 1 : 0) + word.text.length;
    if (line.length && length + cost > max) {
      lines.push(line);
      line = [word];
      length = word.text.length;
    } else {
      line.push(word);
      length += cost;
    }
  }
  if (line.length) lines.push(line);
  return lines.length ? lines : [[]];
}

export const richWords = (text: string, bold: boolean): RichWord[] =>
  text.trim().split(/\s+/).filter(Boolean).map((t) => ({ text: t, bold }));

/**
 * Splits `**emphasis**` out of a line of copy.
 *
 * The artwork bolds part of its closing line — "under the **Prevention of
 * Sexual Harassment at Workplace** (POSH Act, 2013)." — and which part is
 * emphasised changes with the statute, so it belongs in the text rather than
 * in the layout.
 */
export function parseRich(text: string): RichWord[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .flatMap((chunk) =>
      chunk.startsWith("**") && chunk.endsWith("**")
        ? richWords(chunk.slice(2, -2), true)
        : richWords(chunk, false),
    );
}

/**
 * Merges neighbouring words of the same weight into one run.
 *
 * A `tspan` per word leaves the renderer to reconcile a dozen fragments per
 * line, and spacing between them is not reliably preserved once the SVG is
 * serialised for export. One run per weight change is both fewer nodes and
 * exactly what the markup means.
 */
export function runsOf(line: RichLine): RichWord[] {
  const runs: RichWord[] = [];
  for (const word of line) {
    const last = runs[runs.length - 1];
    if (last && last.bold === word.bold) last.text += ` ${word.text}`;
    else runs.push({ text: word.text, bold: word.bold });
  }
  return runs;
}

/**
 * Fits `count` lines into a fixed band, centred on it.
 *
 * A plate's text sits at fixed coordinates, so anything drawn over it has to
 * stay inside the space the artwork left — growing downwards would run into
 * whatever is printed underneath. Long titles get tighter leading and smaller
 * type instead of more room.
 */
export function fitBlock(count: number, centre: number, steps: number[], sizes: number[]) {
  const i = Math.min(count - 1, steps.length - 1);
  const step = steps[Math.max(0, i)];
  const size = sizes[Math.max(0, i)];
  return { step, size, startY: centre - ((count - 1) * step) / 2 };
}

/** A readable id: 2026-08-001. The sequence is the operator's to keep. */
export function suggestId(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-001`;
}

export const today = () =>
  new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/* --------------------------------- plates -------------------------------- */

/**
 * Plates dropped into `public/certificates/` are picked up without any setup.
 *
 * The alternative is uploading them through Branding, which works too — this
 * exists so the artwork can simply be put in the repo and shipped with the
 * build, no Supabase round trip and no per-browser configuration.
 */
export const LOCAL_PLATES = {
  shrm: "/certificates/shrm.jpg",
  excellence: "/certificates/excellence.jpg",
} as const;

/** Resolves once per URL — a missing file is a 404, not an exception. */
const probes = new Map<string, Promise<boolean>>();

export function plateExists(url: string): Promise<boolean> {
  const cached = probes.get(url);
  if (cached) return cached;
  const probe = new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = url;
  });
  probes.set(url, probe);
  return probe;
}

/**
 * A region of a plate covered before the real value is written over it.
 *
 * `sampleAt` is a point just outside the patch, on the same background. The
 * colour is read from the plate itself rather than assumed, so a patch over the
 * blue panel comes out blue and one over the body comes out white — which is
 * what makes artwork with its specimen text still on it usable.
 */
export type MaskRegion = { id: string; x: number; y: number; w: number; h: number; sampleAt: [number, number] };

export const MASKS: Record<"shrm" | "excellence", MaskRegion[]> = {
  // Measured off the artwork. Every rectangle stays inside the plate's white
  // field — a patch that strayed onto the engraved border would erase it.
  shrm: [
    { id: "name", x: 200, y: 338, w: 1150, h: 84, sampleAt: [200, 380] },
    // 478 threads a six-pixel gap: the artwork's "Completed the" drops its p to
    // ~476, and the course title's capitals start at ~481. Higher shears the
    // descender, lower leaves a sliver of the old title showing above.
    { id: "course", x: 250, y: 478, w: 1050, h: 84, sampleAt: [270, 520] },
    { id: "pdcs", x: 330, y: 610, w: 900, h: 46, sampleAt: [350, 632] },
  ],
  excellence: [
    { id: "name", x: 480, y: 268, w: 1040, h: 86, sampleAt: [450, 300] },
    // Covers the whole three-line paragraph, which is redrawn rather than
    // patched around: the course title shares a line with its lead-in.
    { id: "course", x: 450, y: 368, w: 1100, h: 124, sampleAt: [430, 400] },
    { id: "chip", x: 740, y: 505, w: 520, h: 58, sampleAt: [760, 534] },
    // On the gradient panel — which is exactly why the colour is sampled.
    { id: "certId", x: 200, y: 780, w: 180, h: 34, sampleAt: [190, 797] },
    { id: "issued", x: 200, y: 828, w: 180, h: 34, sampleAt: [190, 845] },
  ],
};

export type MaskColors = Record<string, string>;

/**
 * Reads the plate's own background colour behind each patch.
 *
 * Drawn into a canvas first because the alternative — guessing "#ffffff" —
 * leaves a visible white block anywhere the artwork is not white.
 */
export async function sampleMaskColors(plateUrl: string, template: "shrm" | "excellence", canvas: { w: number; h: number }): Promise<MaskColors> {
  const regions = MASKS[template];
  const fallback: MaskColors = Object.fromEntries(regions.map((r) => [r.id, "#ffffff"]));
  if (typeof window === "undefined" || !plateUrl) return fallback;

  try {
    // Via a blob so the canvas is never tainted, whatever the host's CORS.
    const res = await fetch(plateUrl, { mode: "cors" });
    const objectUrl = URL.createObjectURL(await res.blob());
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("plate did not load"));
        i.src = objectUrl;
      });

      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return fallback;
      ctx.drawImage(img, 0, 0);

      // The plate may be any size; sample points are in canvas coordinates.
      const sx = img.naturalWidth / canvas.w;
      const sy = img.naturalHeight / canvas.h;

      return Object.fromEntries(
        regions.map((r) => {
          const px = Math.max(0, Math.min(img.naturalWidth - 1, Math.round(r.sampleAt[0] * sx)));
          const py = Math.max(0, Math.min(img.naturalHeight - 1, Math.round(r.sampleAt[1] * sy)));
          const [red, green, blue] = ctx.getImageData(px, py, 1, 1).data;
          return [r.id, `rgb(${red}, ${green}, ${blue})`];
        }),
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return fallback;
  }
}

/* --------------------------------- export -------------------------------- */

/**
 * Turns the live SVG into a PNG.
 *
 * Remote images have to be inlined first: a canvas that has drawn a
 * cross-origin image refuses `toBlob`, and every mark on a certificate is a
 * Supabase URL. Fetching each one as a data URI sidesteps that entirely rather
 * than depending on the bucket's CORS headers staying as they are.
 */
export async function svgToPng(svg: SVGSVGElement, size: { w: number; h: number }, scale = 2): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  const images = Array.from(clone.querySelectorAll("image"));
  await Promise.all(
    images.map(async (img) => {
      const href = img.getAttribute("href") ?? img.getAttribute("xlink:href");
      if (!href || href.startsWith("data:")) return;
      try {
        const res = await fetch(href, { mode: "cors" });
        const blob = await res.blob();
        const dataUri = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(new Error("read failed"));
          fr.readAsDataURL(blob);
        });
        img.setAttribute("href", dataUri);
        img.removeAttribute("xlink:href");
      } catch {
        // An image that will not load is dropped rather than left to taint the
        // canvas and fail the whole export.
        img.remove();
      }
    }),
  );

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("The certificate could not be rendered."));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size.w * scale;
    canvas.height = size.h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable in this browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image could not be encoded."))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Filename stem — `certificate-ananya-rao`, safe on every filesystem. */
export const fileStem = (issue: CertificateIssue) =>
  `certificate-${(issue.recipientName || "recipient").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
