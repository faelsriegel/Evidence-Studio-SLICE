export type OverlayPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type OverlayBackgroundStyle = "solid" | "translucent";
export type OverlayOpacityMode = "normal" | "high";
export type OverlayTextColor = "light" | "black";
export type WatermarkColorMode = "light" | "dark";

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
  overlayEnabled: boolean;
  watermarkEnabled: boolean;
  watermarkText: string;
  headerTitle: string;
  logoEnabled: boolean;
  logoVariant: LogoVariant;
  logoPosition: OverlayPosition;
  overlayPosition: OverlayPosition;
  overlayBackgroundStyle: OverlayBackgroundStyle;
  overlayOpacityMode: OverlayOpacityMode;
  overlayTextColor: OverlayTextColor;
  watermarkColorMode: WatermarkColorMode;
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
