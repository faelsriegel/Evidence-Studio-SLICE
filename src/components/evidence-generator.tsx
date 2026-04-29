"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import { useForm, useWatch } from "react-hook-form";
import {
  BookmarkPlus,
  Building2,
  ChevronDown,
  Download,
  EyeOff,
  FileImage,
  Grid3X3,
  ImageIcon,
  Maximize2,
  ShieldCheck,
  Stamp,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { processEvidenceImage } from "@/lib/image-processing";
import { resolveBestImageDate } from "@/lib/metadata";
import { formatDateInput, formatTimeInput, sanitizeForFileName } from "@/lib/utils";
import { defaultFormData, useEvidenceStore } from "@/store/evidence-store";
import { type EvidenceFormData, type OverlayPosition, type RedactRegion } from "@/types/evidence";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

/* ── helpers de layout ──────────────────────────────────────────────────── */

function Section({
  title,
  description,
  children,
  collapsible,
  defaultOpen = true,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = collapsible ? open : true;
  return (
    <section className="border-t border-slate-800/70 pt-4 first:border-t-0 first:pt-0">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={open}
        >
          <div className="flex items-baseline gap-3">
            <h3 className="text-[13px] font-semibold tracking-tight text-slate-100">{title}</h3>
            {description && <p className="text-[11px] text-slate-500">{description}</p>}
          </div>
          <ChevronDown
            size={14}
            className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      ) : (
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[13px] font-semibold tracking-tight text-slate-100">{title}</h3>
          {description && <p className="text-[11px] text-slate-500">{description}</p>}
        </div>
      )}
      {expanded && <div className="mt-3 space-y-3">{children}</div>}
    </section>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function F({
  label,
  full,
  hint,
  children,
}: {
  label: string;
  full?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={[full ? "sm:col-span-2" : "", "space-y-1.5"].filter(Boolean).join(" ")}>
      <div className="flex items-center justify-between">
        <Label className="m-0 text-[11px] font-medium normal-case tracking-normal text-slate-300">
          {label}
        </Label>
        {hint && <span className="text-[10px] text-slate-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg"];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const positionOptions: { label: string; value: OverlayPosition }[] = [
  { label: "Superior esquerdo", value: "top-left" },
  { label: "Superior direito", value: "top-right" },
  { label: "Inferior esquerdo", value: "bottom-left" },
  { label: "Inferior direito", value: "bottom-right" },
];

function buildDownloadName(form: EvidenceFormData, evidenceId?: string): string {
  const number = sanitizeForFileName(form.evidenceNumber || "SEM_NUMERO");
  const auditor = sanitizeForFileName(form.targetCompany || "SEM_AUDITORA");
  const id = sanitizeForFileName(evidenceId || "SEM_ID");
  return `EVIDENCIA_${number}_${auditor}_${id}.png`;
}

function notifySuccess(message: string) {
  toast.success(message);
}

function notifyError(message: string) {
  toast.error(message);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nao foi possivel carregar a imagem."));
    };
    img.src = url;
  });
}

export function EvidenceGenerator() {
  const {
    lastFormData,
    setLastFormData,
    saveConfiguration,
    userPresets,
    savePreset,
    updatePreset,
    deletePreset,
    nextEvidenceId,
    peekEvidenceId,
  } = useEvidenceStore();

  const [fileName, setFileName] = useState<string>("");
  const [detectedDate, setDetectedDate] = useState<string>("");
  const [detectedTime, setDetectedTime] = useState<string>("");
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  /* preset manager state */
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [presetMode, setPresetMode] = useState<"idle" | "new" | "edit">("idle");
  const [presetName, setPresetName] = useState<string>("");

  /* lightbox */
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lbZoom, setLbZoom] = useState(1);
  const [lbOffset, setLbOffset] = useState({ x: 0, y: 0 });
  const [lbDragging, setLbDragging] = useState(false);
  const lbDrag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  /* redact tool */
  const imgWrapperRef = useRef<HTMLDivElement>(null);
  const [redactMode, setRedactMode] = useState<"blur" | "pixelate" | null>(null);
  const [redactRegions, setRedactRegions] = useState<RedactRegion[]>([]);
  const [drawing, setDrawing] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);

  /* listeners globais durante o desenho de regiao */
  useEffect(() => {
    if (!drawing || !redactMode || !sourceImage) return;
    const onMove = (e: MouseEvent) => {
      const rect = imgWrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ex = Math.round(((e.clientX - rect.left) / rect.width) * sourceImage.naturalWidth);
      const ey = Math.round(((e.clientY - rect.top) / rect.height) * sourceImage.naturalHeight);
      setDrawing(d => d ? { ...d, ex, ey } : null);
    };
    const onUp = () => {
      setDrawing(d => {
        if (!d) return null;
        const x = Math.min(d.sx, d.ex);
        const y = Math.min(d.sy, d.ey);
        const w = Math.abs(d.ex - d.sx);
        const h = Math.abs(d.ey - d.sy);
        if (w > 8 && h > 8 && redactMode) {
          setRedactRegions(r => [...r, { x, y, w, h, type: redactMode }]);
        }
        return null;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing !== null, redactMode, sourceImage]);

  /* logo pre-carregado para o canvas */
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setLogoImage(img);
    img.src = "/assets/img/slice-logo-white.png";
  }, []);

  const initialized = useRef(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<EvidenceFormData>({
    defaultValues: defaultFormData,
  });

  const watchedValues = useWatch({ control });
  const currentValues: EvidenceFormData = useMemo(
    () => ({
      ...defaultFormData,
      ...watchedValues,
    }),
    [watchedValues],
  );

  useEffect(() => {
    if (initialized.current) {
      return;
    }

    reset(lastFormData);
    initialized.current = true;
  }, [lastFormData, reset]);

  useEffect(() => {
    if (!initialized.current) {
      return;
    }

    setLastFormData(currentValues);
  }, [currentValues, setLastFormData]);

  const previewUrl = useMemo(() => {
    if (!sourceImage) {
      return "";
    }

    try {
      const previewId = peekEvidenceId(
        currentValues.targetCompany,
        currentValues.evidenceTitle,
        currentValues.evidenceNumber,
        currentValues.imageDate,
        currentValues.evidenceAcronym,
        currentValues.forceSequence,
        currentValues.manualSequence,
      );
      const canvas = processEvidenceImage({ image: sourceImage, form: currentValues, logoImage, redactRegions, evidenceId: previewId });
      return canvas.toDataURL("image/png", 1);
    } catch {
      return "";
    }
  }, [sourceImage, currentValues, logoImage, redactRegions, peekEvidenceId]);

  const generatedName = useMemo(() => {
    const previewId = peekEvidenceId(
      currentValues.targetCompany,
      currentValues.evidenceTitle,
      currentValues.evidenceNumber,
      currentValues.imageDate,
      currentValues.evidenceAcronym,
      currentValues.forceSequence,
      currentValues.manualSequence,
    );
    return buildDownloadName(currentValues, previewId);
  }, [currentValues, peekEvidenceId]);

  function applyPreset(values: Partial<EvidenceFormData>) {
    Object.entries(values).forEach(([key, value]) => {
      setValue(key as keyof EvidenceFormData, value as never, { shouldValidate: true });
    });
    notifySuccess("Preset aplicado com sucesso.");
  }

  function handleSavePreset() {
    const name = presetName.trim();
    if (!name) return;
    if (presetMode === "new") {
      const p = savePreset(name, { ...currentValues });
      setSelectedPresetId(p.id);
    } else if (presetMode === "edit" && selectedPresetId) {
      updatePreset(selectedPresetId, name, { ...currentValues });
    }
    setPresetMode("idle");
    setPresetName("");
    notifySuccess(`Preset "${name}" salvo.`);
  }

  function handleDeletePreset() {
    if (!selectedPresetId) {
      notifyError("Selecione um preset para excluir.");
      return;
    }
    const preset = userPresets.find((p) => p.id === selectedPresetId);
    if (!preset) {
      notifyError("Preset selecionado nao encontrado.");
      return;
    }
    const confirmed = window.confirm(`Deseja excluir o preset "${preset.name}"?`);
    if (!confirmed) return;
    deletePreset(selectedPresetId);
    setSelectedPresetId("");
    setPresetMode("idle");
    notifySuccess(`Preset "${preset.name}" excluido.`);
  }

  /* fechar lightbox com Escape */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (presetMode !== "idle") { setPresetMode("idle"); setPresetName(""); return; }
        setLightboxOpen(false); setLbZoom(1); setLbOffset({ x: 0, y: 0 });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, presetMode]);

  async function handleFileDrop(file: File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      notifyError("Formato invalido. Envie PNG, JPG ou JPEG.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      notifyError("Arquivo muito grande. O limite atual e 20MB.");
      return;
    }

    try {
      const [img, bestDate] = await Promise.all([loadImage(file), resolveBestImageDate(file)]);
      const parsedDate = formatDateInput(bestDate);

      setSourceImage(img);
      setFileName(file.name);
      setDetectedDate(parsedDate);
      const parsedTime = formatTimeInput(bestDate);
      setDetectedTime(parsedTime);
      setValue("imageDate", parsedDate, { shouldValidate: true });
      setValue("imageTime", parsedTime, { shouldValidate: true });
      setRedactRegions([]);
      setRedactMode(null);
    } catch {
      notifyError("Nao foi possivel ler a imagem selecionada.");
    }
  }

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) await handleFileDrop(selected);
  }

  function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png", 1);
    link.download = name;
    link.click();
  }

  const onSubmit = handleSubmit(async (formData) => {
    if (!sourceImage) {
      notifyError("Envie uma imagem antes de gerar a evidencia.");
      return;
    }

    setIsProcessing(true);

    try {
      const evId = nextEvidenceId(
        formData.targetCompany,
        formData.evidenceTitle,
        formData.evidenceNumber,
        formData.imageDate,
        formData.evidenceAcronym,
        formData.forceSequence,
        formData.manualSequence,
      );
      const canvas = processEvidenceImage({ image: sourceImage, form: formData, logoImage, redactRegions, evidenceId: evId });
      const finalName = buildDownloadName(formData, evId);
      downloadCanvas(canvas, finalName);
      saveConfiguration(formData);
      notifySuccess(`Evidencia gerada e baixada automaticamente: ${finalName}`);
    } catch {
      notifyError("Falha ao processar a evidencia. Tente novamente.");
    } finally {
      setIsProcessing(false);
    }
  });

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-88px)] w-full max-w-[1120px] flex-col px-3 py-3 text-sm sm:px-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 backdrop-blur">
        <div>
          <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-sky-400 ring-1 ring-sky-500/20">
            <ShieldCheck size={10} />
            DPO&nbsp;•&nbsp;LGPD&nbsp;•&nbsp;Seguranca da Informacao
          </span>
          <h1 className="text-base font-bold tracking-tight text-slate-50">
            Gerador Corporativo de Evidencias
          </h1>
          <p className="text-xs text-slate-400">
            Padronize evidencias formais para auditoria, compliance e questionarios de seguranca.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" type="button" onClick={() => reset(defaultFormData)} className="shrink-0">
            Resetar formulario
          </Button>
        </div>
      </header>

      {/* ── Stacked studio layout ────────────────────────────────────────────── */}
      <main className="flex flex-col gap-3 pb-3">

        {/* ── Top: Form card ──────────────────────────────────────────────── */}
        <Card className="order-1 flex flex-col overflow-hidden border-slate-800 bg-slate-900/70">
          <CardHeader className="flex flex-col gap-3 border-b border-slate-800 bg-slate-900/80 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileImage size={15} className="text-sky-400" />
              Configuracoes da evidencia
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select
                className="h-8 w-44 text-xs"
                value={selectedPresetId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedPresetId(id);
                  setPresetMode("idle");
                  if (id) {
                    const preset = userPresets.find((p) => p.id === id);
                    if (preset) applyPreset(preset.data);
                  }
                }}
              >
                <option value="">
                  {userPresets.length === 0 ? "Nenhum preset" : "Aplicar preset..."}
                </option>
                {userPresets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              <button
                type="button"
                title="Salvar configuracao atual como preset"
                onClick={() => { setPresetMode("new"); setPresetName(""); }}
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 text-[11px] font-medium text-slate-300 transition hover:border-sky-600/50 hover:text-sky-300"
              >
                <BookmarkPlus size={13} />
                Novo
              </button>
              <button
                type="button"
                title="Excluir preset selecionado"
                onClick={handleDeletePreset}
                disabled={!selectedPresetId}
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 text-[11px] font-medium text-slate-300 transition hover:border-rose-600/50 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={13} />
                Excluir
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-5 sm:p-6">
            <form
              id="evidence-form"
              className="space-y-5"
              onSubmit={onSubmit}
            >
              {/* Imagem */}
              <Section title="Imagem" description="PNG, JPG ou JPEG · max 20 MB">
                <label
                  htmlFor="file"
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void handleFileDrop(file);
                  }}
                  className={[
                    "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition-all",
                    isDragging
                      ? "border-sky-400 bg-sky-950/30"
                      : fileName
                      ? "border-emerald-500/40 bg-emerald-950/15"
                      : "border-slate-700 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-900/60",
                  ].join(" ")}
                >
                  {fileName ? (
                    <>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30">
                        <ImageIcon size={16} className="text-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-emerald-300">{fileName}</p>
                        {detectedDate && (
                          <p className="text-[11px] text-slate-400">
                            Data detectada: {detectedDate}
                            {detectedTime ? ` ${detectedTime}` : ""}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-400">
                        Trocar
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-slate-700">
                        <Upload size={16} className="text-slate-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-300">Clique ou arraste para upload</p>
                        <p className="text-[11px] text-slate-500">A data EXIF sera detectada automaticamente</p>
                      </div>
                    </>
                  )}
                  <input
                    id="file"
                    type="file"
                    accept=".png,.jpg,.jpeg"
                    onChange={onFileSelected}
                    className="sr-only"
                  />
                </label>
              </Section>

              {/* Essencial */}
              <Section title="Dados da evidencia">
                <FieldGrid>
                  <F label="Empresa auditora" full>
                    <Input id="targetCompany" placeholder="Digite o nome da empresa" {...register("targetCompany", { required: true })} />
                    {errors.targetCompany && (
                      <p className="text-[11px] text-rose-400">Campo obrigatorio.</p>
                    )}
                  </F>
                  <F label="Titulo do questionario" full>
                    <Input id="questionnaireTitle" placeholder="Digite o titulo (opcional)" {...register("questionnaireTitle")} />
                  </F>
                  <F label="Titulo da evidencia" full>
                    <Input id="evidenceTitle" placeholder="Digite o requisito ou titulo (opcional)" {...register("evidenceTitle")} />
                  </F>
                  <F label="Numero de controle">
                    <Input id="evidenceNumber" placeholder="Digite o numero de controle" {...register("evidenceNumber", { required: true })} />
                  </F>
                  <F label="Data da imagem">
                    <Input id="imageDate" type="date" {...register("imageDate", { required: true })} />
                  </F>
                  <F label="Hora da imagem">
                    <Input
                      id="imageTime"
                      type="time"
                      {...register("imageTime")}
                    />
                  </F>
                </FieldGrid>
              </Section>

              {/* Mais detalhes (colapsavel) */}
              <Section title="Mais detalhes" description="Emissor, responsavel e sigla" collapsible defaultOpen={false}>
                <FieldGrid>
                  <F label="Empresa emissora">
                    <Input id="sourceCompany" placeholder="Digite o nome da empresa" {...register("sourceCompany", { required: true })} />
                  </F>
                  <F label="CNPJ">
                    <Input id="sourceCnpj" placeholder="00.000.000/0001-00" {...register("sourceCnpj")} />
                  </F>
                  <F label="Responsavel">
                    <Input id="responsibleName" placeholder="Digite o nome do responsavel" {...register("responsibleName")} />
                  </F>
                  <F label="Area / Departamento">
                    <Input id="department" placeholder="Digite a area ou departamento" {...register("department")} />
                  </F>
                  <F label="Observacoes" full>
                    <Input id="observations" placeholder="Texto opcional para observacoes" {...register("observations")} />
                  </F>
                  <F label="Sigla do ID" hint="vazio = automatico" full>
                    <Input id="evidenceAcronym" placeholder="Digite a sigla (opcional)" maxLength={6} {...register("evidenceAcronym")} />
                  </F>
                </FieldGrid>

                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-medium text-slate-200">Sequencial do ID</p>
                      <p className="text-[11px] text-slate-500">
                        Padrao: automatico por empresa + titulo + numero (independente da data).
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Forcar</span>
                      <Switch
                        checked={!!currentValues.forceSequence}
                        onCheckedChange={(next) =>
                          setValue("forceSequence", next, { shouldValidate: true })
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
                    <Input
                      id="manualSequence"
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      disabled={!currentValues.forceSequence}
                      placeholder="001"
                      {...register("manualSequence")}
                    />
                    <p className="text-[11px] text-slate-500">
                      Quando ativo, o final do ID usa este valor (ex.: 001, 002, 010).
                    </p>
                  </div>
                </div>
              </Section>

              {/* Aparencia (colapsavel) */}
              <Section title="Aparencia do quadro" description="Posicao, fundo, logo e marca d'agua" collapsible defaultOpen={false}>
                <F label="Posicao do quadro" full>
                  <div className="grid grid-cols-2 gap-1.5">
                    {positionOptions.map((item) => {
                      const isActive = currentValues.overlayPosition === item.value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          title={item.label}
                          onClick={() =>
                            setValue("overlayPosition", item.value, { shouldValidate: true })
                          }
                          className={[
                            "rounded-lg border px-2 py-2 text-[11px] font-medium transition",
                            isActive
                              ? "border-sky-500 bg-sky-500/10 text-sky-300"
                              : "border-slate-700 text-slate-400 hover:border-slate-600 hover:bg-slate-800",
                          ].join(" ")}
                        >
                          {item.label.replace("Superior ", "Sup. ").replace("Inferior ", "Inf. ")}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Se coincidir com a logo, o quadro vai automaticamente para o canto oposto.
                  </p>
                </F>

                <FieldGrid>
                  <F label="Fundo do quadro">
                    <Select id="overlayBackgroundStyle" {...register("overlayBackgroundStyle")}>
                      <option value="translucent">Semitransparente</option>
                      <option value="solid">Solido</option>
                    </Select>
                  </F>
                  <F label="Opacidade do quadro">
                    <Select id="overlayOpacityMode" {...register("overlayOpacityMode")}>
                      <option value="normal">Normal</option>
                      <option value="high">Alta (tela clara)</option>
                    </Select>
                  </F>
                  <F label="Cor da fonte do quadro">
                    <Select id="overlayTextColor" {...register("overlayTextColor")}>
                      <option value="light">Clara</option>
                      <option value="black">Preta</option>
                    </Select>
                  </F>
                  <F label="Logo Slice">
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["white", "dark"] as const).map((variant) => {
                        const isActive = (currentValues.logoVariant ?? "white") === variant;
                        return (
                          <button
                            key={variant}
                            type="button"
                            onClick={() => setValue("logoVariant", variant, { shouldValidate: true })}
                            className={[
                              "h-9 rounded-lg border text-[11px] font-medium transition",
                              isActive
                                ? "border-sky-500 bg-sky-500/10 text-sky-300"
                                : "border-slate-700 text-slate-400 hover:border-slate-600 hover:bg-slate-800",
                            ].join(" ")}
                          >
                            {variant === "white" ? "Branco" : "Escuro"}
                          </button>
                        );
                      })}
                    </div>
                  </F>
                </FieldGrid>

                <F label="Canto da logo Slice" full>
                  <div className="grid grid-cols-2 gap-1.5">
                    {positionOptions.map((item) => {
                      const isActive = (currentValues.logoPosition ?? "bottom-left") === item.value;
                      return (
                        <button
                          key={`logo-${item.value}`}
                          type="button"
                          title={item.label}
                          onClick={() => setValue("logoPosition", item.value, { shouldValidate: true })}
                          className={[
                            "rounded-lg border px-2 py-2 text-[11px] font-medium transition",
                            isActive
                              ? "border-sky-500 bg-sky-500/10 text-sky-300"
                              : "border-slate-700 text-slate-400 hover:border-slate-600 hover:bg-slate-800",
                          ].join(" ")}
                        >
                          {item.label.replace("Superior ", "Sup. ").replace("Inferior ", "Inf. ")}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    A logo permanece no canto escolhido por voce.
                  </p>
                </F>

                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Stamp size={14} className="text-slate-500" />
                      <div>
                        <p className="text-[12px] font-medium text-slate-200">Marca d&apos;agua</p>
                        <p className="text-[11px] text-slate-500">Sobreposta a imagem para uso restrito</p>
                        </div>
                      </div>
                      <Switch
                        checked={currentValues.watermarkEnabled}
                        onCheckedChange={(next) =>
                          setValue("watermarkEnabled", next, { shouldValidate: true })
                        }
                      />
                    </div>
                    {currentValues.watermarkEnabled && (
                      <div className="mt-3 space-y-2">
                        <Input
                          id="watermarkText"
                          placeholder="Texto da marca d'agua"
                          {...register("watermarkText")}
                        />
                        <Select id="watermarkColorMode" {...register("watermarkColorMode")}>
                          <option value="light">Marca d'agua clara</option>
                          <option value="dark">Marca d'agua escura (tela clara)</option>
                        </Select>
                      </div>
                    )}
                  </div>
              </Section>
            </form>
          </CardContent>
        </Card>

        {/* ── Bottom: Preview card ────────────────────────────────────────── */}
        <Card className="order-2 mt-3 flex flex-col overflow-hidden border-slate-800 bg-slate-900/70">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800 bg-slate-900/80">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ImageIcon size={15} className="text-indigo-400" />
              Pre-visualizacao
            </CardTitle>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Tempo real
            </span>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
            {!previewUrl ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/80 ring-1 ring-slate-700">
                  <Building2 size={22} className="text-slate-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-300">Aguardando imagem</p>
                  <p className="mt-1 max-w-md text-xs text-slate-500">
                    Faca o upload no formulario acima para visualizar a evidencia gerada.
                  </p>
                </div>
                <label
                  htmlFor="file"
                  className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700"
                >
                  Selecionar imagem
                </label>
              </div>
            ) : (
              <>
                {/* ── Redact toolbar ──────────────────────────────── */}
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-1.5">
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Redacao</span>
                  <button
                    type="button"
                    onClick={() => setRedactMode(m => m === "blur" ? null : "blur")}
                    className={[
                      "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition",
                      redactMode === "blur"
                        ? "border-sky-500 bg-sky-500/15 text-sky-300"
                        : "border-slate-700 text-slate-400 hover:border-sky-700 hover:text-sky-300",
                    ].join(" ")}
                  >
                    <EyeOff size={11} /> Desfocar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRedactMode(m => m === "pixelate" ? null : "pixelate")}
                    className={[
                      "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition",
                      redactMode === "pixelate"
                        ? "border-amber-500 bg-amber-500/15 text-amber-300"
                        : "border-slate-700 text-slate-400 hover:border-amber-700 hover:text-amber-300",
                    ].join(" ")}
                  >
                    <Grid3X3 size={11} /> Pixelar
                  </button>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      title="Desfazer ultima regiao"
                      onClick={() => setRedactRegions(r => r.slice(0, -1))}
                      disabled={redactRegions.length === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Undo2 size={12} />
                    </button>
                    <button
                      type="button"
                      title="Limpar todas as regioes"
                      onClick={() => { setRedactRegions([]); setRedactMode(null); }}
                      disabled={redactRegions.length === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition hover:border-rose-600 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <div className="group relative flex flex-1 items-center justify-center overflow-auto rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  {!redactMode && (
                    <button
                      type="button"
                      onClick={() => { setLbZoom(1); setLbOffset({ x: 0, y: 0 }); setLightboxOpen(true); }}
                      title="Abrir em tela cheia"
                      className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/80 text-slate-400 opacity-100 ring-1 ring-slate-700 transition hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Maximize2 size={14} />
                    </button>
                  )}
                  {redactMode && (
                    <div className="absolute left-3 top-3 z-10 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-slate-700">
                      {redactMode === "blur" ? "Arraste para desfocar" : "Arraste para pixelar"}
                    </div>
                  )}
                  <div className="relative inline-block leading-[0]" ref={imgWrapperRef}>
                    <NextImage
                      src={previewUrl}
                      alt="Preview da evidencia processada"
                      width={sourceImage?.naturalWidth ?? 1400}
                      height={sourceImage?.naturalHeight ?? 900}
                      unoptimized
                      draggable={false}
                      onClick={() => { if (!redactMode) { setLbZoom(1); setLbOffset({ x: 0, y: 0 }); setLightboxOpen(true); } }}
                      className={`block h-auto max-h-[60vh] w-auto select-none rounded-lg shadow-xl shadow-black/40 transition lg:max-h-[68vh] ${
                        redactMode ? "cursor-crosshair" : "cursor-zoom-in hover:brightness-105"
                      }`}
                    />
                    {/* Redact overlay — visible + interactive when in redact mode */}
                    <div
                      className="absolute inset-0 select-none rounded-lg"
                      style={{
                        cursor: redactMode ? "crosshair" : "default",
                        pointerEvents: redactMode ? "auto" : "none",
                      }}
                      onMouseDown={(e) => {
                        if (!redactMode || !sourceImage) return;
                        e.preventDefault();
                        const rect = imgWrapperRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        const sx = Math.round(((e.clientX - rect.left) / rect.width) * sourceImage.naturalWidth);
                        const sy = Math.round(((e.clientY - rect.top) / rect.height) * sourceImage.naturalHeight);
                        setDrawing({ sx, sy, ex: sx, ey: sy });
                      }}
                    >
                      {/* Saved regions */}
                      {sourceImage && redactRegions.map((r, i) => (
                        <div
                          key={i}
                          className="absolute border-2 border-dashed"
                          style={{
                            left: `${(r.x / sourceImage.naturalWidth) * 100}%`,
                            top: `${(r.y / sourceImage.naturalHeight) * 100}%`,
                            width: `${(r.w / sourceImage.naturalWidth) * 100}%`,
                            height: `${(r.h / sourceImage.naturalHeight) * 100}%`,
                            borderColor: r.type === "blur" ? "#38bdf8" : "#f59e0b",
                            backgroundColor: r.type === "blur" ? "rgba(56,189,248,0.12)" : "rgba(245,158,11,0.12)",
                          }}
                        />
                      ))}
                      {/* In-progress rect */}
                      {drawing && sourceImage && (
                        <div
                          className="absolute border-2 border-dashed border-white/80 bg-white/10"
                          style={{
                            left: `${(Math.min(drawing.sx, drawing.ex) / sourceImage.naturalWidth) * 100}%`,
                            top: `${(Math.min(drawing.sy, drawing.ey) / sourceImage.naturalHeight) * 100}%`,
                            width: `${(Math.abs(drawing.ex - drawing.sx) / sourceImage.naturalWidth) * 100}%`,
                            height: `${(Math.abs(drawing.ey - drawing.sy) / sourceImage.naturalHeight) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer: meta info + submit */}
                <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="grid flex-1 grid-cols-3 gap-3 text-[11px]">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Responsavel</p>
                      <p className="mt-0.5 truncate font-medium text-slate-200">{currentValues.responsibleName || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Data</p>
                      <p className="mt-0.5 truncate font-medium text-slate-200">{currentValues.imageDate || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">N. controle</p>
                      <p className="mt-0.5 truncate font-medium text-slate-200">{currentValues.evidenceNumber || "—"}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                    <Button
                      type="submit"
                      form="evidence-form"
                      className="gap-2 px-5 text-sm font-semibold"
                      disabled={isProcessing}
                    >
                      <Download size={16} />
                      {isProcessing ? "Processando..." : "Gerar e baixar"}
                    </Button>
                    <p className="truncate text-[10px] text-slate-500 sm:max-w-xs">{generatedName}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightboxOpen && previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur-sm"
          onClick={() => { setLightboxOpen(false); setLbZoom(1); setLbOffset({ x: 0, y: 0 }); }}
          onWheel={(e) => {
            e.preventDefault();
            setLbZoom(z => Math.min(8, Math.max(0.5, z - e.deltaY * 0.001)));
          }}
        >
          {/* Controles */}
          <div className="absolute right-5 top-5 z-10 flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => { setLbZoom(z => Math.min(8, z + 0.5)); }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700 hover:text-white text-lg font-bold"
            >+</button>
            <button
              type="button"
              onClick={() => { setLbZoom(1); setLbOffset({ x: 0, y: 0 }); }}
              className="rounded-full bg-slate-800 px-3 py-2 text-xs text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700 hover:text-white"
            >{Math.round(lbZoom * 100)}%</button>
            <button
              type="button"
              onClick={() => { setLbZoom(z => Math.max(0.5, z - 0.5)); }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700 hover:text-white text-lg font-bold"
            >−</button>
            <button
              type="button"
              onClick={() => { setLightboxOpen(false); setLbZoom(1); setLbOffset({ x: 0, y: 0 }); }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          {/* Imagem com zoom + pan */}
          <div
            className="overflow-hidden"
            style={{ width: "100dvw", height: "100dvh" }}
            onClick={e => e.stopPropagation()}
            onMouseDown={(e) => {
              e.preventDefault();
              lbDrag.current = { startX: e.clientX, startY: e.clientY, ox: lbOffset.x, oy: lbOffset.y };
              setLbDragging(true);
            }}
            onMouseMove={(e) => {
              if (!lbDrag.current) return;
              setLbOffset({
                x: lbDrag.current.ox + (e.clientX - lbDrag.current.startX),
                y: lbDrag.current.oy + (e.clientY - lbDrag.current.startY),
              });
            }}
            onMouseUp={() => { lbDrag.current = null; setLbDragging(false); }}
            onMouseLeave={() => { lbDrag.current = null; setLbDragging(false); }}
          >
            <div
              className="flex h-full w-full items-center justify-center"
              style={{
                transform: `translate(${lbOffset.x}px, ${lbOffset.y}px) scale(${lbZoom})`,
                transformOrigin: "center center",
                cursor: lbZoom > 1 ? (lbDragging ? "grabbing" : "grab") : "default",
                transition: lbDragging ? "none" : "transform 0.1s ease",
              }}
            >
              <NextImage
                src={previewUrl}
                alt="Evidencia em tela cheia"
                width={sourceImage?.naturalWidth ?? 1400}
                height={sourceImage?.naturalHeight ?? 900}
                unoptimized
                draggable={false}
                className="block h-auto max-h-[90dvh] w-auto max-w-[90dvw] rounded-xl shadow-2xl select-none"
              />
            </div>
          </div>

          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 px-4 py-1.5 text-xs text-slate-400 ring-1 ring-slate-700 pointer-events-none">
            Scroll para zoom · Arraste para mover · Esc para fechar
          </p>
        </div>
      )}

      {/* ── Modal de preset ───────────────────────────────────────────────── */}
      {presetMode !== "idle" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm"
          onClick={() => { setPresetMode("idle"); setPresetName(""); }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-2xl shadow-black/50 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Título */}
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <BookmarkPlus size={16} className="text-sky-400" />
                {presetMode === "new" ? "Salvar preset" : "Renomear preset"}
              </h2>
              <button
                type="button"
                onClick={() => { setPresetMode("idle"); setPresetName(""); }}
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
              >
                <X size={15} />
              </button>
            </div>

            {/* Descrição contextual */}
            <p className="mb-4 text-xs text-slate-400">
              {presetMode === "new"
                ? "Os valores atuais do formulário serão salvos como preset."
                : `Editando: "${userPresets.find((p) => p.id === selectedPresetId)?.name ?? ""}"`}
            </p>

            {/* Input nome */}
            <Input
              autoFocus
              placeholder="Nome do preset..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleSavePreset(); }
                if (e.key === "Escape") { setPresetMode("idle"); setPresetName(""); }
              }}
              className="mb-4"
            />

            {/* Ações */}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setPresetMode("idle"); setPresetName(""); }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
              >
                {presetMode === "new" ? "Salvar preset" : "Atualizar nome"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
