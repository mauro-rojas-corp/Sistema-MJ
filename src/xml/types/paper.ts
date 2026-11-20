export type PaperSizeType = 'a4' | 'oficio' | 'folio';

export interface PaperSizeConfig {
  id: PaperSizeType;
  label: string;
  shortLabel: string;
  dimensionsMm: string;
  widthMm: number;
  heightMm: number;
  cssPageSize: string;
  aspectRatio: number;
  description: string;
}

export const PAPER_SIZES: Record<PaperSizeType, PaperSizeConfig> = {
  a4: {
    id: 'a4',
    label: 'A4',
    shortLabel: 'A4',
    dimensionsMm: '210 × 297 mm',
    widthMm: 210,
    heightMm: 297,
    cssPageSize: '210mm 297mm',
    aspectRatio: 210 / 297,
    description: 'Estándar internacional A4 (210 × 297 mm)',
  },
  oficio: {
    id: 'oficio',
    label: '8,5 × 13" u Oficio',
    shortLabel: 'Oficio (8.5×13")',
    dimensionsMm: '216 × 330 mm',
    widthMm: 215.9,
    heightMm: 330.2,
    cssPageSize: '216mm 330.2mm',
    aspectRatio: 215.9 / 330.2,
    description: 'Oficio / 8,5 × 13 pulgadas (216 × 330 mm)',
  },
  folio: {
    id: 'folio',
    label: 'Folio',
    shortLabel: 'Folio',
    dimensionsMm: '215 × 315 mm',
    widthMm: 215,
    heightMm: 315,
    cssPageSize: '215mm 315mm',
    aspectRatio: 215 / 315,
    description: 'Formato comercial Folio (215 × 315 mm)',
  },
};
