import { formatDateDisplay } from "@/lib/utils";
import { type EvidenceFormData, type OverlayPosition, type RedactRegion } from "@/types/evidence";

interface ProcessOptions {
  image: HTMLImageElement;
  form: EvidenceFormData;
  logoImage?: HTMLImageElement | null;
  redactRegions?: RedactRegion[];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
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

export function processEvidenceImage({ image, form, logoImage, redactRegions }: ProcessOptions): HTMLCanvasElement {
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
        // blur: copy region to offscreen canvas, draw back with filter
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

  const margin = Math.max(20, Math.round(width * 0.02));
  const boxWidth = Math.round(width * 0.44);
  const lineHeight = Math.max(18, Math.round(width * 0.018));
  const titleFontSize = Math.max(16, Math.round(width * 0.021));
  const bodyFontSize = Math.max(13, Math.round(width * 0.015));
  const padding = Math.max(16, Math.round(width * 0.017));

  const fields: [string, string][] = [
    ["Empresa", form.sourceCompany],
    ["CNPJ", form.sourceCnpj || "-"],
    ["Empresa destino", form.targetCompany],
    ["Titulo", form.evidenceTitle],
    ["Numero de controle", form.evidenceNumber],
    ["Data da imagem", formatDateDisplay(form.imageDate)],
    ["Responsavel", form.responsibleName || "-"],
    ["Area/Departamento", form.department || "-"],
  ];

  const boxHeight = padding * 2 + lineHeight * (fields.length + 1);
  const { x, y } = resolveOverlayCoordinates(
    form.overlayPosition,
    width,
    height,
    boxWidth,
    boxHeight,
    margin,
  );

  const isSolid = form.overlayBackgroundStyle === "solid";
  ctx.fillStyle = isSolid ? "rgba(12, 28, 47, 0.95)" : "rgba(12, 28, 47, 0.72)";
  ctx.strokeStyle = "rgba(181, 214, 255, 0.4)";
  ctx.lineWidth = Math.max(1, Math.round(width * 0.0018));
  drawRoundedRect(ctx, x, y, boxWidth, boxHeight, Math.max(8, Math.round(width * 0.008)));
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f8fafc";
  ctx.font = `700 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText("EVIDENCIA CORPORATIVA", x + padding, y + padding + lineHeight * 0.8);

  ctx.font = `500 ${bodyFontSize}px system-ui, -apple-system, sans-serif`;
  fields.forEach(([label, value], idx) => {
    const line = `${label.toUpperCase()}: ${value.toUpperCase()}`;
    ctx.fillText(line, x + padding, y + padding + lineHeight * (idx + 2));
  });

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

  /* ── Logo Slice como marca d’água (sempre visível, canto superior esquerdo) ── */
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
