"use client";

import { forwardRef } from "react";
import { CANVASES, MASKS, fitBlock, parseRich, richWords, runsOf, wrap, wrapRich, type MaskColors, type MaskRegion } from "@/lib/certificate";
import type { CertificateIssue, CertificateSettings } from "@/lib/types";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Plus Jakarta Sans', 'Segoe UI', sans-serif";

/**
 * Both certificate formats, drawn on a canvas the size of the artwork.
 *
 * A plate — the finished design, uploaded once — is the background, and only
 * the fields that change are drawn on top, at coordinates measured from the
 * reference. That is what makes the output identical to the design rather than
 * a lookalike: the trademarks, the engraved border and the signatures stay as
 * artwork instead of being approximated in code.
 *
 * Without a plate the layout is drawn from scratch, which is close but never
 * exact. It exists so a certificate is still legible before the artwork has
 * been uploaded, not as the intended output.
 */
type Props = {
  issue: CertificateIssue;
  settings: CertificateSettings;
  /** Plate URL in force — a local file, an uploaded one, or empty. */
  plate: string;
  /** Background colour read from the plate behind each patch. */
  maskColors: MaskColors;
};

const CertificateArt = forwardRef<SVGSVGElement, Props>(
  function CertificateArt({ issue, settings, plate, maskColors }, ref) {
    const canvas = CANVASES[issue.template];
    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${canvas.w} ${canvas.h}`}
        width={canvas.w}
        height={canvas.h}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", width: "100%", height: "auto", background: "#fff" }}
        role="img"
        aria-label={`Certificate for ${issue.recipientName || "recipient"}`}
      >
        {issue.template === "shrm"
          ? <Shrm issue={issue} settings={settings} plate={plate} maskColors={maskColors} />
          : <Excellence issue={issue} settings={settings} plate={plate} maskColors={maskColors} />}
      </svg>
    );
  },
);

export default CertificateArt;

/* -------------------------- A · SHRM, 1536 × 1024 ------------------------- */

const S = CANVASES.shrm;
const S_MID = S.w / 2;
const S_NAVY = "#1b3f88";
const S_INK = "#111111";

function Shrm({ issue, settings, plate, maskColors }: Omit<Props, "issue"> & { issue: CertificateIssue }) {
  const mask = Boolean(plate) && settings.plateHasSampleText;
  const patch = (id: string) => maskColors[id] ?? "#ffffff";
  const M = Object.fromEntries(MASKS.shrm.map((r) => [r.id, r]));
  const courseLines = wrap(issue.courseName || "Course name", 52);
  // Fitted between the artwork's "Completed the" and "Offered by", both of
  // which are fixed. A long title tightens instead of colliding with them.
  const course = fitBlock(courseLines.length, 524, [38, 38, 26, 22], [32, 32, 23, 20]);

  return (
    <>
      <rect width={S.w} height={S.h} fill="#fff" />

      {plate ? (
        <image href={plate} x="0" y="0" width={S.w} height={S.h} preserveAspectRatio="none" />
      ) : (
        <>
          {settings.borderUrl ? (
            <image href={settings.borderUrl} x="0" y="0" width={S.w} height={S.h} preserveAspectRatio="none" />
          ) : (
            <DrawnBorder />
          )}
          {settings.accreditationLogoUrl ? (
            <image href={settings.accreditationLogoUrl} x="168" y="150" width="192" height="180" preserveAspectRatio="xMidYMid meet" />
          ) : (
            <g>
              <rect x="168" y="150" width="192" height="180" rx="8" fill="#eef2f8" stroke="#c9d6ea" />
              <text x="264" y="235" textAnchor="middle" fontFamily={SANS} fontSize="16" fontWeight="800" fill="#8aa0bf">ACCREDITOR</text>
              <text x="264" y="262" textAnchor="middle" fontFamily={SANS} fontSize="12" fontWeight="600" fill="#a8b8ce">logo goes here</text>
            </g>
          )}
          <text x={S_MID + 78} y="248" textAnchor="middle" fontFamily={SERIF} fontSize="66" fill={S_INK}>
            Certificate of Completion
          </text>
          <text x={S_MID} y="308" textAnchor="middle" fontFamily={SERIF} fontSize="30" fill={S_INK}>
            This Acknowledges That
          </text>
          <text x={S_MID} y="474" textAnchor="middle" fontFamily={SERIF} fontSize="29" fill={S_INK}>
            Completed the
          </text>
          <text x={S_MID} y="598" textAnchor="middle" fontFamily={SERIF} fontSize="30" fill={S_INK}>
            Offered by{" "}
            <tspan fontWeight="700" fill={S_NAVY}>{settings.orgName}</tspan>
          </text>
          <line x1="262" y1="690" x2="672" y2="690" stroke="#2f6f68" strokeWidth="2" />
          <line x1="833" y1="690" x2="1243" y2="690" stroke="#2f6f68" strokeWidth="2" />
          <text x="467" y="790" textAnchor="middle" fontFamily={SERIF} fontSize="24" fill={S_INK}>
            Signature of Affiliate Representative
          </text>
          <text x="467" y="824" textAnchor="middle" fontFamily={SERIF} fontSize="24" fill={S_INK}>
            {settings.primaryName}
          </text>
          <text x="467" y="858" textAnchor="middle" fontFamily={SERIF} fontSize="24" fill={S_INK}>
            {settings.orgName}
          </text>
          <text x="1038" y="718" textAnchor="middle" fontFamily={SERIF} fontSize="24" fill={S_INK}>
            Date of Program or Course
          </text>
          {wrap(settings.accreditationNote, 128).map((line, i) => (
            <text key={i} x={S_MID} y={906 + i * 28} textAnchor="middle" fontFamily={SERIF} fontSize="19" fill={S_INK}>
              {i === 0 ? <tspan fontWeight="700" fill={S_NAVY}>{settings.orgName}</tspan> : null}
              {i === 0 ? line.slice(settings.orgName.length) : line}
            </text>
          ))}
        </>
      )}

      {/* signature sits above the rule whether drawn or plated */}
      {settings.primarySignatureUrl && !plate && (
        <image href={settings.primarySignatureUrl} x="372" y="614" width="190" height="72" preserveAspectRatio="xMidYMax meet" />
      )}

      {/* ---- the fields that change ---- */}

      {mask && <Patch r={M.name} fill={patch("name")} />}
      <text x={S_MID} y="402" textAnchor="middle" fontFamily={SERIF} fontSize="60" fill={S_NAVY}>
        {issue.recipientName || "[Name of Recipient]"}
      </text>

      {/* Patches are pinned: the artwork's text never moves, so one that moved
          with the redrawn copy would slide off what it is there to hide. */}
      {mask && <Patch r={M.course} fill={patch("course")} />}
      {courseLines.map((line, i) => (
        <text key={i} x={S_MID} y={course.startY + i * course.step} textAnchor="middle" fontFamily={SERIF} fontSize={course.size} fontWeight="700" fill={S_NAVY}>
          {line}
        </text>
      ))}

      {mask && <Patch r={M.pdcs} fill={patch("pdcs")} />}
      <text x={S_MID} y="640" textAnchor="middle" fontFamily={SERIF} fontSize="27" fill={S_INK}>
        And has earned{" "}
        <tspan fontWeight="700" fill={S_NAVY}>{issue.pdcs || "[Number]"}</tspan>
        {" "}PDCs towards SHRM recertification
      </text>

      <text x="1038" y="672" textAnchor="middle" fontFamily={SERIF} fontSize="26" fontWeight="700" fill={S_NAVY}>
        {issue.completedOn}
      </text>
    </>
  );
}

/** Stand-in for engraved guilloche. Never mistaken for it — upload the plate. */
function DrawnBorder() {
  const corners = [
    [88, 88],
    [S.w - 88, 88],
    [88, S.h - 88],
    [S.w - 88, S.h - 88],
  ];
  return (
    <g>
      <rect x="34" y="34" width={S.w - 68} height={S.h - 68} fill="none" stroke="#3f6fbf" strokeWidth="14" opacity="0.22" />
      <rect x="58" y="58" width={S.w - 116} height={S.h - 116} fill="none" stroke="#2b5aa8" strokeWidth="2.6" />
      <rect x="68" y="68" width={S.w - 136} height={S.h - 136} fill="none" stroke="#5f8ed4" strokeWidth="1.2" />
      <rect x="98" y="98" width={S.w - 196} height={S.h - 196} fill="none" stroke="#9fbde6" strokeWidth="1" />
      {corners.map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="17" fill="none" stroke="#2b5aa8" strokeWidth="2" />
          <circle cx={cx} cy={cy} r="9" fill="#2b5aa8" opacity="0.5" />
          <circle cx={cx} cy={cy} r="3.4" fill="#fff" />
        </g>
      ))}
    </g>
  );
}

/* ----------------------- B · Excellence, 1600 × 900 ----------------------- */

const E = CANVASES.excellence;
const E_PANEL = 398;
const E_MID = E_PANEL + (E.w - E_PANEL) / 2;
const E_INK = "#0d2748";
const E_TEAL = "#2f8f86";

function Excellence({ issue, settings, plate, maskColors }: Omit<Props, "issue"> & { issue: CertificateIssue }) {
  const mask = Boolean(plate) && settings.plateHasSampleText;
  const patch = (id: string) => maskColors[id] ?? "#ffffff";
  const M = Object.fromEntries(MASKS.excellence.map((r) => [r.id, r]));
  const twoUp = Boolean(settings.secondName.trim());

  // One flowed sentence — lead-in, title in bold, closing line — because the
  // artwork sets the title on the same line as its lead-in. Laying them out as
  // separate blocks costs a line there is no room for.
  const bodyLines = wrapRich(
    [
      ...richWords("for satisfactorily completing the", false),
      ...richWords(issue.courseName || "Course name", true),
      // `**…**` in the closing line marks what the artwork sets in bold.
      ...parseRich(settings.closingNote),
    ],
    58,
  );
  // The band between the rule under the name and the completed chip.
  const body = fitBlock(bodyLines.length, 434, [37, 37, 37, 31, 26], [21, 21, 21, 18, 16]);

  return (
    <>
      <defs>
        <linearGradient id="e-panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0b3a7d" />
          <stop offset="55%" stopColor="#14589f" />
          <stop offset="100%" stopColor="#1d7fc4" />
        </linearGradient>
        <linearGradient id="e-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d9ecf7" />
          <stop offset="100%" stopColor="#f4fafd" />
        </linearGradient>
      </defs>

      <rect width={E.w} height={E.h} fill="#fff" />

      {plate ? (
        <image href={plate} x="0" y="0" width={E.w} height={E.h} preserveAspectRatio="none" />
      ) : (
        <>
          <path d={`M ${E.w - 340} 0 A 340 340 0 0 1 ${E.w} 340 L ${E.w} 0 Z`} fill="url(#e-arc)" />
          <path d={`M ${E.w - 240} 0 A 240 240 0 0 1 ${E.w} 240`} fill="none" stroke="#cfe4f2" strokeWidth="1.4" />
          <rect x="0" y="0" width={E_PANEL} height={E.h} fill="url(#e-panel)" />
          <path d={`M 0 ${E.h - 370} Q ${E_PANEL * 0.6} ${E.h - 280} ${E_PANEL} ${E.h - 40}`} fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.18" />

          <text x="28" y="42" fontFamily={SANS} fontSize="15" fontWeight="700" fill="#eaf4ff" letterSpacing="2.6">
            — AWARD OF EXCELLENCE
          </text>

          {settings.sealUrl ? (
            <image href={settings.sealUrl} x={E_PANEL / 2 - 100} y="190" width="200" height="200" preserveAspectRatio="xMidYMid meet" />
          ) : (
            <g>
              <circle cx={E_PANEL / 2} cy="290" r="95" fill="#0d2f63" stroke="#e8b53d" strokeWidth="8" />
              <circle cx={E_PANEL / 2} cy="290" r="76" fill="none" stroke="#f0cf7a" strokeWidth="1.8" />
              <text x={E_PANEL / 2} y="284" textAnchor="middle" fontFamily={SANS} fontSize="17" fontWeight="800" fill="#fff" letterSpacing="1.4">
                {settings.orgName.split(" ")[0].toUpperCase()}
              </text>
              <text x={E_PANEL / 2} y="310" textAnchor="middle" fontFamily={SANS} fontSize="10" fontWeight="600" fill="#c9dcf5" letterSpacing="2.2">
                CERTIFIED
              </text>
            </g>
          )}

          <rect x="22" y="545" width={E_PANEL - 44} height="95" rx="9" fill="#0b2b58" opacity="0.55" />
          <text x={E_PANEL / 2} y="583" textAnchor="middle" fontFamily={SANS} fontSize="17" fontWeight="700" fill="#fff">AUTHORISED TRAINING</text>
          <text x={E_PANEL / 2} y="611" textAnchor="middle" fontFamily={SANS} fontSize="17" fontWeight="700" fill="#fff">PARTNER</text>

          <text x="28" y="800" fontFamily={SANS} fontSize="14" fontWeight="500" fill="#bcd6f2">Certificate ID</text>
          <text x="28" y="847" fontFamily={SANS} fontSize="14" fontWeight="500" fill="#bcd6f2">Issue Date</text>

          {settings.logoUrl ? (
            <image href={settings.logoUrl} x={E_MID - 120} y="46" width="240" height="62" preserveAspectRatio="xMidYMid meet" />
          ) : (
            <text x={E_MID} y="94" textAnchor="middle" fontFamily={SANS} fontSize="27" fontWeight="800" fill={E_INK} letterSpacing="3.4">
              {settings.orgName.toUpperCase()}
            </text>
          )}

          <text x={E_MID} y="190" textAnchor="middle" fontFamily={SERIF} fontSize="47" fontWeight="700" fill={E_INK}>
            Certificate of Training Completion
          </text>
          <text x={E_MID} y="238" textAnchor="middle" fontFamily={SANS} fontSize="15" fontWeight="700" fill={E_TEAL} letterSpacing="3.6">
            THIS CERTIFICATE IS PROUDLY PRESENTED TO
          </text>
          <line x1="700" y1="352" x2={E.w - 70} y2="352" stroke="#d5e2ee" strokeWidth="1.4" />
          <text x={E_MID} y="402" textAnchor="middle" fontFamily={SANS} fontSize="20" fill="#3d4b5c">
            for satisfactorily completing the
          </text>

          <Signature x={twoUp ? 586 : E_MID} y={660} imageUrl={settings.primarySignatureUrl} name={settings.primaryName} title={settings.primaryTitle} />
          {twoUp && (
            <Signature x={E.w - 215} y={660} imageUrl={settings.secondSignatureUrl} name={settings.secondName} title={settings.secondTitle} />
          )}

          <text x="545" y="826" fontFamily={SANS} fontSize="14" fontWeight="700" fill="#5b6b7c" letterSpacing="2.6">RECOGNISED BY</text>
          {settings.recognitionStripUrl && (
            <image href={settings.recognitionStripUrl} x="700" y="790" width="530" height="62" preserveAspectRatio="xMidYMid meet" />
          )}
          <text x={E.w - 46} y="828" textAnchor="end" fontFamily={SANS} fontSize="15" fontWeight="700" fill={E_INK}>
            {settings.website}
          </text>
        </>
      )}

      {/* ---- the fields that change ---- */}

      {mask && <Patch r={M.name} fill={patch("name")} />}
      <text x={E_MID} y="332" textAnchor="middle" fontFamily={SERIF} fontSize="68" fontStyle="italic" fill={E_INK}>
        {issue.recipientName || "Your Name Here"}
      </text>

      {/* The whole paragraph is patched and redrawn, not just the title: in the
          artwork the course name shares its line with the lead-in, so there is
          no way to cover one without covering the other.

          The patch is pinned — the artwork's text never moves, so a patch that
          moved with the redrawn copy would slide off what it is meant to hide.
          Long titles therefore tighten to fit rather than run downwards. */}
      {mask && <Patch r={M.course} fill={patch("course")} />}
      {bodyLines.map((line, i) => (
        <text
          key={i}
          x={E_MID}
          y={body.startY + i * body.step}
          textAnchor="middle"
          fontFamily={SANS}
          fontSize={body.size}
          fill="#3d4b5c"
        >
          {runsOf(line).map((run, r) => (
            <tspan key={r} fontWeight={run.bold ? "700" : "400"} fill={run.bold ? E_INK : "#3d4b5c"}>
              {r ? " " : ""}
              {run.text}
            </tspan>
          ))}
        </text>
      ))}

      {/* completed / hours — pinned, for the same reason */}
      {mask && <Patch r={M.chip} fill={patch("chip")} rx={10} />}
      {!plate && <rect x="740" y="505" width="520" height="58" rx="10" fill="#f3f7fa" stroke="#e0eaf2" />}
      <text x="776" y="543" fontFamily={SANS} fontSize="15" fontWeight="700" fill="#5b6b7c" letterSpacing="2.4">COMPLETED</text>
      <text x="950" y="543" fontFamily={SANS} fontSize="19" fontWeight="800" fill={E_INK}>{issue.completedOn || "—"}</text>
      <text x="1100" y="543" fontFamily={SANS} fontSize="18" fontWeight="400" fill="#c3cfdb">|</text>
      <text x="1124" y="543" fontFamily={SANS} fontSize="19" fontWeight="800" fill={E_TEAL}>{issue.hours || "—"}</text>

      {/* Sampled from the plate, so these patch correctly over the gradient. */}
      {mask && <Patch r={M.certId} fill={patch("certId")} />}
      {mask && <Patch r={M.issued} fill={patch("issued")} />}
      <text x="362" y="805" textAnchor="end" fontFamily={SANS} fontSize="17" fontWeight="800" fill="#ffffff">
        {issue.certificateId || "—"}
      </text>
      <text x="362" y="852" textAnchor="end" fontFamily={SANS} fontSize="17" fontWeight="800" fill="#ffffff">
        {issue.completedOn || "—"}
      </text>
    </>
  );
}

function Signature({ x, y, imageUrl, name, title }: { x: number; y: number; imageUrl: string; name: string; title: string }) {
  return (
    <g>
      {imageUrl && <image href={imageUrl} x={x - 95} y={y - 68} width="190" height="64" preserveAspectRatio="xMidYMax meet" />}
      <line x1={x - 120} y1={y} x2={x + 120} y2={y} stroke="#b9c6d3" strokeWidth="1.4" />
      <text x={x} y={y + 30} textAnchor="middle" fontFamily={SANS} fontSize="17" fontWeight="800" fill={E_INK}>{name}</text>
      <text x={x} y={y + 56} textAnchor="middle" fontFamily={SANS} fontSize="13" fontWeight="600" fill="#6b7b8c" letterSpacing="1.8">
        {title.toUpperCase()}
      </text>
    </g>
  );
}

/**
 * One patch over a plate's specimen text, in the plate's own background colour.
 *
 * `shift` moves it with the block above; `grow` extends it when the course
 * title wraps to more lines than the specimen had.
 */
function Patch({ r, fill, shift = 0, grow = 0, rx = 0 }: { r: MaskRegion; fill: string; shift?: number; grow?: number; rx?: number }) {
  return <rect x={r.x} y={r.y + shift} width={r.w} height={r.h + grow} rx={rx} fill={fill} />;
}
