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

  static generateDefaultValidationMessages(formId: string): Array<{ formId: string, validationName: string, validationValeu: string }> {
    return [
      {
        formId,
        validationName: "success",
        validationValeu: "Merci pour votre message. Il a été envoyé.",
      },
      {
        formId,
        validationName: "echec",
        validationValeu: "Une erreur s'est produite lors de la tentative d'envoi de votre message. Veuillez réessayer plus tard.",
      },
      {
        formId,
        validationName: "validationError",
        validationValeu: "Un ou plusieurs champs contiennent une erreur. S'il vous plaît, vérifiez et essayez à nouveau.",
      },
      {
        formId,
        validationName: "accept",
        validationValeu: "Vous devez accepter les termes et conditions avant d'envoyer votre message.",
      },
      {
        formId,
        validationName: "fill",
        validationValeu: "Veuillez remplir ce champ.",
      },
      {
        formId,
        validationName: "max",
        validationValeu: "Ce champ a une entrée trop longue.",
      },
      {
        formId,
        validationName: "min",
        validationValeu: "Ce champ a une entrée trop courte.",
      },
      {
        formId,
        validationName: "uploadFail",
        validationValeu: "Une erreur inconnue s'est produite lors du téléchargement du fichier.",
      },
      {
        formId,
        validationName: "unautorisedFile",
        validationValeu: "Vous n'êtes pas autorisé à télécharger des fichiers de ce type.",
      },
      {
        formId,
        validationName: "uploadMax",
        validationValeu: "Le fichier téléchargé est trop volumineux.",
      },
      {
        formId,
        validationName: "unvalidDate",
        validationValeu: "Veuillez saisir une date au format AAAA-MM-JJ.",
      },
      {
        formId,
        validationName: "dateMax",
        validationValeu: "Ce champ a une date trop précoce.",
      },
      {
        formId,
        validationName: "dateMin",
        validationValeu: "Ce champ a une date trop tardive.",
      },
      {
        formId,
        validationName: "unvalidNum",
        validationValeu: "Veuillez entrer un numéro.",
      },
      {
        formId,
        validationName: "maxNum",
        validationValeu: "Ce champ contient un nombre trop petit.",
      },
      {
        formId,
        validationName: "minNum",
        validationValeu: "Ce champ contient un nombre trop grand.",
      },
      {
        formId,
        validationName: "unvalidEmail",
        validationValeu: "Entrez une adresse email valide.",
      },
      {
        formId,
        validationName: "unvalidUrl",
        validationValeu: "Veuillez saisir une URL valide.",
      },
      {
        formId,
        validationName: "unvalidPhone",
        validationValeu: "Veuillez saisir un numéro de téléphone valide.",
      },
    ];
  }
}
