import * as ExcelJS from "exceljs";

export default class GestionForm {
  static generatePlaceholder(type: string, label: string): string {
    const placeholderMap: Record<string, string> = {
      text: `Entrez ${label.toLowerCase()}`,
      textarea: `Décrivez ${label.toLowerCase()}`,
      email: "exemple@email.com",
      url: "https://exemple.com",
      tel: "+33 1 23 45 67 89",
      number: "Entrez un nombre",
      date: "jj/mm/aaaa",
      time: "hh:mm",
      datetime: "jj/mm/aaaa hh:mm",
    };
    return placeholderMap[type] || `Entrez ${label.toLowerCase()}`;
  }

  // Méthode utilitaire pour extraire les comptages de champs du fichier Excel
  static async extractFieldCountsFromExcel(
    buffer: Buffer
  ): Promise<Array<{ fieldName: string; count: number }>> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) {
      return [];
    }

    const fieldCounts = [];
    let rowIndex = 2; // Commencer à la ligne 2 (après les en-têtes)

    while (rowIndex <= worksheet.rowCount) {
      const fieldNameCell = worksheet.getCell(`A${rowIndex}`);
      const countCell = worksheet.getCell(`B${rowIndex}`);

      const fieldName = fieldNameCell.value?.toString().trim();
      const count = parseInt(countCell.value?.toString() || "0");

      if (fieldName && count > 0) {
        fieldCounts.push({ fieldName, count });
      }

      rowIndex++;
    }

    return fieldCounts;
  }

  // Méthode utilitaire pour générer les données des champs de formulaire
  static generateFormFieldsData(
    fieldCounts: Array<{ fieldName: string; count: number; id?: string }>,
    availableFields: any[],
    formId: string
  ): any[] {
    const formFieldsData = [];
    let currentOrder = 1;

    for (const { fieldName, id, count } of fieldCounts) {
      const fieldRecord = availableFields.find(
        (f) => f.fieldName === fieldName
      );

      if (!fieldRecord) continue;

      for (let i = 0; i < count; i++) {
        const label = `${fieldRecord.fieldName} ${i + 1}`;
        // Générer un nom unique pour le champ
        const name = `field_${fieldRecord.type}_${fieldName.toLowerCase().replace(/\s+/g, '_')}_${i + 1}`;
        const isSelectType = ["radio", "checkbox", "select"].includes(
          fieldRecord.type
        );

        formFieldsData.push({
          formId,
          fieldId: fieldRecord.id,
          label,
          name, // Ajouter le nom généré
          requird: false,
          ordre: currentOrder++,
          options: isSelectType ? ["Option 1", "Option 2", "Option 3"] : [],
          placeholdre: GestionForm.generatePlaceholder(fieldRecord.type, label),
        });
      }
    }
    return formFieldsData;
  }
}
