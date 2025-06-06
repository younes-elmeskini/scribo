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

    for (const { fieldName, count } of fieldCounts) {
      const fieldRecord = availableFields.find(
        (f) => f.fieldName === fieldName
      );

      if (!fieldRecord) continue;

      for (let i = 0; i < count; i++) {
        const label = `${fieldRecord.fieldName} ${i + 1}`;
        // Générer un nom unique pour le champ
        const name = `field_${fieldRecord.type}_${fieldName
          .toLowerCase()
          .replace(/\s+/g, "_")}_${i + 1}`;
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
          options: isSelectType
            ? [
                {
                  ordre: 1,
                  content: "Option 1",
                  desactivatedAt: false,
                },
                {
                  ordre: 2,
                  content: "Option 2",
                  desactivatedAt: false,
                },
                {
                  ordre: 3,
                  content: "Option 3",
                  desactivatedAt: false,
                },
              ]
            : [],
          placeholdre: GestionForm.generatePlaceholder(fieldRecord.type, label),
          message: GestionForm.generateDefaultErrorMessage(fieldRecord.type, fieldRecord.fieldName, false)
        });
      }
    }
    return formFieldsData;
  }

  /**
   * Génère un message d'erreur par défaut en fonction du type de champ et de son statut obligatoire
   * @param fieldType Type du champ
   * @param fieldName Nom du champ
   * @param isRequired Indique si le champ est obligatoire
   * @returns Message d'erreur approprié
   */
  static generateDefaultErrorMessage(fieldType: string, fieldName: string, isRequired: boolean): string {
    // Message pour champ obligatoire
    if (isRequired) {
      return `Le champ ${fieldName.toLowerCase()} est obligatoire`;
    }
    
    // Messages spécifiques par type de champ
    switch (fieldType) {
      case "text":
        return `Veuillez entrer un texte valide`;
      case "textarea":
        return `Veuillez entrer une description valide`;
      case "email":
        return `Veuillez entrer une adresse email valide`;
      case "tel":
        return `Veuillez entrer un numéro de téléphone valide`;
      case "number":
        return `Veuillez entrer un nombre valide`;
      case "date":
        return `Veuillez entrer une date valide`;
      case "time":
        return `Veuillez entrer une heure valide`;
      case "datetime":
        return `Veuillez entrer une date et heure valides`;
      case "file":
        return `Veuillez sélectionner un fichier valide`;
      case "image":
        return `Veuillez sélectionner une image valide`;
      case "url":
        return `Veuillez entrer une URL valide`;
      case "radio":
        return `Veuillez sélectionner une option`;
      case "checkbox":
        return `Veuillez cocher au moins une option`;
      case "select":
        return `Veuillez sélectionner une option dans la liste`;
      case "map":
        return `Veuillez sélectionner un emplacement sur la carte`;
      case "range":
        return `Veuillez sélectionner une valeur dans la plage`;
      case "color":
        return `Veuillez sélectionner une couleur`;
      case "boolean":
        return `Veuillez indiquer votre choix`;
      default:
        return `Veuillez remplir ce champ correctement`;
    }
  }
}
