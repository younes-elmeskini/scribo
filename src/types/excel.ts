export interface FieldAnalysis {
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  sampleValues: any[];
  fillRate: number;
}

export type FieldType = 
  | 'text' 
  | 'textarea' 
  | 'email' 
  | 'url' 
  | 'tel' 
  | 'number' 
  | 'radio' 
  | 'checkbox' 
  | 'select' 
  | 'date' 
  | 'time' 
  | 'datetime' 
  | 'file' 
  | 'image' 
  | 'map' 
  | 'range';

export interface ExcelAnalysisResult {
  message: string;
  fields: FieldAnalysis[];
  totalFields: number;
}

export interface CompagneCreationResult {
  message: string;
  compagne: {
    id: string;
    name: string;
    fieldsCount: number;
  };
  analyzedFields: {
    label: string;
    type: FieldType;
    required: boolean;
    optionsCount: number;
    fillRate: number;
  }[];
}
