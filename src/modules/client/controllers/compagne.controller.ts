import { Request, Response } from "express";
import prisma from "../../../utils/client";
import { z } from "zod";
import CompagneValidation from "../utils/validation/compagne";
import { validationResult } from "../../../utils/validation/validationResult";
import { Role } from "@prisma/client";
import { ExcelFieldAnalyzer, FieldAnalysis } from "../utils/excelAnalyzer";
import multer from "multer";
import path from "path";

type createCompagne = z.infer<typeof CompagneValidation.createCompagneSchema>;

// Configuration Multer pour l'upload de fichiers Excel
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Format de fichier non supporté. Utilisez .xlsx ou .xls"));
    }
  },
});

export const uploadExcelMiddleware = upload.single("excelFile");

type createCompagneFromExcel = {
  compagneName: string;
};
export default class CompagneController {
  static async createCompagne(req: Request, res: Response): Promise<void> {
    try {
      validationResult(CompagneValidation.createCompagneSchema, req, res);
      const parsedData: createCompagne =
        CompagneValidation.createCompagneSchema.parse(req.body);
      const clientId = req.client?.id;
      if (!clientId) {
        res.status(400).json({ message: "Unauthorized" });
        return;
      }
      const fields = await prisma.fields.findMany({
        where: {
          id: {
            in: parsedData.fields,
          },
        },
      });
      if (fields.length !== parsedData.fields.length) {
        res.status(400).json({ message: "Invalid fields" });
        return;
      }
      const compagne = await prisma.compagne.create({
        data: {
          compagneName: parsedData.compagneName,
          clientId: clientId.toString(),
        },
      });
      if (!compagne) {
        res.status(400).json({ message: "Compagne not created" });
        return;
      }
      const form = await prisma.form.create({
        data: {
          compagneId: compagne.id,
        },
      });
      if (!form) {
        res.status(400).json({ message: "Form not created" });
        return;
      }
      const formFields = await prisma.formField.createMany({
        data: parsedData.fields.map((field: string) => ({
          formId: form.id,
          fieldId: field,
          ordre: parsedData.fields.indexOf(field),
        })),
      });
      if (!formFields) {
        res.status(400).json({ message: "Form fields not created" });
        return;
      }
      res.status(201).json({ message: "Compagne created successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async getAllCompagne(req: Request, res: Response): Promise<void> {
    try {
      const clientId = req.client?.id;
      if (!clientId) {
        res.status(400).json({ message: "Unauthorized" });
        return;
      }

      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = 3;
      const skip = (page - 1) * limit;

      // Validate pagination parameters
      if (page < 1) {
        res.status(400).json({ message: "Invalid pagination parameters" });
        return;
      }

      // Get total count for pagination metadata
      const totalCount = await prisma.compagne.count({
        where: {
          OR: [
            {
              clientId: clientId.toString(), // Owner
            },
            {
              TeamCompagne: {
                some: {
                  teamMember: {
                    membreId: clientId.toString(), // Membre
                  },
                },
              },
            },
          ],
        },
      });

      const campagnes = await prisma.compagne.findMany({
        where: {
          OR: [
            {
              clientId: clientId.toString(), // Owner
            },
            {
              TeamCompagne: {
                some: {
                  teamMember: {
                    membreId: clientId.toString(), // Membre
                  },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          compagneName: true,
          status: true,
          favrite: true,
          soumission: true,
          Call: true,
          Email: true,
          Notes: true,
          Task: true,
          appointment: true,
        },
        skip: skip,
        take: limit,
        orderBy: {
          id: "desc", // Optional: order by most recent first
        },
      });

      const formattedResult = campagnes.map((campagne) => ({
        id: campagne.id,
        compagneName: campagne.compagneName,
        status: campagne.status,
        favrite: campagne.favrite,
        soumission: campagne.soumission.length,
        actions:
          campagne.soumission.length +
          campagne.Call.length +
          campagne.Email.length +
          campagne.Notes.length +
          campagne.Task.length +
          campagne.appointment.length,
      }));

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / limit);

      res.status(200).json({
        data: formattedResult,
        pagination: {
          currentPage: page,
          totalPages,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async getsideBarData(req: Request, res: Response): Promise<void> {
    try {
      const clientId = req.client?.id;
      if (!clientId) {
        res.status(400).json({ message: "Unauthorized" });
        return;
      }

      const campagnes = await prisma.compagne.findMany({
        where: {
          OR: [
            {
              clientId: clientId.toString(), // Owner
            },
            {
              clientId: clientId.toString(), // Member
            },
          ],
        },
        select: {
          id: true,
          compagneName: true,
          favrite: true,
        },
      });

      const formattedResult = campagnes.map((campagne) => ({
        id: campagne.id,
        favorite: campagne.favrite,
        name: campagne.compagneName,
      }));

      const favriteCampagnes = formattedResult.filter(
        (campagne) => campagne.favorite
      );
      const notFavriteCampagnes = formattedResult.filter(
        (campagne) => !campagne.favorite
      );

      res.status(200).json({
        favriteCampagnes,
        notFavriteCampagnes,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async getCompagneById(req: Request, res: Response): Promise<void> {
    try {
      const compagneId = req.params.id;

      // Get soumissions by date
      const soumissions = await prisma.soumission.findMany({
        where: { compagneId },
        select: { createdAt: true },
      });

      const soumissionsByDay = soumissions.reduce(
        (acc: Record<string, number>, submission) => {
          const date = submission.createdAt.toISOString().split("T")[0];
          acc[date] = (acc[date] || 0) + 1;
          return acc;
        },
        {}
      );

      // Get all FormFields with options
      const formFields = await prisma.formField.findMany({
        where: {
          form: {
            compagneId,
          },
          options: {
            isEmpty: false,
          },
        },
        include: {
          Answer: true,
        },
      });

      const answersStats = formFields.map((field) => {
        const optionCount = field.options.reduce(
          (acc: Record<string, number>, option) => {
            acc[option] = 0;
            return acc;
          },
          {}
        );

        field.Answer.forEach((answer) => {
          if (optionCount[answer.valeu] !== undefined) {
            optionCount[answer.valeu]++;
          }
        });

        return {
          fieldId: field.id,
          label: field.label,
          stats: optionCount,
        };
      });

      res.status(200).json({
        soumissionsByDay,
        answersStats,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  // Nouvelle méthode pour analyser le fichier Excel
  static async analyzeExcelFile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ message: "Aucun fichier Excel fourni" });
        return;
      }

      const analyzer = new ExcelFieldAnalyzer();
      const fields = await analyzer.analyzeExcelFile(req.file.buffer);

      res.status(200).json({
        message: "Fichier Excel analysé avec succès",
        fields,
        totalFields: fields.length,
      });
    } catch (error) {
      console.error("Erreur lors de l'analyse du fichier Excel:", error);
      res.status(500).json({
        message: "Erreur lors de l'analyse du fichier Excel",
        error: error instanceof Error ? error.message : "Erreur inconnue",
      });
    }
  }

  // Méthode pour créer une campagne à partir d'un fichier Excel
  static async createCompagneFromExcel(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ message: "Aucun fichier Excel fourni" });
        return;
      }

      const { compagneName } = req.body;
      if (!compagneName) {
        res.status(400).json({ message: "Nom de campagne requis" });
        return;
      }

      const clientId = req.client?.id;
      if (!clientId) {
        res.status(400).json({ message: "Unauthorized" });
        return;
      }

      // Analyser le fichier Excel
      const analyzer = new ExcelFieldAnalyzer();
      const analyzedFields = await analyzer.analyzeExcelFile(req.file.buffer);

      if (analyzedFields.length === 0) {
        res
          .status(400)
          .json({ message: "Aucun champ détecté dans le fichier Excel" });
        return;
      }

      // Créer la campagne
      const compagne = await prisma.compagne.create({
        data: {
          compagneName,
          clientId: clientId.toString(),
        },
      });

      // Créer le formulaire
      const form = await prisma.form.create({
        data: {
          compagneId: compagne.id,
          title: compagneName,
          Description: `Formulaire généré automatiquement à partir du fichier Excel`,
        },
      });

      // Traiter chaque champ analysé
      const formFieldsData = [];
      for (let i = 0; i < analyzedFields.length; i++) {
        const field = analyzedFields[i];

        // Trouver ou créer le type de champ dans la base
        let fieldRecord = await prisma.fields.findFirst({
          where: { type: field.type },
        });

        if (!fieldRecord) {
          // Créer le type de champ s'il n'existe pas
          fieldRecord = await prisma.fields.create({
            data: {
              icon: CompagneController.getIconForFieldType(field.type),
              fieldName: CompagneController.getFieldNameForType(field.type),
              type: field.type,
            },
          });
        }

        // Préparer les données du champ de formulaire
        formFieldsData.push({
          formId: form.id,
          fieldId: fieldRecord.id,
          label: field.label,
          requird: field.required,
          ordre: i,
          options: field.options,
          placeholdre: CompagneController.generatePlaceholder(
            field.type,
            field.label
          ),
          message: field.required ? `${field.label} est requis` : undefined,
        });
      }

      // Créer tous les champs de formulaire
      await prisma.formField.createMany({
        data: formFieldsData,
      });

      res.status(201).json({
        message: "Campagne créée avec succès à partir du fichier Excel",
        compagne: {
          id: compagne.id,
          name: compagne.compagneName,
          fieldsCount: analyzedFields.length,
        },
        analyzedFields: analyzedFields.map((field) => ({
          label: field.label,
          type: field.type,
          required: field.required,
          optionsCount: field.options.length,
          fillRate: field.fillRate,
        })),
      });
    } catch (error) {
      console.error("Erreur lors de la création de la campagne:", error);
      res.status(500).json({
        message: "Erreur lors de la création de la campagne",
        error: error instanceof Error ? error.message : "Erreur inconnue",
      });
    }
  }

  // Méthode utilitaire pour obtenir l'icône selon le type de champ
  private static getIconForFieldType(type: string): string {
    const iconMap: Record<string, string> = {
      text: "≡",
      textarea: "≡",
      email: "✉️",
      url: "🔗",
      tel: "📞",
      number: "#",
      radio: "⚪",
      checkbox: "☑️",
      select: "▾",
      date: "📅",
      time: "🕒",
      datetime: "📆",
      file: "📎",
      image: "🖼️",
      map: "📍",
      range: "🔗",
    };
    return iconMap[type] || "≡";
  }

  // Méthode utilitaire pour obtenir le nom du champ selon le type
  private static getFieldNameForType(type: string): string {
    const nameMap: Record<string, string> = {
      text: "Champ de texte",
      textarea: "Zone de texte",
      email: "Adresse email",
      url: "URL",
      tel: "Numéro de téléphone",
      number: "Valeur numérique",
      radio: "Boutons radio",
      checkbox: "Cases à cocher",
      select: "Menu déroulant",
      date: "Date",
      time: "Heure",
      datetime: "Date et heure",
      file: "Fichier",
      image: "Image",
      map: "Google Map",
      range: "Plage de valeurs",
    };
    return nameMap[type] || "Champ personnalisé";
  }

  // Méthode utilitaire pour générer un placeholder approprié
  private static generatePlaceholder(type: string, label: string): string {
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
}
