import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { AssessmentResult, CandidateInfo, ConversationTurn, LLMProvider } from "@/types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 44;

interface AdminReportInput {
  candidate: CandidateInfo;
  transcript: ConversationTurn[];
  result: AssessmentResult;
  interviewId?: string;
  evaluationProviders?: LLMProvider[];
  warning?: string;
}

interface ResendResponse {
  id?: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function cleanText(input: string): string {
  return input
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const normalized = cleanText(text);
  if (!normalized) return [""];

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function dateTimeLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function buildInterviewPdf({
  candidate,
  transcript,
  result,
  interviewId,
  evaluationProviders = [],
  warning,
}: AdminReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const startNewPage = (withHeader: boolean) => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;

    if (withHeader) {
      page.drawText("Cuemath Tutor Screener Report", {
        x: MARGIN,
        y,
        size: 12,
        font: fontBold,
        color: rgb(0.12, 0.16, 0.23),
      });
      y -= 22;
    }
  };

  const ensureSpace = (height: number) => {
    if (y - height < MARGIN) startNewPage(true);
  };

  const drawWrapped = (
    text: string,
    options: {
      size?: number;
      color?: ReturnType<typeof rgb>;
      font?: PDFFont;
      leading?: number;
      indent?: number;
    } = {}
  ) => {
    const size = options.size ?? 11;
    const font = options.font ?? fontRegular;
    const color = options.color ?? rgb(0.08, 0.08, 0.08);
    const leading = options.leading ?? size + 4;
    const indent = options.indent ?? 0;
    const maxWidth = PAGE_WIDTH - MARGIN * 2 - indent;
    const lines = wrapText(text, font, size, maxWidth);

    for (const line of lines) {
      ensureSpace(leading + 2);
      page.drawText(line, {
        x: MARGIN + indent,
        y,
        size,
        color,
        font,
      });
      y -= leading;
    }
  };

  const section = (title: string) => {
    ensureSpace(28);
    page.drawText(title.toUpperCase(), {
      x: MARGIN,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.22, 0.25, 0.31),
    });
    y -= 12;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      color: rgb(0.86, 0.89, 0.93),
      thickness: 1,
    });
    y -= 14;
  };

  const drawPill = (text: string, x: number, yPos: number) => {
    const fontSize = 10;
    const label = cleanText(text).toUpperCase();
    const width = fontBold.widthOfTextAtSize(label, fontSize);
    const padX = 12;
    const padY = 8;
    page.drawRectangle({
      x,
      y: yPos - padY,
      width: width + padX * 2,
      height: fontSize + padY * 2,
      color: rgb(0.09, 0.13, 0.19),
      borderColor: rgb(0.23, 0.3, 0.4),
      borderWidth: 1,
    });
    page.drawText(label, {
      x: x + padX,
      y: yPos + 2,
      size: fontSize,
      font: fontBold,
      color: rgb(0.93, 0.96, 1),
    });
  };

  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 120,
    width: PAGE_WIDTH,
    height: 120,
    color: rgb(0.06, 0.09, 0.14),
  });
  page.drawText("Cuemath Tutor Screener", {
    x: MARGIN,
    y: PAGE_HEIGHT - 66,
    size: 24,
    font: fontBold,
    color: rgb(0.96, 0.98, 1),
  });
  page.drawText("Interview Evaluation Packet", {
    x: MARGIN,
    y: PAGE_HEIGHT - 88,
    size: 12,
    font: fontRegular,
    color: rgb(0.72, 0.79, 0.9),
  });

  y = PAGE_HEIGHT - 148;

  drawPill(`Verdict: ${result.verdict}`, PAGE_WIDTH - 212, PAGE_HEIGHT - 74);
  section("Interview Snapshot");
  drawWrapped(`Candidate: ${candidate.name}`, { font: fontBold, size: 12, leading: 16 });
  drawWrapped(`Subject: ${candidate.subject}`, { size: 11, leading: 15 });
  drawWrapped(`Age Group: ${candidate.ageGroup}`, { size: 11, leading: 15 });
  drawWrapped(`Overall Score: ${result.overallScore.toFixed(1)}/5.0`, {
    font: fontBold,
    size: 11,
    leading: 15,
  });
  drawWrapped(`Generated: ${dateTimeLabel(result.createdAt)}`, { size: 10, leading: 14 });
  if (interviewId) {
    drawWrapped(`Interview ID: ${interviewId}`, { size: 10, leading: 14 });
  }
  y -= 8;

  section("Evaluator Summary");
  drawWrapped(result.summary, { size: 11, leading: 16 });
  y -= 8;

  section("Dimension Scores");
  const dimensions = Object.values(result.dimensions);
  for (const dim of dimensions) {
    ensureSpace(92);
    page.drawRectangle({
      x: MARGIN,
      y: y - 72,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 72,
      color: rgb(0.97, 0.98, 1),
      borderColor: rgb(0.87, 0.9, 0.95),
      borderWidth: 1,
    });
    page.drawText(dim.label, {
      x: MARGIN + 12,
      y: y - 20,
      size: 11,
      font: fontBold,
      color: rgb(0.09, 0.11, 0.16),
    });
    page.drawText(`${dim.score}/5`, {
      x: PAGE_WIDTH - MARGIN - 48,
      y: y - 20,
      size: 11,
      font: fontBold,
      color: rgb(0.09, 0.11, 0.16),
    });
    const evidenceLines = wrapText(`Evidence: ${dim.evidence}`, fontRegular, 9, PAGE_WIDTH - MARGIN * 2 - 24);
    const feedbackLines = wrapText(`Feedback: ${dim.feedback}`, fontRegular, 9, PAGE_WIDTH - MARGIN * 2 - 24);
    page.drawText(evidenceLines.slice(0, 2).join(" "), {
      x: MARGIN + 12,
      y: y - 38,
      size: 9,
      font: fontRegular,
      color: rgb(0.2, 0.23, 0.28),
    });
    page.drawText(feedbackLines.slice(0, 2).join(" "), {
      x: MARGIN + 12,
      y: y - 54,
      size: 9,
      font: fontRegular,
      color: rgb(0.2, 0.23, 0.28),
    });
    y -= 84;
  }

  section("Model & Delivery Details");
  drawWrapped(
    `Configured fallback chain: Groq (Llama 3.3 70B) -> Gemini 2.5 Flash -> OpenRouter (Llama 3.3 70B) -> Euron (gpt-4.1-nano).`,
    { size: 10, leading: 14 }
  );
  drawWrapped(
    `Providers used during evaluation parse: ${evaluationProviders.length ? evaluationProviders.join(" -> ") : "not available"}.`,
    { size: 10, leading: 14 }
  );
  if (warning) {
    drawWrapped(`Warning: ${warning}`, { size: 10, leading: 14, color: rgb(0.58, 0.21, 0.17) });
  }
  y -= 8;

  section("Full Transcript");
  transcript.forEach((turn, index) => {
    const speaker = turn.role === "user" ? candidate.name : "Interviewer";
    drawWrapped(`${index + 1}. ${speaker}:`, { font: fontBold, size: 10, leading: 13 });
    drawWrapped(turn.content, { size: 10, leading: 14, indent: 14 });
    y -= 4;
  });

  return pdf.save();
}

function buildEmailHtml({
  candidate,
  result,
  interviewId,
  warning,
}: Pick<AdminReportInput, "candidate" | "result" | "interviewId" | "warning">): string {
  const warningBlock = warning
    ? `<p style="color:#b43b2d;margin:12px 0 0;">Warning: ${warning}</p>`
    : "";

  return `
  <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
    <h2 style="margin:0 0 8px;">New Tutor Screening Report</h2>
    <p style="margin:0 0 14px;">A candidate interview has been completed and scored.</p>
    <table style="border-collapse:collapse;">
      <tr><td style="padding:4px 12px 4px 0;"><strong>Candidate</strong></td><td>${candidate.name}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><strong>Subject</strong></td><td>${candidate.subject}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><strong>Age Group</strong></td><td>${candidate.ageGroup}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><strong>Verdict</strong></td><td>${result.verdict.toUpperCase()}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><strong>Score</strong></td><td>${result.overallScore.toFixed(1)}/5.0</td></tr>
      ${interviewId ? `<tr><td style="padding:4px 12px 4px 0;"><strong>Interview ID</strong></td><td>${interviewId}</td></tr>` : ""}
    </table>
    <p style="margin:14px 0 0;">The full PDF report (scores + evidence + complete transcript) is attached.</p>
    ${warningBlock}
  </div>`;
}

export async function sendAdminReportEmail(input: AdminReportInput): Promise<{ sent: boolean; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_REPORT_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL ?? "Cuemath Screener <onboarding@resend.dev>";

  if (!apiKey || !to) {
    console.warn("[admin-report] RESEND_API_KEY or ADMIN_REPORT_EMAIL is missing, skipping email.");
    return { sent: false };
  }

  const pdfBytes = await buildInterviewPdf(input);
  const filename = `tutor-screening-${slugify(input.candidate.name)}-${Date.now()}.pdf`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Tutor Screening Report: ${input.candidate.name} (${input.result.verdict.toUpperCase()} ${input.result.overallScore.toFixed(1)}/5.0)`,
      html: buildEmailHtml(input),
      attachments: [
        {
          filename,
          content: Buffer.from(pdfBytes).toString("base64"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend API failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as ResendResponse;
  return { sent: true, id: data.id };
}
