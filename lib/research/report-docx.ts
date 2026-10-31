import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ResearchReport } from "./report";

/**
 * Renders a research report as a .docx lab-handoff document:
 * narrative sections with bracket citations plus a numbered,
 * hyperlinked references section.
 */

function heading(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, text });
}

function body(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun(text)] });
}

function citeSuffix(cites: number[]): string {
  return cites.length > 0 ? ` [${cites.join(", ")}]` : "";
}

export async function reportToDocx(report: ResearchReport): Promise<Buffer> {
  const narrative = report.narrative;
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      text: `Literature Brief — ${report.target}`,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated ${report.generatedAt} · ${report.model} · ${report.evidenceCount} references${report.cached ? " · cached" : ""}${report.fallback ? " · synthesis fallback" : ""}`,
          italics: true,
          size: 20,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
    heading("Background"),
    body(narrative.background),
    heading("Biological rationale"),
    body(narrative.rationale),
    heading("Supported targets"),
    ...narrative.targets.map(
      (entry) =>
        new Paragraph({
          text: `• ${entry.name}: ${entry.note}${citeSuffix(entry.cites)}`,
        })
    ),
    heading("Safety: what to avoid"),
    body(narrative.safety.length > 0 ? narrative.safety : "No avoid list converged."),
    heading("Limitations"),
    body(
      narrative.limitations.length > 0
        ? narrative.limitations
        : "No limitations recorded."
    ),
    heading("References"),
    ...report.references.map(
      (ref) =>
        new Paragraph({
          children: [
            new TextRun({ text: `[${ref.n}] `, bold: true }),
            ref.url.length > 0
              ? new ExternalHyperlink({
                  link: ref.url,
                  children: [new TextRun({ text: ref.title })],
                })
              : new TextRun(ref.title),
            new TextRun({
              text: ` — ${ref.source}${ref.year !== null ? `, ${ref.year}` : ""}`,
              italics: true,
            }),
          ],
        })
    ),
  ];
  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
