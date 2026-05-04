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

function oppositeCorner(position: OverlayPosition): OverlayPosition {
  switch (position) {
    case "top-left":
      return "bottom-right";
    case "top-right":
      return "bottom-left";
    case "bottom-left":
      return "top-right";
    case "bottom-right":
    default:
      return "top-left";
  }
}
/** Trunca texto com "…" se exceder maxWidth no contexto do canvas. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "\u2026").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "\u2026";
}

/**
 * Quebra texto em múltiplas linhas respeitando maxWidth.
 * Retorna no máximo maxLines linhas; a última é truncada com "…" se necessário.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      if (lines.length >= maxLines) break;
      current = word;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  // Se ainda há conteúdo mas atingiu o limite, truncar a última linha
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = fitText(ctx, last, maxWidth);
  }

  return lines;
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
  const overlayEnabled = form.overlayEnabled !== false;
  const hasActiveLogo = form.logoEnabled !== false;

  if (overlayEnabled) {
    const margin     = Math.max(20, Math.round(width * 0.02));
    const boxWidth   = Math.round(width * 0.34);
    const lh         = Math.max(14, Math.round(width * 0.013)); // line height
    const titleSize  = Math.max(11, Math.round(width * 0.013));
    const idSize     = Math.max(10, Math.round(width * 0.011));
    const bodySize   = Math.max(9,  Math.round(width * 0.010));
    const pad        = Math.max(10, Math.round(width * 0.012));
    const borderW    = Math.max(1, Math.round(width * 0.0015));
    const inset      = borderW + Math.max(2, Math.round(width * 0.002));

    const fields: [string, string][] = [
      ["EMPRESA",            form.sourceCompany],
      ["CNPJ",               form.sourceCnpj || "-"],
      ["REFERÊNCIA DE CONFORMIDADE", form.questionnaireTitle || "-"],
      ["NÚMERO DE CONTROLE EXTERNO", form.evidenceNumber || "-"],
      ["DATA DA IMAGEM",     formatDateDisplay(form.imageDate)],
      ["HORA DA IMAGEM",     form.imageTime || "-"],
      ...(form.evidenceTitle?.trim()
        ? [["REQUISITO / TÍTULO EXTERNO", form.evidenceTitle] as [string, string]]
        : [["REQUISITO / TÍTULO EXTERNO", "-"] as [string, string]]),
      ["EMPRESA REQUISITANTE", form.targetCompany],
      ["RESPONSÁVEL",        form.responsibleName || "-"],
      ...(form.department ? [["ÁREA / DEPARTAMENTO", form.department] as [string, string]] : []),
      ...(form.observations?.trim() ? [["OBSERVAÇÕES", form.observations] as [string, string]] : []),
    ];

    // Heights — pré-calcula linhas extras dos campos que podem quebrar em 2 linhas
    const availW = boxWidth - pad * 2;
    ctx.font = `400 ${bodySize}px system-ui, -apple-system, sans-serif`;
    const referenciaValue = `REFERÊNCIA DE CONFORMIDADE: ${(form.questionnaireTitle || "-").toUpperCase()}`;
    const referenciaLines = wrapText(ctx, referenciaValue, availW, 2);
    const hasTitulo = !!form.evidenceTitle?.trim();
    const tituloValue = hasTitulo
      ? `REQUISITO / TÍTULO EXTERNO: ${form.evidenceTitle.toUpperCase()}`
      : "REQUISITO / TÍTULO EXTERNO: -";
    const tituloLines = wrapText(ctx, tituloValue, availW, 2);
    const extraLines  = Math.max(0, referenciaLines.length - 1) + Math.max(0, tituloLines.length - 1);

    const headerHeight = pad + lh * 1.35 + lh * 1.15 + pad * 0.7;
    const bodyHeight   = lh * 1.2 * (fields.length + extraLines) + pad;
    const boxHeight    = Math.round(headerHeight + 1 + bodyHeight);

    const preferredOverlayCorner = form.overlayPosition;
    const safeOverlayCorner = hasActiveLogo && preferredOverlayCorner === (form.logoPosition ?? "bottom-left")
      ? oppositeCorner(form.logoPosition ?? "bottom-left")
      : preferredOverlayCorner;

    const { x, y } = resolveOverlayCoordinates(
      safeOverlayCorner,
      width,
      height,
      boxWidth,
      boxHeight,
      margin,
    );

    const isSolid = form.overlayBackgroundStyle === "solid";
    const highOverlayOpacity = form.overlayOpacityMode === "high";
    const blackOverlayText = form.overlayTextColor === "black";

    /* Background body */
    ctx.fillStyle = isSolid
      ? highOverlayOpacity
        ? "rgba(8, 18, 38, 0.72)"
        : "rgba(8, 18, 38, 0.52)"
      : highOverlayOpacity
        ? "rgba(8, 18, 38, 0.52)"
        : "rgba(8, 18, 38, 0.32)";
    ctx.fillRect(x, y, boxWidth, boxHeight);

    /* Header tinted background */
    ctx.fillStyle = isSolid
      ? highOverlayOpacity
        ? "rgba(18, 40, 78, 0.80)"
        : "rgba(18, 40, 78, 0.58)"
      : highOverlayOpacity
        ? "rgba(18, 40, 78, 0.58)"
        : "rgba(18, 40, 78, 0.38)";
    ctx.fillRect(x, y, boxWidth, Math.round(headerHeight));

    /* Outer border */
    ctx.strokeStyle = "rgba(96, 180, 255, 0.60)";
    ctx.lineWidth = borderW;
    ctx.strokeRect(
      x + borderW / 2,
      y + borderW / 2,
      boxWidth - borderW,
      boxHeight - borderW,
    );

    /* Inner border (inset accent) */
    ctx.strokeStyle = "rgba(96, 180, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + inset, y + inset, boxWidth - inset * 2, boxHeight - inset * 2);

    /* Separator line at header/body junction */
    const sepY = y + Math.round(headerHeight);
    ctx.strokeStyle = "rgba(96, 180, 255, 0.55)";
    ctx.lineWidth = borderW;
    ctx.beginPath();
    ctx.moveTo(x, sepY);
    ctx.lineTo(x + boxWidth, sepY);
    ctx.stroke();

    /* ── Header text ── */
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = blackOverlayText ? "rgba(0, 0, 0, 0.92)" : "rgba(232, 244, 255, 0.85)";
    ctx.font = `700 ${titleSize}px system-ui, -apple-system, sans-serif`;
    const headerTitleRaw = (form.headerTitle && form.headerTitle.trim())
      ? form.headerTitle.toUpperCase()
      : "EVIDÊNCIA DE CONTROLE DE SEGURANÇA";
    const titleText = fitText(ctx, headerTitleRaw, availW);
    ctx.fillText(titleText, x + boxWidth / 2, y + pad + lh * 1.1);

    if (evidenceId) {
      ctx.fillStyle = blackOverlayText ? "rgba(0, 0, 0, 0.84)" : "rgba(125, 211, 252, 0.80)";
      ctx.font = `600 ${idSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(evidenceId, x + boxWidth / 2, y + pad + lh * 1.1 + lh * 1.2);
    }

    /* ── Body fields ── */
    ctx.textAlign = "left";
    ctx.fillStyle = blackOverlayText ? "rgba(0, 0, 0, 0.86)" : "rgba(219, 234, 254, 0.78)";
    ctx.font = `400 ${bodySize}px system-ui, -apple-system, sans-serif`;

    const bodyStartY = sepY + lh * 1.1;
    let yOff = 0;
    fields.forEach(([label, value]) => {
      if (label === "REFERÊNCIA DE CONFORMIDADE") {
        referenciaLines.forEach((line, li) => {
          ctx.fillText(li === 0 ? line : `  ${line}`, x + pad, bodyStartY + lh * 1.2 * yOff);
          yOff++;
        });
      } else if (label === "REQUISITO / TÍTULO EXTERNO") {
        tituloLines.forEach((line, li) => {
          // Na primeira sub-linha já temos o label incluído; nas demais, apenas continuação
          ctx.fillText(li === 0 ? line : `  ${line}`, x + pad, bodyStartY + lh * 1.2 * yOff);
          yOff++;
        });
      } else {
        const line = `${label}: ${value.toUpperCase()}`;
        ctx.fillText(fitText(ctx, line, availW), x + pad, bodyStartY + lh * 1.2 * yOff);
        yOff++;
      }
    });
  }

  /* ── Watermark text ────────────────────────────────────────────────── */
  if (form.watermarkEnabled && form.watermarkText.trim()) {
    const wmText = form.watermarkText.toUpperCase();
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate((-20 * Math.PI) / 180);
    ctx.textAlign = "center";
    ctx.fillStyle = form.watermarkColorMode === "dark"
      ? "rgba(0, 0, 0, 0.24)"
      : "rgba(255, 255, 255, 0.24)";
    ctx.font = `700 ${Math.max(30, Math.round(width * 0.05))}px system-ui, sans-serif`;
    ctx.fillText(wmText, 0, 0);
    ctx.restore();
  }

  /* ── Logo Slice (marca d'água, canto escolhido) ─────────────────────── */
  if (logoImage && hasActiveLogo) {
    const logoMargin = Math.max(16, Math.round(width * 0.018));
    const logoW = Math.round(width * 0.14);
    const logoH = Math.round(logoW * (logoImage.naturalHeight / logoImage.naturalWidth));
    const safeLogoCorner = form.logoPosition ?? "bottom-left";
    const { x: logoX, y: logoY } = resolveOverlayCoordinates(
      safeLogoCorner,
      width,
      height,
      logoW,
      logoH,
      logoMargin,
    );
    ctx.save();
    ctx.globalAlpha = 0.40;
    if (form.logoVariant === "dark") ctx.filter = "invert(1)";
    ctx.drawImage(logoImage, logoX, logoY, logoW, logoH);
    ctx.restore();
  }

  return canvas;
}
