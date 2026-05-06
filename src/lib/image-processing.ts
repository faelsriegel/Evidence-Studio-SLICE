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

  /* ── Redact regions: 1ª passada (modificadores de pixel) ─────────────── */
  if (redactRegions && redactRegions.length > 0) {
    for (const region of redactRegions) {
      const { type } = region;
      if (type !== "blur" && type !== "pixelate" && type !== "erase") continue;
      const x = region.x;
      const y = region.y;
      const w = region.w;
      const h = region.h;
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
      } else if (type === "blur") {
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
      } else {
        // erase: borracha "inteligente" — interpolação bilinear das 4 amostras
        // logo fora dos cantos da região (funciona muito bem em fundos uniformes de UI).
        const sample = (px: number, py: number) => {
          const cx = Math.max(0, Math.min(width - 1, Math.round(px)));
          const cy = Math.max(0, Math.min(height - 1, Math.round(py)));
          return ctx.getImageData(cx, cy, 1, 1).data;
        };
        const tl = sample(x - 1, y - 1);
        const tr = sample(x + w, y - 1);
        const bl = sample(x - 1, y + h);
        const br = sample(x + w, y + h);
        const img = ctx.createImageData(w, h);
        for (let yy = 0; yy < h; yy++) {
          const fy = h <= 1 ? 0 : yy / (h - 1);
          for (let xx = 0; xx < w; xx++) {
            const fx = w <= 1 ? 0 : xx / (w - 1);
            const idx = (yy * w + xx) * 4;
            for (let c = 0; c < 3; c++) {
              const top = tl[c] * (1 - fx) + tr[c] * fx;
              const bot = bl[c] * (1 - fx) + br[c] * fx;
              img.data[idx + c] = top * (1 - fy) + bot * fy;
            }
            img.data[idx + 3] = 255;
          }
        }
        ctx.putImageData(img, x, y);
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

    const imageDateLabel = form.imageDate ? formatDateDisplay(form.imageDate) : "";

    const fields = [
      { label: "EMPRESA", value: form.sourceCompany },
      { label: "CNPJ", value: form.sourceCnpj || "" },
      { label: "REFERÊNCIA DE CONFORMIDADE", value: form.questionnaireTitle || "", wrap: true },
      { label: "NÚMERO DE CONTROLE EXTERNO", value: form.evidenceNumber || "" },
      { label: "DATA DA IMAGEM", value: imageDateLabel },
      { label: "HORA DA IMAGEM", value: form.imageTime || "" },
      { label: "REQUISITO / TÍTULO EXTERNO", value: form.evidenceTitle || "", wrap: true },
      { label: "EMPRESA REQUISITANTE", value: form.targetCompany },
      { label: "RESPONSÁVEL", value: form.responsibleName || "" },
      { label: "ÁREA / DEPARTAMENTO", value: form.department || "" },
      { label: "OBSERVAÇÕES", value: form.observations || "" },
    ].filter((field) => field.value.trim().length > 0);

    const availW = boxWidth - pad * 2;
    ctx.font = `400 ${bodySize}px system-ui, -apple-system, sans-serif`;
    const renderedFields = fields.map((field) => {
      const line = `${field.label}: ${field.value.toUpperCase()}`;
      return {
        ...field,
        lines: field.wrap ? wrapText(ctx, line, availW, 2) : [fitText(ctx, line, availW)],
      };
    });
    const bodyLineCount = renderedFields.reduce((total, field) => total + field.lines.length, 0);

    const headerHeight = pad + lh * 1.35 + lh * 1.15 + pad * 0.7;
    const bodyHeight   = bodyLineCount > 0 ? lh * 1.2 * bodyLineCount + pad : pad;
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
    renderedFields.forEach((field) => {
      field.lines.forEach((line, lineIndex) => {
        ctx.fillText(lineIndex === 0 ? line : `  ${line}`, x + pad, bodyStartY + lh * 1.2 * yOff);
          yOff++;
      });
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

  /* ── Redact regions: 2ª passada (anotações vermelhas — por cima) ─────── */
  if (redactRegions && redactRegions.length > 0) {
    const annotationColor = "#dc2626";
    const strokeW = Math.max(3, Math.round(width * 0.004));
    let stepCounter = 0;

    for (const region of redactRegions) {
      if (region.type === "rect") {
        const { x, y, w, h } = region;
        if (Math.abs(w) < 2 || Math.abs(h) < 2) continue;
        ctx.save();
        ctx.strokeStyle = annotationColor;
        ctx.lineWidth = strokeW;
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = Math.max(4, Math.round(width * 0.003));
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      } else if (region.type === "highlight") {
        const { x, y, w, h } = region;
        if (Math.abs(w) < 2 || Math.abs(h) < 2) continue;
        ctx.save();
        // Marca-texto: preenchimento amarelo translúcido + multiply para "manchar" sem apagar conteúdo
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = "rgba(250, 204, 21, 0.55)";
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        // Borda dourada sutil (modo normal) para destacar os limites
        ctx.save();
        ctx.strokeStyle = "rgba(202, 138, 4, 0.55)";
        ctx.lineWidth = Math.max(1, Math.round(width * 0.0012));
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      } else if (region.type === "arrow") {
        const x1 = region.x;
        const y1 = region.y;
        const x2 = region.x + region.w;
        const y2 = region.y + region.h;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 6) continue;

        const angle = Math.atan2(dy, dx);
        const ax = Math.cos(angle);
        const ay = Math.sin(angle);
        const px = -ay; // perpendicular
        const py = ax;

        // Geometria da seta: ponta menor e simétrica em torno do eixo.
        const shaftHalf = Math.max(2.0, width * 0.0022);
        const headLen   = Math.max(14, Math.min(width * 0.030, len * 0.22));
        const headHalf  = Math.max(7, Math.min(width * 0.012, headLen * 0.42));
        const haloW     = Math.max(2.5, width * 0.0028);

        const shaftEndX = x2 - ax * headLen;
        const shaftEndY = y2 - ay * headLen;

        // Base ligeiramente recuada para a "tampinha" arredondada parecer parte da haste
        const baseInset = shaftHalf * 0.4;
        const baseX = x1 + ax * baseInset;
        const baseY = y1 + ay * baseInset;

        const path = new Path2D();
        path.moveTo(baseX + px * shaftHalf, baseY + py * shaftHalf);
        path.lineTo(shaftEndX + px * shaftHalf, shaftEndY + py * shaftHalf);
        path.lineTo(shaftEndX + px * headHalf, shaftEndY + py * headHalf);
        path.lineTo(x2, y2);
        path.lineTo(shaftEndX - px * headHalf, shaftEndY - py * headHalf);
        path.lineTo(shaftEndX - px * shaftHalf, shaftEndY - py * shaftHalf);
        path.lineTo(baseX - px * shaftHalf, baseY - py * shaftHalf);
        // Arco arredondando a base (semicírculo no início da haste)
        path.arc(x1, y1, shaftHalf, angle + Math.PI / 2, angle - Math.PI / 2, true);
        path.closePath();

        // 1) Halo branco (stroke largo) + sombra única para profundidade
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
        ctx.shadowBlur = Math.max(8, Math.round(width * 0.006));
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = Math.max(2, Math.round(width * 0.002));
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = haloW * 2; // metade fica fora do path = halo
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke(path);
        ctx.restore();

        // 2) Preenchimento vermelho com leve gradiente para tirar o aspecto chapado
        ctx.save();
        const grad = ctx.createLinearGradient(
          x1 + px * headHalf,
          y1 + py * headHalf,
          x1 - px * headHalf,
          y1 - py * headHalf,
        );
        grad.addColorStop(0, "#ef4444");
        grad.addColorStop(0.55, "#dc2626");
        grad.addColorStop(1, "#b91c1c");
        ctx.fillStyle = grad;
        ctx.fill(path);
        ctx.restore();

        // 3) Highlight branco fino na borda superior — efeito de "verniz"
        ctx.save();
        ctx.globalCompositeOperation = "source-atop";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
        ctx.lineWidth = Math.max(0.8, width * 0.0006);
        const highlight = new Path2D();
        const inset = shaftHalf * 0.45;
        highlight.moveTo(baseX + px * (shaftHalf - inset), baseY + py * (shaftHalf - inset));
        highlight.lineTo(
          shaftEndX + px * (shaftHalf - inset),
          shaftEndY + py * (shaftHalf - inset),
        );
        ctx.stroke(highlight);
        ctx.restore();
      } else if (region.type === "text") {
        const value = (region.text ?? "").trim();
        if (!value) continue;
        const fontWeight = 900;
        const fontSize = Math.max(24, Math.round(width * 0.028));
        // Espessura do halo branco em pixels. Como usamos cópias deslocadas
        // (não strokeText), o halo é totalmente EXTERNO ao glifo — não fecha
        // os miolos das letras mesmo em peso 900.
        const haloPx = Math.max(3, Math.round(fontSize * 0.14));

        ctx.save();
        ctx.font = `${fontWeight} ${fontSize}px system-ui, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // 1) Sombra projetada (cópia preta levemente deslocada e borrada)
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
        ctx.shadowBlur = Math.max(6, Math.round(fontSize * 0.28));
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = Math.max(2, Math.round(fontSize * 0.08));
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillText(value, region.x, region.y);
        ctx.restore();

        // 2) Halo branco grosso por cópias deslocadas em 16 direções.
        //    Diferente de strokeText, o branco fica SÓ por fora do glifo,
        //    preservando os contadores internos das letras.
        ctx.fillStyle = "#ffffff";
        const steps = 16;
        for (let s = 0; s < steps; s++) {
          const angle = (s / steps) * Math.PI * 2;
          ctx.fillText(
            value,
            region.x + Math.cos(angle) * haloPx,
            region.y + Math.sin(angle) * haloPx,
          );
        }

        // 3) Preenchimento vermelho bold por cima — fica perfeitamente
        //    centrado e cobre qualquer sobreposição interna das cópias.
        ctx.fillStyle = "#dc2626";
        ctx.fillText(value, region.x, region.y);
        ctx.restore();
      } else if (region.type === "step") {
        stepCounter += 1;
        const cx = region.x;
        const cy = region.y;
        const radius = Math.max(18, Math.round(width * 0.022));
        const ringW = Math.max(2, Math.round(radius * 0.14));

        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = Math.max(6, Math.round(width * 0.005));
        ctx.shadowOffsetY = Math.max(1, Math.round(width * 0.0018));

        // Disco vermelho
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = annotationColor;
        ctx.fill();
        ctx.restore();

        // Anel branco
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius - ringW / 2, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = ringW;
        ctx.stroke();
        ctx.restore();

        // Número
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const fontSize = Math.round(radius * 1.15);
        ctx.font = `800 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.fillText(String(stepCounter), cx, cy + Math.round(radius * 0.04));
        ctx.restore();
      }
    }
  }

  return canvas;
}
