"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import { useForm, useWatch } from "react-hook-form";
import {
  BookmarkPlus,
  Building2,
  CalendarDays,
  Download,
  EyeOff,
  FileImage,
  Grid3X3,
  History,
  ImageIcon,
  Maximize2,
  MoveDiagonal2,
  Pencil,
  ShieldCheck,
  Stamp,
  Trash2,
  Undo2,
  Upload,
  User,
  X,
} from "lucide-react";
import { processEvidenceImage } from "@/lib/image-processing";
import { resolveBestImageDate } from "@/lib/metadata";
import { formatDateInput, sanitizeForFileName } from "@/lib/utils";
import { defaultFormData, useEvidenceStore } from "@/store/evidence-store";
import { type EvidenceFormData, type OverlayPosition, type RedactRegion, type UserPreset } from "@/types/evidence";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

/* ── helpers de layout ──────────────────────────────────────────────────── */

function SectionLabel({ step, children }: { step: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-[10px] font-bold text-sky-400 ring-1 ring-sky-500/30">
        {step}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{children}</span>
    </div>
  );
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2.5 sm:grid-cols-2">{children}</div>;
}

function F({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function InfoChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-slate-800/60 px-3 py-2 ring-1 ring-slate-700/50">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </span>
      <span className="truncate text-xs font-medium text-slate-200">{value}</span>
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

function buildDownloadName(form: EvidenceFormData): string {
  const number = sanitizeForFileName(form.evidenceNumber || "SEM_NUMERO");
  const company = sanitizeForFileName(form.targetCompany || "SEM_EMPRESA");
  const date = (form.imageDate || formatDateInput(new Date())).replace(/-/g, "");
  return `EVIDENCIA_${number}_${company}_${date}.png`;
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
    recentConfigurations,
    loadConfiguration,
    userPresets,
    savePreset,
    updatePreset,
    deletePreset,
  } = useEvidenceStore();

  const [fileName, setFileName] = useState<string>("");
  const [detectedDate, setDetectedDate] = useState<string>("");
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  /* preset manager state */
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [presetMode, setPresetMode] = useState<"idle" | "new" | "edit">("idle");
  const [presetName, setPresetName] = useState<string>("");
  const importPresetRef = useRef<HTMLInputElement>(null);

  /* lightbox */
  const [lightboxOpen, setLightboxOpen] = useState(false);

  /* redact tool */
  const imgWrapperRef = useRef<HTMLDivElement>(null);
  const [redactMode, setRedactMode] = useState<"blur" | "pixelate" | null>(null);
  const [redactRegions, setRedactRegions] = useState<RedactRegion[]>([]);
  const [drawing, setDrawing] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);

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
      const canvas = processEvidenceImage({ image: sourceImage, form: currentValues, logoImage, redactRegions });
      return canvas.toDataURL("image/png", 1);
    } catch {
      return "";
    }
  }, [sourceImage, currentValues, logoImage, redactRegions]);

  const hasHistory = recentConfigurations.length > 0;
  const generatedName = useMemo(() => buildDownloadName(currentValues), [currentValues]);

  function applyPreset(values: Partial<EvidenceFormData>) {
    Object.entries(values).forEach(([key, value]) => {
      setValue(key as keyof EvidenceFormData, value as never, { shouldValidate: true });
    });
    setStatusMessage("Preset aplicado com sucesso.");
  }

  function handleApplySelectedPreset() {
    const preset = userPresets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    applyPreset(preset.data);
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
    setStatusMessage(`Preset "${name}" salvo.`);
  }

  function handleDeletePreset() {
    const preset = userPresets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    deletePreset(selectedPresetId);
    setSelectedPresetId("");
    setPresetMode("idle");
    setStatusMessage(`Preset "${preset.name}" removido.`);
  }

  function handleExportPresets() {
    const blob = new Blob([JSON.stringify(userPresets, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence-presets-${formatDateInput(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportPresets(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as UserPreset[];
        if (!Array.isArray(imported)) throw new Error("formato invalido");
        const existingIds = new Set(userPresets.map((p) => p.id));
        imported.forEach((p) => {
          if (p.id && p.name && p.data && !existingIds.has(p.id)) {
            savePreset(p.name, p.data);
          }
        });
        setStatusMessage(`${imported.length} preset(s) importado(s).`);
      } catch {
        setStatusMessage("Arquivo JSON invalido para importacao.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  /* fechar lightbox com Escape */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxOpen(false);
    }
    if (lightboxOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  async function handleFileDrop(file: File) {
    setStatusMessage("");

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setStatusMessage("Formato invalido. Envie PNG, JPG ou JPEG.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setStatusMessage("Arquivo muito grande. O limite atual e 20MB.");
      return;
    }

    try {
      const [img, bestDate] = await Promise.all([loadImage(file), resolveBestImageDate(file)]);
      const parsedDate = formatDateInput(bestDate);

      setSourceImage(img);
      setFileName(file.name);
      setDetectedDate(parsedDate);
      setValue("imageDate", parsedDate, { shouldValidate: true });
      setRedactRegions([]);
      setRedactMode(null);
    } catch {
      setStatusMessage("Nao foi possivel ler a imagem selecionada.");
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
      setStatusMessage("Envie uma imagem antes de gerar a evidencia.");
      return;
    }

    setIsProcessing(true);
    setStatusMessage("");

    try {
      const canvas = processEvidenceImage({ image: sourceImage, form: formData, logoImage, redactRegions });
      const finalName = buildDownloadName(formData);
      downloadCanvas(canvas, finalName);
      saveConfiguration(formData);
      setStatusMessage(`Evidencia gerada e baixada automaticamente: ${finalName}`);
    } catch {
      setStatusMessage("Falha ao processar a evidencia. Tente novamente.");
    } finally {
      setIsProcessing(false);
    }
  });

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-88px)] w-full max-w-[1500px] flex-col px-4 py-3 text-sm lg:px-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/50 bg-slate-900/80 px-5 py-3.5 shadow-lg shadow-black/25 backdrop-blur">
        <div>
          <span className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-sky-400 ring-1 ring-sky-500/20">
            <ShieldCheck size={11} />
            DPO&nbsp;•&nbsp;LGPD&nbsp;•&nbsp;Seguranca da Informacao
          </span>
          <h1 className="text-lg font-bold tracking-tight text-slate-50">
            Gerador Corporativo de Evidencias
          </h1>
          <p className="text-xs text-slate-400">
            Padronize evidencias formais para auditoria, compliance e questionarios de seguranca.
          </p>
        </div>
        <Button variant="outline" type="button" onClick={() => reset(defaultFormData)} className="shrink-0">
          Resetar formulario
        </Button>
      </header>

      {/* ── Two-column layout ───────────────────────────────────────────────── */}
      <main className="grid min-h-0 flex-1 gap-3 pb-3 lg:grid-cols-[460px_1fr]">

        {/* ── Left: Form card ─────────────────────────────────────────────── */}
        <Card className="flex min-h-0 flex-col overflow-hidden border-slate-700/50 shadow-lg shadow-black/25">
          <CardHeader className="shrink-0 bg-slate-900/60">
            <CardTitle className="flex items-center gap-2.5 text-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/25">
                <FileImage size={14} />
              </span>
              Configuracoes da evidencia
            </CardTitle>
          </CardHeader>

          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            <form className="space-y-5" onSubmit={onSubmit}>

              {/* 1. Presets */}
              <section>
                <div className="mb-2.5 flex items-center justify-between">
                  <SectionLabel step="1">Presets salvos</SectionLabel>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Exportar presets como JSON"
                      onClick={handleExportPresets}
                      disabled={userPresets.length === 0}
                      className="rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-400 transition hover:border-sky-600 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Exportar JSON
                    </button>
                    <button
                      type="button"
                      title="Importar presets de JSON"
                      onClick={() => importPresetRef.current?.click()}
                      className="rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-400 transition hover:border-sky-600 hover:text-sky-300"
                    >
                      Importar JSON
                    </button>
                    <input
                      ref={importPresetRef}
                      type="file"
                      accept=".json"
                      onChange={handleImportPresets}
                      className="sr-only"
                    />
                  </div>
                </div>

                {/* Dropdown de seleção */}
                <div className="flex gap-2">
                  <Select
                    value={selectedPresetId}
                    onChange={(e) => {
                      setSelectedPresetId(e.target.value);
                      setPresetMode("idle");
                    }}
                  >
                    <option value="">
                      {userPresets.length === 0 ? "Nenhum preset salvo ainda" : "Selecione um preset..."}
                    </option>
                    {userPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>

                  {/* Aplicar */}
                  <button
                    type="button"
                    title="Aplicar preset selecionado"
                    onClick={handleApplySelectedPreset}
                    disabled={!selectedPresetId}
                    className="shrink-0 rounded-xl border border-sky-700/50 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Aplicar
                  </button>

                  {/* Editar */}
                  <button
                    type="button"
                    title="Editar preset selecionado"
                    onClick={() => {
                      if (!selectedPresetId) return;
                      const p = userPresets.find((x) => x.id === selectedPresetId);
                      if (!p) return;
                      setPresetName(p.name);
                      setPresetMode("edit");
                    }}
                    disabled={!selectedPresetId}
                    className="shrink-0 rounded-xl border border-slate-700 bg-slate-800/60 px-2.5 py-2 text-slate-400 transition hover:border-amber-500/50 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Pencil size={14} />
                  </button>

                  {/* Excluir */}
                  <button
                    type="button"
                    title="Excluir preset selecionado"
                    onClick={handleDeletePreset}
                    disabled={!selectedPresetId}
                    className="shrink-0 rounded-xl border border-slate-700 bg-slate-800/60 px-2.5 py-2 text-slate-400 transition hover:border-rose-500/50 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Painel de criação/edição */}
                {presetMode !== "idle" ? (
                  <div className="mt-3 flex gap-2 rounded-xl border border-sky-700/30 bg-sky-950/20 p-3">
                    <Input
                      placeholder={presetMode === "new" ? "Nome do novo preset..." : "Novo nome..."}
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); handleSavePreset(); }
                        if (e.key === "Escape") { setPresetMode("idle"); setPresetName(""); }
                      }}
                    />
                    <Button type="button" onClick={handleSavePreset} disabled={!presetName.trim()} className="shrink-0">
                      {presetMode === "new" ? "Salvar" : "Atualizar"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setPresetMode("idle"); setPresetName(""); }}
                      className="shrink-0"
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setPresetMode("new"); setPresetName(""); }}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-700 py-2 text-xs text-slate-500 transition hover:border-sky-600/50 hover:text-sky-400"
                  >
                    <BookmarkPlus size={13} />
                    Salvar configuracao atual como preset
                  </button>
                )}

                {/* Botão de atalho de datas */}
                <button
                  type="button"
                  onClick={() => {
                    const today = formatDateInput(new Date());
                    setValue("imageDate", today, { shouldValidate: true });
                    setStatusMessage("Data atualizada para hoje.");
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/50 py-2 text-xs text-slate-400 transition hover:border-sky-600/50 hover:text-sky-300"
                >
                  <CalendarDays size={12} />
                  Atualizar datas para hoje
                </button>
              </section>

              {/* 2. Upload zone */}
              <section>
                <SectionLabel step="2">Imagem de evidencia</SectionLabel>
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
                    "flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed p-6 text-center transition-all",
                    isDragging
                      ? "border-sky-400 bg-sky-950/30"
                      : fileName
                      ? "border-emerald-500/40 bg-emerald-950/20"
                      : "border-slate-700 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-900/60",
                  ].join(" ")}
                  style={{ padding: "0.75rem 1rem" }}
                >
                  {fileName ? (
                    <div className="flex w-full items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30">
                        <ImageIcon size={16} className="text-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-emerald-300">{fileName}</p>
                        {detectedDate && (
                          <p className="text-[11px] text-slate-400">Data detectada: {detectedDate}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-400">
                        Trocar
                      </span>
                    </div>
                  ) : (
                    <div className="flex w-full items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-slate-700">
                        <Upload size={16} className="text-slate-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-300">Clique ou arraste para upload</p>
                        <p className="text-[11px] text-slate-500">PNG, JPG ou JPEG · max 20 MB</p>
                      </div>
                    </div>
                  )}
                  <input
                    id="file"
                    type="file"
                    accept=".png,.jpg,.jpeg"
                    onChange={onFileSelected}
                    className="sr-only"
                  />
                </label>
              </section>

              {/* 3. Dados da evidência */}
              <section>
                <SectionLabel step="3">Dados da evidencia</SectionLabel>
                <div className="space-y-2.5">
                  <FieldGroup>
                    <F label="Empresa">
                      <Input id="sourceCompany" {...register("sourceCompany", { required: true })} />
                    </F>
                    <F label="CNPJ Slice">
                      <Input id="sourceCnpj" placeholder="00.000.000/0001-00" {...register("sourceCnpj")} />
                    </F>
                    <F label="Empresa destinataria" full>
                      <Input id="targetCompany" {...register("targetCompany", { required: true })} />
                      {errors.targetCompany && (
                        <p className="mt-1 text-xs text-rose-400">Campo obrigatorio.</p>
                      )}
                    </F>
                  </FieldGroup>
                  <F label="Titulo da evidencia" full>
                    <Input id="evidenceTitle" {...register("evidenceTitle", { required: true })} />
                    {errors.evidenceTitle && (
                      <p className="mt-1 text-xs text-rose-400">Campo obrigatorio.</p>
                    )}
                  </F>
                  <FieldGroup>
                    <F label="Numero de controle">
                      <Input id="evidenceNumber" placeholder="14.1" {...register("evidenceNumber", { required: true })} />
                    </F>
                    <F label="Data da imagem">
                      <Input id="imageDate" type="date" {...register("imageDate", { required: true })} />
                    </F>
                    <F label="Responsavel">
                      <Input id="responsibleName" {...register("responsibleName")} />
                    </F>
                    <F label="Area / Departamento">
                      <Input id="department" {...register("department")} />
                    </F>
                  </FieldGroup>
                </div>
              </section>

              {/* 4. Visual do quadro */}
              <section>
                <SectionLabel step="4">Visual do quadro informativo</SectionLabel>
                <div className="space-y-3">
                  <div>
                    <Label className="mb-2 flex items-center gap-1.5 text-slate-300">
                      <MoveDiagonal2 size={13} /> Posicao
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {positionOptions.map((item) => {
                        const isActive = currentValues.overlayPosition === item.value;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() =>
                              setValue("overlayPosition", item.value, { shouldValidate: true })
                            }
                            className={[
                              "rounded-xl border py-2 text-center text-xs font-medium transition",
                              isActive
                                ? "border-sky-500 bg-sky-500/10 text-sky-300 shadow-sm shadow-sky-500/10"
                                : "border-slate-700 text-slate-400 hover:border-slate-600 hover:bg-slate-800",
                            ].join(" ")}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <FieldGroup>
                    <F label="Fundo do quadro">
                      <Select id="overlayBackgroundStyle" {...register("overlayBackgroundStyle")}>
                        <option value="translucent">Semitransparente</option>
                        <option value="solid">Solido</option>
                      </Select>
                    </F>
                    <div>
                      <Label className="mb-2 flex items-center gap-1.5 text-slate-300">
                        <Stamp size={13} /> Marca d&apos;agua
                      </Label>
                      <div
                        className={[
                          "flex w-full cursor-pointer select-none items-center justify-between rounded-xl border px-3 py-2 text-xs transition",
                          currentValues.watermarkEnabled
                            ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                            : "border-slate-700 text-slate-400 hover:bg-slate-800",
                        ].join(" ")}
                      >
                        <span
                          onClick={() =>
                            setValue("watermarkEnabled", !currentValues.watermarkEnabled, {
                              shouldValidate: true,
                            })
                          }
                          className="flex-1"
                        >
                          {currentValues.watermarkEnabled ? "Ativada" : "Desativada"}
                        </span>
                        <Switch
                          checked={currentValues.watermarkEnabled}
                          onCheckedChange={(next) =>
                            setValue("watermarkEnabled", next, { shouldValidate: true })
                          }
                        />
                      </div>
                    </div>
                  </FieldGroup>
                  {currentValues.watermarkEnabled && (
                    <F label="Texto da marca d'agua" full>
                      <Input id="watermarkText" {...register("watermarkText")} />
                    </F>
                  )}
                </div>
              </section>

              {/* 5. Historico */}
              <section>
                <SectionLabel step="5">Historico local</SectionLabel>
                <div className="flex gap-2">
                  <Select
                    id="history"
                    value={selectedHistoryId}
                    onChange={(e) => setSelectedHistoryId(e.target.value)}
                    disabled={!hasHistory}
                  >
                    <option value="">
                      {hasHistory ? "Selecione uma configuracao" : "Sem historico ainda"}
                    </option>
                    {recentConfigurations.map((cfg) => (
                      <option key={cfg.id} value={cfg.id}>
                        {new Date(cfg.createdAt).toLocaleString("pt-BR")} – {cfg.label}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!selectedHistoryId) return;
                      const loaded = loadConfiguration(selectedHistoryId);
                      if (loaded) reset(loaded);
                    }}
                    disabled={!selectedHistoryId}
                  >
                    <History size={15} />
                  </Button>
                </div>
              </section>

              {/* Submit */}
              <div className="space-y-2.5 pt-1">
                <Button
                  type="submit"
                  className="w-full gap-2 text-sm font-semibold"
                  disabled={isProcessing}
                >
                  <Download size={16} />
                  {isProcessing ? "Processando..." : "Gerar e baixar evidencia"}
                </Button>
                <p className="text-center text-[11px] text-slate-500">{generatedName}</p>
                {statusMessage && (
                  <p
                    className={[
                      "rounded-xl px-3 py-2 text-xs",
                      statusMessage.startsWith("Falha") ||
                      statusMessage.startsWith("Formato") ||
                      statusMessage.startsWith("Arquivo") ||
                      statusMessage.startsWith("Envie") ||
                      statusMessage.startsWith("Nao")
                        ? "bg-rose-950/50 text-rose-300 ring-1 ring-rose-800/40"
                        : "bg-emerald-950/50 text-emerald-300 ring-1 ring-emerald-800/40",
                    ].join(" ")}
                  >
                    {statusMessage}
                  </p>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Right: Preview card ─────────────────────────────────────────── */}
        <Card className="flex min-h-0 flex-col overflow-hidden border-slate-700/50 shadow-lg shadow-black/25">
          <CardHeader className="shrink-0 bg-slate-900/60">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/25">
                  <Upload size={14} />
                </span>
                Pre-visualizacao em tempo real
              </span>
              <span className="rounded-lg bg-slate-800/80 px-2.5 py-1 text-[11px] font-medium text-slate-400 ring-1 ring-slate-700/50">
                Alta resolucao na exportacao
              </span>
            </CardTitle>
          </CardHeader>

          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            {!previewUrl ? (
              <div className="flex h-full min-h-[440px] flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-800 bg-gradient-to-b from-slate-900/40 to-slate-950/60">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/80 ring-1 ring-slate-700">
                  <Building2 size={28} className="text-slate-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-300">Aguardando imagem</p>
                  <p className="mt-1 max-w-xs text-xs text-slate-500">
                    Faca o upload de uma imagem no painel ao lado para visualizar a evidencia
                    gerada em tempo real com o quadro informativo aplicado.
                  </p>
                </div>
                <label
                  htmlFor="file"
                  className="cursor-pointer rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700"
                >
                  Selecionar imagem
                </label>
              </div>
            ) : (
              <div className="flex h-full flex-col gap-3">
                {/* ── Redact toolbar ──────────────────────────────── */}
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-1.5">
                  <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Redacao</span>
                  <button
                    type="button"
                    onClick={() => setRedactMode(m => m === "blur" ? null : "blur")}
                    className={[
                      "flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition",
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
                      "flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition",
                      redactMode === "pixelate"
                        ? "border-amber-500 bg-amber-500/15 text-amber-300"
                        : "border-slate-700 text-slate-400 hover:border-amber-700 hover:text-amber-300",
                    ].join(" ")}
                  >
                    <Grid3X3 size={11} /> Pixelar
                  </button>
                  <div className="ml-auto flex gap-1">
                    <button
                      type="button"
                      title="Desfazer última região"
                      onClick={() => setRedactRegions(r => r.slice(0, -1))}
                      disabled={redactRegions.length === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Undo2 size={12} />
                    </button>
                    <button
                      type="button"
                      title="Limpar todas as regiões"
                      onClick={() => { setRedactRegions([]); setRedactMode(null); }}
                      disabled={redactRegions.length === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition hover:border-rose-600 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="group relative flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                  {!redactMode && (
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      title="Abrir em tela cheia"
                      className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/80 text-slate-400 opacity-0 ring-1 ring-slate-700 transition hover:text-white group-hover:opacity-100"
                    >
                      <Maximize2 size={14} />
                    </button>
                  )}
                  {redactMode && (
                    <div className="absolute left-3 top-3 z-10 rounded-lg bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-slate-700">
                      {redactMode === "blur" ? "💧 Arraste para desfocar" : "🔳 Arraste para pixelar"}
                    </div>
                  )}
                  <div className="relative inline-block" ref={imgWrapperRef}>
                    <NextImage
                      src={previewUrl}
                      alt="Preview da evidencia processada"
                      width={sourceImage?.naturalWidth ?? 1400}
                      height={sourceImage?.naturalHeight ?? 900}
                      unoptimized
                      onClick={() => !redactMode && setLightboxOpen(true)}
                      className={`h-auto max-h-[58vh] w-auto rounded-xl shadow-2xl shadow-black/50 transition ${
                        redactMode ? "cursor-crosshair" : "cursor-zoom-in hover:brightness-105"
                      }`}
                    />
                    {/* Redact overlay — visible + interactive when in redact mode */}
                    <div
                      className="absolute inset-0 rounded-xl"
                      style={{
                        cursor: redactMode ? "crosshair" : "default",
                        pointerEvents: redactMode ? "auto" : "none",
                      }}
                      onMouseDown={(e) => {
                        if (!redactMode || !sourceImage) return;
                        const rect = imgWrapperRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        const sx = Math.round(((e.clientX - rect.left) / rect.width) * sourceImage.naturalWidth);
                        const sy = Math.round(((e.clientY - rect.top) / rect.height) * sourceImage.naturalHeight);
                        setDrawing({ sx, sy, ex: sx, ey: sy });
                      }}
                      onMouseMove={(e) => {
                        if (!drawing || !sourceImage) return;
                        const rect = imgWrapperRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        const ex = Math.round(((e.clientX - rect.left) / rect.width) * sourceImage.naturalWidth);
                        const ey = Math.round(((e.clientY - rect.top) / rect.height) * sourceImage.naturalHeight);
                        setDrawing(d => d ? { ...d, ex, ey } : null);
                      }}
                      onMouseUp={() => {
                        if (!drawing || !redactMode) return;
                        const x = Math.min(drawing.sx, drawing.ex);
                        const y = Math.min(drawing.sy, drawing.ey);
                        const w = Math.abs(drawing.ex - drawing.sx);
                        const h = Math.abs(drawing.ey - drawing.sy);
                        if (w > 8 && h > 8) {
                          setRedactRegions(r => [...r, { x, y, w, h, type: redactMode }]);
                        }
                        setDrawing(null);
                      }}
                      onMouseLeave={() => setDrawing(null)}
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
                <div className="grid grid-cols-3 gap-2">
                  <InfoChip
                    icon={<User size={11} />}
                    label="Responsavel"
                    value={currentValues.responsibleName || "Nao informado"}
                  />
                  <InfoChip
                    icon={<CalendarDays size={11} />}
                    label="Data da imagem"
                    value={currentValues.imageDate || "—"}
                  />
                  <InfoChip
                    icon={<ShieldCheck size={11} />}
                    label="N. controle"
                    value={currentValues.evidenceNumber || "—"}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightboxOpen && previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700 hover:text-white"
          >
            <X size={18} />
          </button>
          <div
            className="relative max-h-[95dvh] max-w-[95dvw] overflow-auto rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <NextImage
              src={previewUrl}
              alt="Evidencia em tela cheia"
              width={sourceImage?.naturalWidth ?? 1400}
              height={sourceImage?.naturalHeight ?? 900}
              unoptimized
              className="block h-auto max-h-[95dvh] w-auto max-w-[95dvw] rounded-2xl shadow-2xl"
            />
          </div>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 px-4 py-1.5 text-xs text-slate-400 ring-1 ring-slate-700">
            Clique fora ou pressione Esc para fechar
          </p>
        </div>
      )}
    </div>
  );
}
