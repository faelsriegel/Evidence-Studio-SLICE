export type OverlayPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type OverlayBackgroundStyle = "solid" | "translucent";

export interface EvidenceFormData {
  sourceCompany: string;
  sourceCnpj?: string;
  targetCompany: string;
  evidenceTitle: string;
  evidenceNumber: string;
  imageDate: string;
  responsibleName?: string;
  department?: string;
  watermarkEnabled: boolean;
  watermarkText: string;
  overlayPosition: OverlayPosition;
  overlayBackgroundStyle: OverlayBackgroundStyle;
}

export interface SavedConfiguration {
  id: string;
  createdAt: string;
  label: string;
  data: EvidenceFormData;
}

export interface UserPreset {
  id: string;
  name: string;
  createdAt: string;
  data: Partial<EvidenceFormData>;
}

export interface RedactRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  type: "blur" | "pixelate";
}
