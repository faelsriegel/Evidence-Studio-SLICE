export type OverlayPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type OverlayBackgroundStyle = "solid" | "translucent";

export type LogoVariant = "white" | "dark";

export interface EvidenceFormData {
  sourceCompany: string;
  sourceCnpj?: string;
  targetCompany: string;
  questionnaireTitle?: string;
  evidenceAcronym?: string;
  forceSequence: boolean;
  manualSequence?: string;
  evidenceTitle: string;
  evidenceNumber: string;
  imageDate: string;
  imageTime?: string;
  responsibleName?: string;
  department?: string;
  observations?: string;
  watermarkEnabled: boolean;
  watermarkText: string;
  logoVariant: LogoVariant;
  logoPosition: OverlayPosition;
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
