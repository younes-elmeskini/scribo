import { Request, Response } from "express";
import prisma from "../../../utils/client";
import { z } from "zod";
import CompagneValidation from "../utils/validation/compagne";
import { validationResult } from "../../../utils/validation/validationResult";
import { Role } from "@prisma/client";
import multer from "multer";
import GestionForm from "../utils/gestionfrom";
import { Parser as Json2csvParser } from "json2csv"; 

type createCompagne = z.infer<typeof CompagneValidation.createCompagneSchema>;
type updateCompagne = z.infer<typeof CompagneValidation.updatecompagne>;

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
        take: page * limit,
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
          totalPages: totalPages,
          totalCompagnes: totalCount,
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
        data: { favriteCampagnes, notFavriteCampagnes },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async getCompagneById(req: Request, res: Response): Promise<void> {
    try {
      const compagneId = req.params.id;
      const clientId = req.client?.id;
      if (!clientId) {
        res.status(400).json({ message: "Unauthorized" });
        return;
      }
      const compagne = await prisma.compagne.findUnique({
        where: {
          id: compagneId,
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
          description: true,
        },
      });
      if (!compagne) {
        res.status(404).json({ message: "Compagne not found" });
        return;
      }

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
          FormFieldOption: {
            some: {}, // This replaces the options.isEmpty check
          },
        },
        include: {
          Answer: true,
          FormFieldOption: true,
        },
      });

      const answersStats = formFields.map((field) => {
        const optionCount: Record<string, number> = {};
        const optionPorcentage: Record<string, number> = {};

        // Initialize counts for all options
        field.FormFieldOption.forEach((option) => {
          optionCount[option.content] = 0;
        });

        // Count answers
        field.Answer.forEach((answer) => {
          if (optionCount[answer.valeu] !== undefined) {
            optionCount[answer.valeu]++;
          }
        });

        // Calculate percentages
        if (field.Answer.length > 0) {
          Object.keys(optionCount).forEach((option) => {
            optionPorcentage[option] =
              (optionCount[option] / field.Answer.length) * 100;
          });
        }

        return {
          fieldId: field.id,
          label: field.label,
          stats: optionCount,
          porcentage: optionPorcentage,
        };
      });

      const calls = await prisma.call.count({
        where: {
          compagneId,
        },
      });
      const notes = await prisma.notes.count({
        where: {
          compagneId,
        },
      });
      const emails = await prisma.email.count({
        where: {
          compagneId,
        },
      });
      const tasks = await prisma.task.findMany({
        where: {
          compagneId,
        },
      });
      const appointment = await prisma.appointment.findMany({
        where: {
          compagneId,
        },
      });
      res.status(200).json({
        data: {
          totalsoumissions: soumissions.length,
          description: compagne.description,
          soumissionsByDay,
          answersStats,
          action: {
            calls,
            notes,
            emails,
            tasks,
            appointment,
          },
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async favoriteCompagne(req: Request, res: Response): Promise<void> {
    try {
      const compagneId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      if (!compagneId) {
        res.status(400).json({ message: "Compagne ID is required" });
        return;
      }

      // Check if the compagne exists and user has access to it
      const compagne = await prisma.compagne.findFirst({
        where: {
          id: compagneId,
          OR: [
            {
              clientId: clientId.toString(), // Owner
            },
            {
              TeamCompagne: {
                some: {
                  teamMember: {
                    membreId: clientId.toString(), // Team member
                  },
                },
              },
            },
          ],
        },
      });

      if (!compagne) {
        res
          .status(404)
          .json({ message: "Compagne not found or access denied" });
        return;
      }

      // Update favorite status
      const updatedCompagne = await prisma.compagne.update({
        where: { id: compagneId },
        data: { favrite: compagne.favrite ? false : true },
        select: {
          id: true,
          compagneName: true,
          favrite: true,
        },
      });

      res.status(200).json({
        message: "Compagne added to favorites successfully",
        data: updatedCompagne,
      });
    } catch (error) {
      console.error("Error favoriting compagne:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

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

      // Extract fieldIds from the fields array
      const fieldIds = parsedData.fields.map((field) => field.id);

      const fields = await prisma.fields.findMany({
        where: {
          id: {
            in: fieldIds,
          },
        },
      });

      if (fields.length !== fieldIds.length) {
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

      // Préparer les données pour GestionForm.generateFormFieldsData
      const fieldCountsData = parsedData.fields.map((field) => ({
        fieldName: fields.find((f) => f.id === field.id)?.fieldName || "",
        id: field.id,
        count: field.quantity || 1,
      }));

      // Utiliser GestionForm pour générer les champs de formulaire
      const formFieldsData = GestionForm.generateFormFieldsData(
        fieldCountsData,
        fields,
        form.id
      );

      // Generate default validation messages
      const defaultValidations = GestionForm.generateDefaultValidationMessages(
        form.id
      );

      // Replace the createMany call with a transaction that handles options separately
      await prisma.$transaction(async (tx) => {
        // First create the form fields without options
        for (const fieldData of formFieldsData) {
          // Extract options to handle separately
          const { options, ...fieldWithoutOptions } = fieldData;

          // Create the form field
          const createdField = await tx.formField.create({
            data: fieldWithoutOptions,
          });

          // If this field has options and is of a type that supports options
          if (options && options.length > 0) {
            // Create options for this field
            for (const option of options) {
              await tx.formFieldOption.create({
                data: {
                  formFieldId: createdField.id,
                  ordre: option.ordre,
                  content: option.content,
                  desactivedAt: option.desactivatedAt || false,
                },
              });
            }
          }
        }

        // Create default validation messages
        for (const validation of defaultValidations) {
          await tx.validationForm.create({
            data: validation,
          });
        }
      });

      res.status(201).json({
        message: "Compagne created successfully",
        data: {
          compagneId: compagne.id,
          formId: form.id,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async createCompagneFromExcel(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      // Validation des entrées
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
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Analyser le fichier Excel
      const fieldCounts = await GestionForm.extractFieldCountsFromExcel(
        req.file.buffer
      );

      if (fieldCounts.length === 0) {
        res
          .status(400)
          .json({ message: "Aucun champ valide trouvé dans le fichier Excel" });
        return;
      }

      // Vérifier si tous les noms de champs existent dans la base de données
      const availableFields = await prisma.fields.findMany();
      const fieldNames = availableFields.map((field) => field.fieldName);

      const invalidFields = fieldCounts.filter(
        (field) => !fieldNames.includes(field.fieldName)
      );

      if (invalidFields.length > 0) {
        res.status(400).json({
          message:
            "Certains champs dans votre fichier Excel n'existent pas dans notre système",
          invalidFields: invalidFields.map((f) => f.fieldName),
        });
        return;
      }

      // Créer la campagne et le formulaire en une seule transaction
      const { compagne, form, formFieldsData } = await prisma.$transaction(
        async (tx) => {
          // Créer la campagne
          const newCompagne = await tx.compagne.create({
            data: {
              compagneName,
              clientId: clientId.toString(),
            },
          });

          // Créer le formulaire
          const newForm = await tx.form.create({
            data: {
              compagneId: newCompagne.id,
              title: compagneName,
              Description: `Formulaire généré à partir des comptages de champs Excel`,
            },
          });

          // Générer les données des champs de formulaire
          const fieldsData = GestionForm.generateFormFieldsData(
            fieldCounts,
            availableFields,
            newForm.id
          );

          // Generate default validation messages
          const defaultValidations =
            GestionForm.generateDefaultValidationMessages(newForm.id);

          // Créer tous les champs de formulaire
          if (fieldsData.length > 0) {
            // Process each field individually to handle options
            for (const fieldData of fieldsData) {
              // Extract options to handle separately
              const { options, ...fieldWithoutOptions } = fieldData as any;

              // Create the form field
              const createdField = await tx.formField.create({
                data: fieldWithoutOptions,
              });

              // If this field has options and is of a type that supports options
              if (options && Array.isArray(options) && options.length > 0) {
                // Create options for this field
                for (const option of options) {
                  await tx.formFieldOption.create({
                    data: {
                      formFieldId: createdField.id,
                      ordre: option.ordre,
                      content: option.content,
                      desactivedAt: option.desactivatedAt || false,
                    },
                  });
                }
              }
            }
          }

          // Create default validation messages
          for (const validation of defaultValidations) {
            await tx.validationForm.create({
              data: validation,
            });
          }

          return {
            compagne: newCompagne,
            form: newForm,
            formFieldsData: fieldsData,
          };
        }
      );

      res.status(201).json({
        message: "Campagne créée avec succès à partir du fichier Excel",
        compagne: {
          id: compagne.id,
          name: compagne.compagneName,
          fieldsCount: formFieldsData.length,
        },
        fieldCounts,
      });
    } catch (error) {
      console.error("Erreur lors de la création de la campagne:", error);
      res.status(500).json({
        message: "Erreur lors de la création de la campagne",
        error: error instanceof Error ? error.message : "Erreur inconnue",
      });
    }
  }

  static async createCompagneFromModel(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { compagneName, modelFormId } = req.body;

      if (!compagneName || !modelFormId) {
        res
          .status(400)
          .json({ message: "Nom de campagne et ID du modèle requis" });
        return;
      }

      const clientId = req.client?.id;
      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Vérifier si le modèle existe
      const modelForm = await prisma.modelForm.findUnique({
        where: { id: modelFormId },
        include: {
          modelFormField: {
            include: {
              fields: true,
            },
            orderBy: {
              ordre: "asc",
            },
          },
        },
      });

      if (!modelForm) {
        res.status(404).json({ message: "Modèle de formulaire non trouvé" });
        return;
      }

      // Créer la campagne et le formulaire en une seule transaction
      const result = await prisma.$transaction(async (tx) => {
        // Créer la campagne
        const newCompagne = await tx.compagne.create({
          data: {
            compagneName,
            clientId: clientId.toString(),
          },
        });

        // Créer le formulaire avec les propriétés du modèle
        const newForm = await tx.form.create({
          data: {
            compagneId: newCompagne.id,
            title: modelForm.title || compagneName,
            Description: modelForm.Description,
            coverColor: modelForm.coverColor,
            coverImage: modelForm.coverImage,
            mode: modelForm.mode,
          },
        });

        // Créer les champs de formulaire basés sur le modèle
        const formFieldsData = modelForm.modelFormField.map((modelField) => ({
          formId: newForm.id,
          fieldId: modelField.fieldId,
          label: modelField.label,
          name: `field_${modelField.fields.type.toLowerCase()}_${
            modelField.ordre
          }`,
          requird: modelField.requird,
          disable: modelField.disable,
          style: modelField.style,
          ordre: modelField.ordre,
          placeholdre: modelField.placeholdre,
          options: modelField.options,
          min: modelField.min,
          max: modelField.max,
          fileType: modelField.fileType,
          instruction: modelField.instruction,
        }));

        // Generate default validation messages
        const defaultValidations =
          GestionForm.generateDefaultValidationMessages(newForm.id);

        // Process each field individually to handle options
        for (const fieldData of formFieldsData) {
          // Extract options to handle separately
          const { options, ...fieldWithoutOptions } = fieldData as any;

          // Create the form field
          const createdField = await tx.formField.create({
            data: fieldWithoutOptions,
          });

          // If this field has options and is of a type that supports options
          if (options && Array.isArray(options) && options.length > 0) {
            // Create options for this field
            for (const option of options) {
              await tx.formFieldOption.create({
                data: {
                  formFieldId: createdField.id,
                  ordre: option.ordre,
                  content: option.content,
                  desactivedAt: option.desactivatedAt || false,
                },
              });
            }
          }
        }

        // Create default validation messages
        for (const validation of defaultValidations) {
          await tx.validationForm.create({
            data: validation,
          });
        }

        return {
          compagne: newCompagne,
          form: newForm,
          fieldsCount: formFieldsData.length,
        };
      });

      res.status(201).json({
        message: "Campagne créée avec succès à partir du modèle",
        compagne: {
          id: result.compagne.id,
          name: result.compagne.compagneName,
          fieldsCount: result.fieldsCount,
        },
      });
    } catch (error) {
      console.error("Erreur lors de la création de la campagne:", error);
      res.status(500).json({
        message: "Erreur lors de la création de la campagne",
        error: error instanceof Error ? error.message : "Erreur inconnue",
      });
    }
  }

  static async updateCompagne(req: Request, res: Response): Promise<void> {
    try {
      validationResult(CompagneValidation.updatecompagne, req, res);
      const parsedData: updateCompagne =
        CompagneValidation.updatecompagne.parse(req.body);
      const compagneId = req.params;
      const clientId = req.client?.id;
      if (!clientId) {
        res.status(400).json({ message: "Unauthorized" });
        return;
      }
      const compagne = await prisma.compagne.findUnique({
        where: {
          id: compagneId.toString(),
          OR: [
            {
              clientId: clientId.toString(), // Owner
            },
            {
              clientId: clientId.toString(), // Member
            },
          ],
        },
      });

      if (!compagne) {
        res.status(404).json({ message: "Compagne not found" });
        return;
      }
      const updateComapgne = await prisma.compagne.update({
        where: {
          id: compagneId.toString(),
        },
        data: {
          ...parsedData,
        },
      });
      res.status(201).json({
        message: "Compagne updated successfully",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async addToTeamCompagne(req: Request, res: Response): Promise<void> {
    try {
      const membreId = req.body;
      const compagneId = req.params;
      const clientId = req.client?.id;
      if (!clientId) {
        res.status(400).json({ message: "Unauthorized" });
        return;
      }
      const compagne = await prisma.compagne.findUnique({
        where: {
          id: compagneId.toString(),
          OR: [
            {
              clientId: clientId.toString(), // Owner
            },
            {
              clientId: clientId.toString(), // Member
            },
          ],
        },
      });
      if (!compagne) {
        res.status(404).json({ message: "Compagne not found" });
        return;
      }
      const membre = await prisma.teamMenber.findFirst({
        where: {
          owenrId:clientId.toString(),
          membreId:membreId,
        },
      });
      if(!membre){
        res.status(404).json({ message: "teamMember not found" });
        return;
      }
      const compagneMember = await prisma.teamCompagne.findFirst({
        where:{
          id:membre.id
        }
      })
      if(compagneMember){
        res.status(404).json({ message: "teamCompagne ready existed" });
        return;
      }
      const teamCompagne = await prisma.teamCompagne.create({
        data: {
          teamMenbreId: membre.id,
          compagneId: compagneId.toString(),
          role: 'MEMBER'
        }
      })
      if(!teamCompagne){
        res.status(404).json({ message: "teamCompagne not created" });
        return;
      }
      res.status(201).json({
        message:"teamCompagne create succes"
      })
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async deleteTeamCompagne(req: Request, res: Response): Promise<void> {
    try {
      const teamCompagneId = req.params.id;
      const clientId = req.client?.id;
      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const teamCompagne = await prisma.teamCompagne.findUnique({
        where: { id: teamCompagneId },
        include: {
          compagne: true
        }
      });

      if (!teamCompagne) {
        res.status(404).json({ message: "teamCompagne not found" });
        return;
      }

      // Check if the authenticated client is the owner of the campaign
      if (teamCompagne.compagne.clientId !== clientId.toString()) {
        res.status(403).json({ message: "Access denied: you are not the owner of the campaign." });
        return;
      }

      await prisma.teamCompagne.delete({
        where: { id: teamCompagneId },
      });
      res.status(200).json({ message: "teamCompagne successfully deleted" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async getTeam(req: Request, res: Response): Promise<void> {
    try {
      const compagneId = req.params.id;
      const clientId = req.client?.id;
      const { search } = req.query;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      // Vérifier si le client a accès à la campagne
      const compagne = await prisma.compagne.findFirst({
        where: {
          id: compagneId,
          OR: [
            { clientId: clientId.toString() },
            {
              TeamCompagne: {
                some: {
                  teamMember: {
                    membreId: clientId.toString(),
                  },
                },
              },
            },
          ],
        },
      });
      if (!compagne) {
        res.status(404).json({ message: "Campagne non trouvée ou accès refusé" });
        return;
      }

      // 1. Récupérer les membres assignés à la campagne
      const teamCompagne = await prisma.teamCompagne.findMany({
        where: { compagneId },
        include: {
          teamMember: {
            include: {
              member: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  profilImage: true,
                },
              },
            },
          },
        },
      });
      let membresAssignes = teamCompagne.map(tc => tc.teamMember.member);

      // 2. Récupérer tous les membres de l'équipe (teamMembre)
      const allTeamMembers = await prisma.teamMenber.findMany({
        where: {
          owenrId: clientId.toString(),
        },
        include: {
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              profilImage: true,
            },
          },
        },
      });
      // Exclure ceux déjà assignés à la campagne
      const membresAssignesIds = new Set(membresAssignes.map(m => m.id));
      let autresMembres = allTeamMembers
        .map(tm => tm.member)
        .filter(m => !membresAssignesIds.has(m.id));

      // 3. Filtrage si search
      if (search) {
        const searchTerm = (search as string).toLowerCase();
        const filterFn = (m: any) =>
          m.firstName.toLowerCase().includes(searchTerm) ||
          m.lastName.toLowerCase().includes(searchTerm) ||
          m.email.toLowerCase().includes(searchTerm);
        // Filtrer les deux listes
        membresAssignes = membresAssignes.filter(filterFn);
        autresMembres = autresMembres.filter(filterFn);
      }

      res.status(200).json({
        membresAssignes,
        autresMembres
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  static async deleteCompagne(req: Request, res: Response): Promise<void> {
    try {
      const compagneId = req.params.id;
      const clientId = req.client?.id;
      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }
      // Vérifier que la campagne existe et que l'utilisateur est propriétaire
      const compagne = await prisma.compagne.findFirst({
        where: {
          id: compagneId,
          clientId: clientId.toString(),
          deletedAt: null
        },
      });
      if (!compagne) {
        res.status(404).json({ message: "Campagne non trouvée ou accès refusé" });
        return;
      }
      await prisma.compagne.update({
        where: { id: compagneId },
        data: { deletedAt: new Date() },
      });
      res.status(200).json({ message: "Campagne supprimée avec succès" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  static async exportSoumissions(req: Request, res: Response): Promise<void> {
    try {
      const compagneId = req.params.id;
      const clientId = req.client?.id;
      const { fields, format, filters } = req.body;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      // Construction dynamique des filtres
      const where: any = { compagneId };
      if (filters?.status) where.status = filters.status;
      if (filters?.favorite !== undefined) where.favorite = filters.favorite;
      if (filters?.startDate && filters?.endDate) {
        where.createdAt = {
          gte: new Date(filters.startDate),
          lte: new Date(filters.endDate),
        };
      }
      if (filters?.search && filters?.field) {
        where.answer = {
          some: {
            formField: { label: filters.field },
            valeu: { contains: filters.search, mode: "insensitive" },
          },
        };
      }

      // Récupérer les soumissions avec les réponses
      const soumissions = await prisma.soumission.findMany({
        where,
        include: {
          answer: {
            include: {
              formField: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Générer les données à exporter selon les champs sélectionnés
      const exportData = soumissions.map((soumission) => {
        const row: Record<string, any> = {};
        for (const field of fields) {
          // Chercher la réponse correspondant au champ demandé
          const answer = soumission.answer.find(
            (a) => a.formField.label === field || a.formField.name === field
          );
          row[field] = answer ? answer.valeu : "";
        }
        row["Date de soumission"] = soumission.createdAt.toISOString();
        return row;
      });

      // Générer le fichier selon le format demandé
      if (format === "csv") {
        const parser = new Json2csvParser({ fields });
        const csv = parser.parse(exportData);
        res.header("Content-Type", "text/csv");
        res.attachment("export_soumissions.csv");
        res.send(csv);
      } else if (format === "json") {
        res.header("Content-Type", "application/json");
        res.attachment("export_soumissions.json");
        res.send(JSON.stringify(exportData, null, 2));
      } else {
        res.status(400).json({ message: "Format d'export non supporté" });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }
}
