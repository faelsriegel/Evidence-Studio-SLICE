import { create } from "zustand";
import { persist } from "zustand/middleware";
import { formatDateInput } from "@/lib/utils";
import { type EvidenceFormData, type SavedConfiguration, type UserPreset } from "@/types/evidence";

const DEFAULT_SOURCE_COMPANY = "SLICE TECNOLOGIA DA INFORMACAO S.A.";
const DEFAULT_SOURCE_CNPJ = "40.599.957/0001-10";

const today = formatDateInput(new Date());

export const defaultFormData: EvidenceFormData = {
  sourceCompany: DEFAULT_SOURCE_COMPANY,
  sourceCnpj: DEFAULT_SOURCE_CNPJ,
  targetCompany: "EMPRESA AUDITADA",
  evidenceTitle: "Comprovacao de controle de seguranca",
  evidenceNumber: "14.1",
  imageDate: today,
  responsibleName: "Infraestrutura TI",
  department: "Seguranca da Informacao",
  watermarkEnabled: false,
  watermarkText: "CONFIDENCIAL",
  overlayPosition: "bottom-right",
  overlayBackgroundStyle: "translucent",
};

interface EvidenceStore {
  lastFormData: EvidenceFormData;
  recentConfigurations: SavedConfiguration[];
  userPresets: UserPreset[];
  setLastFormData: (data: EvidenceFormData) => void;
  saveConfiguration: (data: EvidenceFormData) => void;
  loadConfiguration: (id: string) => EvidenceFormData | null;
  savePreset: (name: string, data: Partial<EvidenceFormData>) => UserPreset;
  updatePreset: (id: string, name: string, data: Partial<EvidenceFormData>) => void;
  deletePreset: (id: string) => void;
}

export const useEvidenceStore = create<EvidenceStore>()(
  persist(
    (set, get) => ({
      lastFormData: defaultFormData,
      recentConfigurations: [],
      userPresets: [],
      setLastFormData: (data) => set({ lastFormData: data }),
      saveConfiguration: (data) => {
        const stamp = new Date().toISOString();
        const label = `${data.evidenceNumber || "SEM_NUM"} - ${data.evidenceTitle || "SEM_TITULO"}`;

        const nextItem: SavedConfiguration = {
          id: `${stamp}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: stamp,
          label,
          data,
        };

        const recent = [nextItem, ...get().recentConfigurations].slice(0, 8);
        set({ recentConfigurations: recent, lastFormData: data });
      },
      loadConfiguration: (id) => {
        const found = get().recentConfigurations.find((item) => item.id === id);
        if (!found) {
          return null;
        }

        set({ lastFormData: found.data });
        return found.data;
      },
      savePreset: (name, data) => {
        const preset: UserPreset = {
          id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: name.trim(),
          createdAt: new Date().toISOString(),
          data,
        };
        set({ userPresets: [...get().userPresets, preset] });
        return preset;
      },
      updatePreset: (id, name, data) => {
        set({
          userPresets: get().userPresets.map((p) =>
            p.id === id ? { ...p, name: name.trim(), data } : p,
          ),
        });
      },
      deletePreset: (id) => {
        set({ userPresets: get().userPresets.filter((p) => p.id !== id) });
      },
    }),
    {
      name: "slice-evidence-config",
      partialize: (state) => ({
        lastFormData: state.lastFormData,
        recentConfigurations: state.recentConfigurations,
        userPresets: state.userPresets,
      }),
    },
  ),
);
