import { formatDateDisplay } from "@/lib/utils";
import { type EvidenceFormData, type OverlayPosition, type RedactRegion } from "@/types/evidence";

interface ProcessOptions {
  image: HTMLImageElement;
  form: EvidenceFormData;
  logoImage?: HTMLImageElement | null;
  redactRegions?: RedactRegion[];
  evidenceId?: string;
}

function resolveOverlayCoordinates(
  position: OverlayPosition,
  canvasWidth: number,
  canvasHeight: number,
  boxWidth: number,
  boxHeight: number,
  margin: number,
) {
  const right = canvasWidth - boxWidth - margin;
  const bottom = canvasHeight - boxHeight - margin;

  switch (position) {
    case "top-left":
      return { x: margin, y: margin };
    case "top-right":
      return { x: right, y: margin };
    case "bottom-left":
      return { x: margin, y: bottom };
    case "bottom-right":
    default:
      return { x: right, y: bottom };
  }
}
/** Trunca texto com "\u2026" se exceder maxWidth no contexto do canvas. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "\u2026").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "\u2026";
}

export function processEvidenceImage({ image, form, logoImage, redactRegions, evidenceId }: ProcessOptions): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Nao foi possivel inicializar o canvas.");
  }

  ctx.drawImage(image, 0, 0, width, height);

  /* ── Redact regions (blur / pixelate) ───────────────────────────────── */
  if (redactRegions && redactRegions.length > 0) {
    for (const { x, y, w, h, type } of redactRegions) {
      if (w < 2 || h < 2) continue;
      if (type === "pixelate") {
        const block = Math.max(8, Math.round(Math.min(w, h) * 0.07));
        for (let bx = x; bx < x + w; bx += block) {
          for (let by = y; by < y + h; by += block) {
            const bw = Math.min(block, x + w - bx);
            const bh = Math.min(block, y + h - by);
            const pixel = ctx.getImageData(Math.floor(bx + bw / 2), Math.floor(by + bh / 2), 1, 1).data;
            ctx.fillStyle = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
            ctx.fillRect(bx, by, bw, bh);
          }
        }
      } else {
        const offscreen = document.createElement("canvas");
        offscreen.width = w;
        offscreen.height = h;
        const offCtx = offscreen.getContext("2d")!;
        offCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
        const blurRadius = Math.max(6, Math.round(Math.min(w, h) * 0.05));
        ctx.save();
        ctx.filter = `blur(${blurRadius}px)`;
        ctx.drawImage(offscreen, x, y);
        ctx.restore();
      }
    }
  }

  /* ── Overlay card ────────────────────────────────────────────────────── */
  const margin     = Math.max(20, Math.round(width * 0.02));
  const boxWidth   = Math.round(width * 0.52);
  const lh         = Math.max(17, Math.round(width * 0.0165)); // line height
  const titleSize  = Math.max(13, Math.round(width * 0.017));
  const idSize     = Math.max(12, Math.round(width * 0.014));
  const bodySize   = Math.max(11, Math.round(width * 0.013));
  const pad        = Math.max(14, Math.round(width * 0.015));
  const borderW    = Math.max(2, Math.round(width * 0.002));
  const inset      = borderW + Math.max(3, Math.round(width * 0.003));

  const fields: [string, string][] = [
    ["EMPRESA EMISSORA",    form.sourceCompany],
    ["CNPJ",               form.sourceCnpj || "-"],
    ["EMPRESA REQUISITANTE", form.targetCompany],
    ["TÍTULO DA EVIDÊNCIA", form.evidenceTitle],
    ["NÚMERO DE CONTROLE", form.evidenceNumber],
    ["DATA DA CAPTURA",    formatDateDisplay(form.imageDate)],
    ["RESPONSÁVEL",        form.responsibleName || "-"],
    ...(form.department ? [["ÁREA / DEPARTAMENTO", form.department] as [string, string]] : []),
  ];

  // Heights
  const headerHeight = pad + lh * 1.35 + lh * 1.15 + pad * 0.7;
  const bodyHeight   = lh * 1.2 * fields.length + pad;
  const boxHeight    = Math.round(headerHeight + 1 + bodyHeight);

  const { x, y } = resolveOverlayCoordinates(
    form.overlayPosition,
    width,
    height,
    boxWidth,
    boxHeight,
    margin,
  );

  const isSolid = form.overlayBackgroundStyle === "solid";

  /* Background body */
  ctx.fillStyle = isSolid ? "rgba(8, 18, 38, 0.97)" : "rgba(8, 18, 38, 0.84)";
  ctx.fillRect(x, y, boxWidth, boxHeight);

  /* Header tinted background */
  ctx.fillStyle = isSolid ? "rgba(18, 40, 78, 0.98)" : "rgba(18, 40, 78, 0.88)";
  ctx.fillRect(x, y, boxWidth, Math.round(headerHeight));

  /* Outer border */
  ctx.strokeStyle = "rgba(96, 180, 255, 0.90)";
  ctx.lineWidth = borderW;
  ctx.strokeRect(
    x + borderW / 2,
    y + borderW / 2,
    boxWidth - borderW,
    boxHeight - borderW,
  );

  /* Inner border (inset accent) */
  ctx.strokeStyle = "rgba(96, 180, 255, 0.28)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + inset, y + inset, boxWidth - inset * 2, boxHeight - inset * 2);

  /* Separator line at header/body junction */
  const sepY = y + Math.round(headerHeight);
  ctx.strokeStyle = "rgba(96, 180, 255, 0.80)";
  ctx.lineWidth = borderW;
  ctx.beginPath();
  ctx.moveTo(x, sepY);
  ctx.lineTo(x + boxWidth, sepY);
  ctx.stroke();

  /* ── Header text ── */
  const availW = boxWidth - pad * 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#e8f4ff";
  ctx.font = `700 ${titleSize}px system-ui, -apple-system, sans-serif`;
  const titleText = fitText(ctx, "EVIDÊNCIA DE CONTROLE DE SEGURANÇA", availW);
  ctx.fillText(titleText, x + boxWidth / 2, y + pad + lh * 1.1);

  if (evidenceId) {
    ctx.fillStyle = "#7dd3fc";
    ctx.font = `600 ${idSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(evidenceId, x + boxWidth / 2, y + pad + lh * 1.1 + lh * 1.2);
  }

  /* ── Body fields ── */
  ctx.textAlign = "left";
  ctx.fillStyle = "#dbeafe";
  ctx.font = `500 ${bodySize}px system-ui, -apple-system, sans-serif`;

  const bodyStartY = sepY + lh * 1.1;
  fields.forEach(([label, value], idx) => {
    const line = `${label}: ${value.toUpperCase()}`;
    ctx.fillText(fitText(ctx, line, availW), x + pad, bodyStartY + lh * 1.2 * idx);
  });

  /* ── Watermark text ────────────────────────────────────────────────── */
  if (form.watermarkEnabled && form.watermarkText.trim()) {
    const wmText = form.watermarkText.toUpperCase();
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate((-20 * Math.PI) / 180);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    ctx.font = `700 ${Math.max(34, Math.round(width * 0.055))}px system-ui, sans-serif`;
    ctx.fillText(wmText, 0, 0);
    ctx.restore();
  }

  /* ── Logo Slice (marca d'água, canto inferior direito) ─────────────── */
  if (logoImage) {
    const logoMargin = Math.max(16, Math.round(width * 0.018));
    const logoW = Math.round(width * 0.14);
    const logoH = Math.round(logoW * (logoImage.naturalHeight / logoImage.naturalWidth));
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.drawImage(logoImage, width - logoW - logoMargin, height - logoH - logoMargin, logoW, logoH);
    ctx.restore();
  }

  return canvas;
}
