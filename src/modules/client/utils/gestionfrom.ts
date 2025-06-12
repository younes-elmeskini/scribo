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

  /**
   * Génère les messages de validation par défaut pour un formulaire
   * @param formId ID du formulaire
   * @returns Tableau d'objets contenant les messages de validation par défaut
   */
  static generateDefaultValidationMessages(formId: string): Array<{ formId: string, validationName: string, validationValeu: string }> {
    return [
      {
        formId,
        validationName: "required",
        validationValeu: "Ce champ est obligatoire",
      },
      {
        formId,
        validationName: "email",
        validationValeu: "Veuillez entrer une adresse email valide",
      },
      {
        formId,
        validationName: "minLength",
        validationValeu: "Ce champ doit contenir au moins {min} caractères",
      },
      {
        formId,
        validationName: "maxLength",
        validationValeu: "Ce champ ne peut pas dépasser {max} caractères",
      },
      {
        formId,
        validationName: "pattern",
        validationValeu: "Format invalide",
      },
      {
        formId,
        validationName: "fileType",
        validationValeu: "Type de fichier non supporté. Types acceptés: {types}",
      },
      {
        formId,
        validationName: "fileSize",
        validationValeu: "La taille du fichier ne doit pas dépasser {size}MB",
      },
      {
        formId,
        validationName: "minValue",
        validationValeu: "La valeur doit être supérieure ou égale à {min}",
      },
      {
        formId,
        validationName: "maxValue",
        validationValeu: "La valeur doit être inférieure ou égale à {max}",
      },
      {
        formId,
        validationName: "success",
        validationValeu: "Formulaire soumis avec succès",
      },
      {
        formId,
        validationName: "error401",
        validationValeu: "Vous n'êtes pas autorisé à soumettre ce formulaire",
      },
      {
        formId,
        validationName: "emailError",
        validationValeu: "Une erreur s'est produite lors de l'envoi de l'email",
      },
      {
        formId,
        validationName: "minCharError",
        validationValeu: "Nombre minimum de caractères non atteint",
      },
      {
        formId,
        validationName: "maxCharError",
        validationValeu: "Nombre maximum de caractères dépassé",
      },
      {
        formId,
        validationName: "fileTypeError",
        validationValeu: "Type de fichier non autorisé",
      },
      {
        formId,
        validationName: "uniqueEmail",
        validationValeu: "Cette adresse email est déjà utilisée",
      },
    ];
  }
}
