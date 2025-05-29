import * as ExcelJS from 'exceljs';
import { FieldAnalysis, FieldType } from '../../../types/excel';

export class ExcelFieldAnalyzer {
  private workbook: ExcelJS.Workbook;

  constructor() {
    this.workbook = new ExcelJS.Workbook();
  }

  async analyzeExcelFile(buffer: Buffer): Promise<FieldAnalysis[]> {
    await this.workbook.xlsx.load(buffer);
    const worksheet = this.workbook.getWorksheet(1); // Première feuille
    
    if (!worksheet) {
      throw new Error('Aucune feuille de calcul trouvée');
    }

    const fields: FieldAnalysis[] = [];
    const headerRow = worksheet.getRow(1);
    
    // Analyser chaque colonne
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const label = cell.value?.toString().trim() || '';
      if (label) {
        const fieldAnalysis = this.analyzeColumn(worksheet, colNumber, label);
        fields.push(fieldAnalysis);
      }
    });

    return fields;
  }

  private analyzeColumn(worksheet: ExcelJS.Worksheet, colNumber: number, label: string): FieldAnalysis {
    const values: any[] = [];
    const nonEmptyValues: any[] = [];
    let hasRequiredIndicator = false;

    // Vérifier si le label indique un champ requis
    if (label.includes('*') || label.toLowerCase().includes('requis') || label.toLowerCase().includes('obligatoire')) {
      hasRequiredIndicator = true;
    }

    // Collecter les valeurs de la colonne (ignorer la première ligne qui est l'en-tête)
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const cell = worksheet.getCell(rowNumber, colNumber);
      const value = cell.value;
      
      values.push(value);
      if (value !== null && value !== undefined && value !== '') {
        nonEmptyValues.push(value);
      }
    }

    // Calculer le pourcentage de cellules remplies
    const fillRate = values.length > 0 ? nonEmptyValues.length / values.length : 0;
    const isRequired = hasRequiredIndicator || fillRate > 0.8; // Considérer comme requis si >80% rempli

    // Déterminer le type de champ et les options
    const fieldType = this.determineFieldType(label, nonEmptyValues);
    const options = this.extractOptions(fieldType, nonEmptyValues);

    return {
      label: label.replace(/\*/g, '').trim(), // Nettoyer le label
      type: fieldType,
      required: isRequired,
      options,
      sampleValues: nonEmptyValues.slice(0, 5), // Garder 5 exemples
      fillRate: Math.round(fillRate * 100)
    };
  }

  private determineFieldType(label: string, values: any[]): FieldType {
    const labelLower = label.toLowerCase();
    
    // Vérifications basées sur le nom du champ
    if (labelLower.includes('email') || labelLower.includes('e-mail') || labelLower.includes('courriel')) {
      return 'email';
    }
    if (labelLower.includes('téléphone') || labelLower.includes('telephone') || labelLower.includes('tel') || labelLower.includes('phone')) {
      return 'tel';
    }
    if (labelLower.includes('url') || labelLower.includes('site') || labelLower.includes('lien')) {
      return 'url';
    }
    if (labelLower.includes('date')) {
      if (labelLower.includes('heure') || labelLower.includes('time')) {
        return 'datetime';
      }
      return 'date';
    }
    if (labelLower.includes('heure') || labelLower.includes('time')) {
      return 'time';
    }
    if (labelLower.includes('fichier') || labelLower.includes('file') || labelLower.includes('document')) {
      return 'file';
    }
    if (labelLower.includes('image') || labelLower.includes('photo')) {
      return 'image';
    }
    if (labelLower.includes('adresse') || labelLower.includes('localisation') || labelLower.includes('lieu')) {
      return 'map';
    }

    if (values.length === 0) {
      return 'text';
    }

    // Analyse des valeurs
    const uniqueValues = [...new Set(values.map(v => v?.toString().toLowerCase()))];
    const numericValues = values.filter(v => !isNaN(Number(v)) && v !== null && v !== '');
    
    // Si moins de 10 valeurs uniques et plus de 3 occurrences de chaque, probablement un select/radio
    if (uniqueValues.length <= 10 && values.length > uniqueValues.length * 3) {
      // Si 2 valeurs qui ressemblent à oui/non, c'est des checkboxes ou radio
      if (uniqueValues.length === 2) {
        const booleanIndicators = ['oui', 'non', 'yes', 'no', 'true', 'false', '1', '0', 'vrai', 'faux'];
        const matchesBooleans = uniqueValues.every(val => 
          booleanIndicators.some(indicator => val.includes(indicator))
        );
        if (matchesBooleans) {
          return 'checkbox';
        }
        return 'radio';
      }
      return uniqueValues.length <= 5 ? 'radio' : 'select';
    }

    // Si plus de 80% des valeurs sont numériques
    if (numericValues.length > values.length * 0.8) {
      return 'number';
    }

    // Vérifier les emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emailCount = values.filter(v => emailRegex.test(v?.toString() || '')).length;
    if (emailCount > values.length * 0.7) {
      return 'email';
    }

    // Vérifier les URLs
    const urlRegex = /^https?:\/\/.+/;
    const urlCount = values.filter(v => urlRegex.test(v?.toString() || '')).length;
    if (urlCount > values.length * 0.7) {
      return 'url';
    }

    // Vérifier les dates
    const dateCount = values.filter(v => {
      const date = new Date(v?.toString() || '');
      return !isNaN(date.getTime()) && v?.toString().includes('/') || v?.toString().includes('-');
    }).length;
    if (dateCount > values.length * 0.7) {
      return 'date';
    }

    // Texte long si la moyenne des caractères > 100
    const avgLength = values.reduce((sum, val) => sum + (val?.toString().length || 0), 0) / values.length;
    if (avgLength > 100) {
      return 'textarea';
    }

    return 'text';
  }

  private extractOptions(fieldType: FieldType, values: any[]): string[] {
    if (!['select', 'radio', 'checkbox'].includes(fieldType)) {
      return [];
    }

    const uniqueValues = [...new Set(values.map(v => v?.toString().trim()))].filter(v => v && v !== '');
    
    // Limiter à 20 options maximum
    return uniqueValues.slice(0, 20);
  }
}

// Types
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