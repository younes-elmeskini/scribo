import { Request, Response } from "express";
import prisma from "../../../utils/client";
import SoumissionValidation from "../utils/validation/soumission";
import { validationResult } from "../../../utils/validation/validationResult";
import { z } from "zod";

type createNote = z.infer<typeof SoumissionValidation.createNotesSchema>;
export default class SoumissionController {
  static async getCompagneSoumissions(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const compagneId = req.params.id;
      const clientId = req.client?.id;
      
      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      
      // Vérifier si la campagne existe et si l'utilisateur a accès
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
        res.status(404).json({ message: "Campagne not found or access denied" });
        return;
      }
      
      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;
      
      // Get total count for pagination metadata
      const totalCount = await prisma.soumission.count({
        where: { compagneId },
      });
      
      // Get submissions with answers
      const soumissions = await prisma.soumission.findMany({
        where: { compagneId },
        include: {
          answer: {
            include: {
              formField: {
                select: {
                  label: true,
                  name: true,
                  fields: {
                    select: {
                      type: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      });
      
      // Format the submissions for better readability
      const formattedSoumissions = soumissions.map(soumission => {
        // Create an object with field labels as keys and answers as values
        const formattedAnswers: Record<string, any> = {};
        
        soumission.answer.forEach(answer => {
          const fieldLabel = answer.formField.label;
          const fieldType = answer.formField.fields.type;
          
          // Format the answer value based on field type
          let formattedValue: any = answer.valeu;
          
          if (fieldType === "date") {
            formattedValue = new Date(answer.valeu).toISOString().split('T')[0];
          } else if (fieldType === "checkbox") {
            formattedValue = answer.valeu === "true";
          } else if (fieldType === "number") {
            formattedValue = parseFloat(answer.valeu);
          }
          
          if (fieldLabel !== null && fieldLabel !== undefined) {
            formattedAnswers[fieldLabel] = formattedValue;
          }
        });
        
        return {
          id: soumission.id,
          createdAt: soumission.createdAt,
          updatedAt: soumission.updatedAt,
          answers: formattedAnswers,
        };
      });
      
      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / limit);
      
      res.status(200).json({
        data: formattedSoumissions,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limit,
        },
      });
    } catch (error) {
      console.error("Error fetching submissions:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async getSoumissionDetails(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const soumissionId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Vérifier si la soumission existe et si l'utilisateur a accès
      const soumission = await prisma.soumission.findFirst({
        where: {
          id: soumissionId,
          compagne: {
            OR: [
              { clientId: clientId.toString() }, // Propriétaire
              {
                TeamCompagne: {
                  some: {
                    teamMember: {
                      membreId: clientId.toString(), // Membre d'équipe
                    },
                  },
                },
              },
            ],
          },
        },
        include: {
          answer: {
            include: {
              formField: {
                include: {
                  fields: true,
                },
              },
            },
          },
          Call: true,
          Email: true,
          Notes: true,
          Task: true,
          appointment: true,
        },
      });

      if (!soumission) {
        res
          .status(404)
          .json({ message: "Submission not found or access denied" });
        return;
      }

      // Format the submission data
      const formattedAnswers = soumission.answer.map((answer) => ({
        id: answer.id,
        fieldId: answer.formFieldId,
        fieldLabel: answer.formField.label,
        fieldType: answer.formField.fields.type,
        value: answer.valeu,
      }));

      // Count activities
      const activitiesCount = {
        calls: soumission.Call.length,
        emails: soumission.Email.length,
        notes: soumission.Notes.length,
        tasks: soumission.Task.length,
        appointments: soumission.appointment.length,
      };


      res.status(200).json({
        data: {
          id: soumission.id,
          createdAt: soumission.createdAt,
          updatedAt: soumission.updatedAt,
          answers: formattedAnswers,
          activities: {
            counts: activitiesCount,
            details: {
              calls: soumission.Call,
              emails: soumission.Email,
              notes: soumission.Notes,
              tasks: soumission.Task,
              appointments: soumission.appointment,
            },
          },
        },
      });
    } catch (error) {
      console.error("Error fetching submission details:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async updateSoumissionAnswers(req: Request, res: Response): Promise<void> {
    try {
      const soumissionId = req.params.id;
      const clientId = req.client?.id;
      const answers = req.body.answers;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      
      const soumission = await prisma.soumission.findFirst({
        where: {
          id: soumissionId,
          compagne: {
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
        },
      });
      if (!soumission) {
        res.status(404).json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }

      if (!Array.isArray(answers) || answers.length === 0) {
        res.status(400).json({ message: "Aucune réponse à mettre à jour" });
        return;
      }
      
      // Vérifier que toutes les réponses appartiennent à cette soumission
      const answerIds = answers.map(a => a.id);
      const existingAnswers = await prisma.answer.findMany({
        where: {
          id: { in: answerIds },
          soumissionId
        }
      });
      if (existingAnswers.length !== answers.length) {
        res.status(400).json({ message: "Une ou plusieurs réponses sont invalides" });
        return;
      }

      // Mettre à jour toutes les réponses dans une transaction
      await prisma.$transaction(
        answers.map(a =>
          prisma.answer.update({
            where: { id: a.id },
            data: { valeu: a.value }
          })
        )
      );

      // Retourner les réponses mises à jour
      const updatedAnswers = await prisma.answer.findMany({
        where: { soumissionId }
      });

      res.status(200).json({
        message: "Réponses mises à jour avec succès",
        data: updatedAnswers
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }
  
  static async deleteSoumission(req: Request, res: Response): Promise<void> {
    try {
      const soumissionId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      
      const soumission = await prisma.soumission.findFirst({
        where: {
          id: soumissionId,
          compagne: {
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
        },
      });
      if (!soumission) {
        res.status(404).json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }
      
      await prisma.soumission.update({
        where: { id: soumissionId },
        data:{
          deletedAt: new Date()
        }
      });

      res.status(200).json({ message: "Soumission supprimée avec succès" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  static async toggleSoumissionFavorite(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const soumissionId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Vérifier si la soumission existe et si l'utilisateur a accès
      const soumission = await prisma.soumission.findFirst({
        where: {
          id: soumissionId,
          compagne: {
            OR: [
              { clientId: clientId.toString() }, // Propriétaire
              {
                TeamCompagne: {
                  some: {
                    teamMember: {
                      membreId: clientId.toString(), // Membre d'équipe
                    },
                  },
                },
              },
            ],
          },
        },
      });

      if (!soumission) {
        res
          .status(404)
          .json({ message: "Submission not found or access denied" });
        return;
      }

      // Toggle favorite status
      const updatedSoumission = await prisma.soumission.update({
        where: { id: soumissionId },
        data: { favorite: !soumission.favorite },
      });

      res.status(200).json({
        message: updatedSoumission.favorite 
          ? "Submission marked as favorite" 
          : "Submission removed from favorites",
        data: {
          id: updatedSoumission.id,
          favorite: updatedSoumission.favorite,
        },
      });
    } catch (error) {
      console.error("Error toggling submission favorite status:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async createNote(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const soumissionId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const soumission = await prisma.soumission.findFirst({
        where: {
          id: soumissionId,
          compagne: {
            OR: [
              { clientId: clientId.toString() }, // Propriétaire
              {
                TeamCompagne: {
                  some: {
                    teamMember: {
                      membreId: clientId.toString(), // Membre d'équipe
                    },
                  },
                },
              },
            ],
          },
        },
      });

      if (!soumission) {
        res.status(404).json({ message: "Submission not found or access denied" });
        return;
      }
      const parsedData:createNote =  SoumissionValidation.createNotesSchema.parse(req.body);

      if (!parsedData) {
        res.status(400).json({ message: "Notes content is required" });
        return;
      }

      // Créer la note
      const newNote = await prisma.notes.create({
        data: {
          notes :parsedData.toString(),
          compagneId: soumission.compagneId,
          clientId: clientId.toString(),
          soumissionId,
        },
      });

      res.status(201).json({
        message: "Note created successfully",
        data: newNote,
      });
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async getNotes(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const soumissionId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Vérifier si la soumission existe et si l'utilisateur a accès
      const soumission = await prisma.soumission.findFirst({
        where: {
          id: soumissionId,
          compagne: {
            OR: [
              { clientId: clientId.toString() }, // Propriétaire
              {
                TeamCompagne: {
                  some: {
                    teamMember: {
                      membreId: clientId.toString(), // Membre d'équipe
                    },
                  },
                },
              },
            ],
          },
        },
      });

      if (!soumission) {
        res.status(404).json({ message: "Submission not found or access denied" });
        return;
      }

      // Récupérer les notes pour cette soumission
      const notes = await prisma.notes.findMany({
        where: {
          soumissionId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      res.status(200).json({
        data: notes,
      });
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async updateNote(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const noteId = req.params.noteId;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Vérifier si la note existe et si l'utilisateur a accès
      const note = await prisma.notes.findFirst({
        where: {
          id: noteId,
          clientId: clientId.toString(),
        },
      });

      if (!note) {
        res.status(404).json({ message: "Note not found or access denied" });
        return;
      }
      const parsedData:createNote =  SoumissionValidation.createNotesSchema.parse(req.body);
      if (!parsedData) {
        res.status(400).json({ message: "Notes content is required" });
        return;
      }
      const updatedNote = await prisma.notes.update({
        where: { id: noteId },
        data: {
          notes:parsedData.toString(),
        }
      });

      res.status(200).json({
        message: "Note updated successfully",
        data: updatedNote,
      });
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async deleteNote(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const noteId = req.params.noteId;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const note = await prisma.notes.findFirst({
        where: {
          id: noteId,
          clientId: clientId.toString(),
        },
      });

      if (!note) {
        res.status(404).json({ message: "Note not found or access denied" });
        return;
      }

      await prisma.notes.update({
        where: { id: noteId },
        data: { deletedAt: new Date() },
      });

      res.status(200).json({
        message: "Note deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }



//   static async exportSoumissionsToCSV(
//     req: Request,
//     res: Response
//   ): Promise<void> {
//     try {
//       const compagneId = req.params.id;
//       const clientId = req.client?.id;

//       if (!clientId) {
//         res.status(401).json({ message: "Unauthorized" });
//         return;
//       }

//       // Vérifier si la campagne existe et si l'utilisateur a accès
//       const compagne = await prisma.compagne.findFirst({
//         where: {
//           id: compagneId,
//           OR: [
//             { clientId: clientId.toString() }, // Propriétaire
//             {
//               TeamCompagne: {
//                 some: {
//                   teamMember: {
//                     membreId: clientId.toString(), // Membre d'équipe
//                   },
//                 },
//               },
//             },
//           ],
//         },
//       });

//       if (!compagne) {
//         res
//           .status(404)
//           .json({ message: "Campagne not found or access denied" });
//         return;
//       }

//       // Get form structure to know all possible fields
//       const form = await prisma.form.findFirst({
//         where: { compagneId },
//         include: {
//           FormField: {
//             orderBy: { ordre: "asc" },
//             select: {
//               id: true,
//               label: true,
//               fields: {
//                 select: {
//                   type: true,
//                 },
//               },
//             },
//           },
//         },
//       });

//       if (!form) {
//         res.status(404).json({ message: "Form not found" });
//         return;
//       }

//       // Get all submissions with answers
//       const soumissions = await prisma.soumission.findMany({
//         where: { compagneId },
//         include: {
//           answer: {
//             include: {
//               formField: true,
//             },
//           },
//         },
//         orderBy: { createdAt: "desc" },
//       });

//       // Prepare CSV header (all form fields + submission date)
//       const headers = [
//         "Submission ID",
//         "Submission Date",
//         ...form.FormField.map((field) => field.label),
//       ];

//       // Prepare CSV rows
//       const rows = soumissions.map((soumission) => {
//         const row: Record<string, string> = {
//           "Submission ID": soumission.id,
//           "Submission Date": soumission.createdAt.toISOString(),
//         };

//         // Initialize all fields with empty values
//         form.FormField.forEach((field) => {
//           row[field.label] = "";
//         });

//         // Fill in the answers
//         soumission.answer.forEach((answer) => {
//           const fieldLabel = answer.formField.label;
//           row[fieldLabel] = answer.valeu;
//         });

//         return Object.values(row);
//       });

//       // Generate CSV content
//       let csvContent = headers.join(",") + "\n";
//       rows.forEach((row) => {
//         // Properly escape and quote CSV values
//         const escapedRow = row.map((value) => {
//           // If value contains commas, quotes, or newlines, wrap in quotes and escape any quotes
//           if (
//             value &&
//             (value.includes(",") || value.includes('"') || value.includes("\n"))
//           ) {
//             return `"${value.replace(/"/g, '""')}"`;
//           }
//           return value;
//         });
//         csvContent += escapedRow.join(",") + "\n";
//       });

//       // Set response headers for CSV download
//       res.setHeader("Content-Type", "text/csv");
//       res.setHeader(
//         "Content-Disposition",
//         `attachment; filename=campagne_${compagneId}_submissions.csv`
//       );

//       // Send CSV content
//       res.status(200).send(csvContent);
//     } catch (error) {
//       console.error("Error exporting submissions to CSV:", error);
//       res.status(500).json({ message: "Internal Server Error" });
//     }
//   }
}
