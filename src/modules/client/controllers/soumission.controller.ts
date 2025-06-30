import { Request, Response } from "express";
import prisma from "../../../utils/client";
import SoumissionValidation from "../utils/validation/soumission";
import { validationResult } from "../../../utils/validation/validationResult";
import { z } from "zod";
import nodemailer from "nodemailer";
import { Parser as Json2csvParser } from "json2csv";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

type createNote = z.infer<typeof SoumissionValidation.createNotesSchema>;
type sendEmail = z.infer<typeof SoumissionValidation.sendEmailSchema>;
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
        res
          .status(404)
          .json({ message: "Campagne not found or access denied" });
        return;
      }

      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const {
        search,
        field,
        favorite,
        fieldOption,
        selectedValue,
        startDate,
        endDate,
      } = req.query;
      const where: any = { AND: [{ compagneId }] };

      // Filtre favori
      if (favorite !== undefined) {
        where.AND.push({ favorite: favorite === "true" });
      }

      // Filtre date
      if (startDate && endDate) {
        where.AND.push({
          createdAt: {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string),
          },
        });
      }

      // Filtre recherche texte
      if (search) {
        const searchTerms = Array.isArray(search)
          ? (search as string[])
          : [search as string];

        if (field) {
          // Recherche dans un champ spécifique
          const answerConditions = searchTerms.map((term) => ({
            valeu: { contains: term, mode: "insensitive" },
          }));

          where.AND.push({
            answer: {
              some: {
                formField: { name: field as string },
                AND: answerConditions,
              },
            },
          });
        } else {
          const globalSearchConditions = searchTerms.map((term) => ({
            answer: {
              some: {
                valeu: { contains: term, mode: "insensitive" },
              },
            },
          }));
          where.AND.push(...globalSearchConditions);
        }
      }
      if (fieldOption && selectedValue) {
        const formField = await prisma.formField.findFirst({
          where: {
            name: fieldOption as string,
            form: {
              compagneId: compagneId,
            },
          },
          include: {
            fields: { select: { type: true } },
          },
        });

        const isCheckbox = formField?.fields.type === "checkbox";
        const values = Array.isArray(selectedValue)
          ? (selectedValue as string[])
          : [selectedValue as string];

        if (isCheckbox) {
          const checkboxConditions = values.map((val) => ({
            valeu: { contains: val, mode: "insensitive" },
          }));

          where.AND.push({
            answer: {
              some: {
                formField: { name: fieldOption as string },
                AND: checkboxConditions,
              },
            },
          });
        } else {
          where.AND.push({
            answer: {
              some: {
                formField: { name: fieldOption as string },
                valeu: { in: values },
              },
            },
          });
        }
      }

      // Get total count pour la pagination
      const totalCount = await prisma.soumission.count({ where });

      const soumissions = await prisma.soumission.findMany({
        where,
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

      const form = await prisma.form.findFirst({
        where: { compagneId },
        include: {
          FormField: {
            select: {
              id: true,
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
      });

      if (!form || !form.FormField || form.FormField.length === 0) {
        res
          .status(404)
          .json({ message: "Aucun champ trouvé pour cette campagne" });
        return;
      }
      const headers = form.FormField.map((f: any) => ({
        id: f.id,
        label: f.label,
        name: f.name,
        type: f.fields.type,
      }));

      const rows = soumissions.map((soumission) => {
        const answersByFieldId: Record<string, any> = {};
        soumission.answer.forEach((answer) => {
          answersByFieldId[answer.formFieldId] = answer.valeu;
        });
        const answers = headers.map((h) => answersByFieldId[h.id] || "");
        return {
          id: soumission.id,
          answers,
          favorite: soumission.favorite,
        };
      });

      // 3. Pagination
      const totalPages = Math.ceil(totalCount / limit);

      res.status(200).json({
        data: {
          headers,
          rows,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: totalCount,
            itemsPerPage: limit,
          },
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

  static async updateSoumissionAnswers(
    req: Request,
    res: Response
  ): Promise<void> {
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
        res
          .status(404)
          .json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }

      if (!Array.isArray(answers) || answers.length === 0) {
        res.status(400).json({ message: "Aucune réponse à mettre à jour" });
        return;
      }

      // Vérifier que toutes les réponses appartiennent à cette soumission
      const answerIds = answers.map((a) => a.id);
      const existingAnswers = await prisma.answer.findMany({
        where: {
          id: { in: answerIds },
          soumissionId,
        },
      });
      if (existingAnswers.length !== answers.length) {
        res
          .status(400)
          .json({ message: "Une ou plusieurs réponses sont invalides" });
        return;
      }

      // Mettre à jour toutes les réponses dans une transaction
      await prisma.$transaction(
        answers.map((a) =>
          prisma.answer.update({
            where: { id: a.id },
            data: { valeu: a.value },
          })
        )
      );

      const client = await prisma.client.findFirst({
        where: {
          id: clientId.toString(),
        },
      });

      await prisma.history.create({
        data: {
          soumissionId,
          content: "a modifié les données de la soumission",
          from: `${client?.firstName} ${client?.lastName}`,
          to: soumission.id,
          type: "UPDATE",
        },
      });

      res.status(200).json({
        message: "Réponses mises à jour avec succès",
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
        res
          .status(404)
          .json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }

      await prisma.soumission.update({
        where: { id: soumissionId },
        data: {
          deletedAt: new Date(),
        },
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

  static async createNote(req: Request, res: Response): Promise<void> {
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
        res
          .status(404)
          .json({ message: "Submission not found or access denied" });
        return;
      }
      const parsedData: createNote =
        SoumissionValidation.createNotesSchema.parse(req.body);

      if (!parsedData) {
        res.status(400).json({ message: "Notes content is required" });
        return;
      }

      // Créer la note
      const newNote = await prisma.notes.create({
        data: {
          notes: parsedData.note.toString(),
          compagneId: soumission.compagneId,
          clientId: clientId.toString(),
          soumissionId,
        },
      });
      if (!newNote) {
        res.status(400).json({ message: "Note not created" });
        return;
      }

      const client = await prisma.client.findFirst({
        where: {
          id: clientId.toString(),
        },
      });
      await prisma.history.create({
        data: {
          soumissionId,
          content: "a ajouté la note ",
          from: `${client?.firstName} ${client?.lastName}`,
          to: soumission.id,
          type: "NOTE",
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

  static async getNotes(req: Request, res: Response): Promise<void> {
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

      // Récupérer les notes pour cette soumission
      const notes = await prisma.notes.findMany({
        where: {
          soumissionId,
          deletedAt: null,
        },
        select: {
          id: true,
          notes: true,
          createdAt: true,
          client: {
            select: {
              firstName: true,
              lastName: true,
              profilImage: true,
            },
          },
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

  static async updateNote(req: Request, res: Response): Promise<void> {
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
      const parsedData: createNote =
        SoumissionValidation.createNotesSchema.parse(req.body);
      if (!parsedData) {
        res.status(400).json({ message: "Notes content is required" });
        return;
      }
      const updatedNote = await prisma.notes.update({
        where: { id: noteId },
        data: {
          notes: parsedData.note.toString(),
        },
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

  static async deleteNote(req: Request, res: Response): Promise<void> {
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

  static async sendEmail(req: Request, res: Response): Promise<void> {
    try {
      const soumissionId = req.params.id;
      const clientId = req.client?.id;

      // Validation Zod
      validationResult(SoumissionValidation.sendEmailSchema, req, res);
      const parsedData: sendEmail = SoumissionValidation.sendEmailSchema.parse(
        req.body
      );

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Vérifier que la soumission existe et que le client a accès
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
        res
          .status(404)
          .json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }

      // Stocker l'email
      const newEmail = await prisma.email.create({
        data: {
          email: parsedData.email,
          message: parsedData.message,
          compagneId: soumission.compagneId,
          clientId: clientId.toString(),
          soumissionId,
        },
      });

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });
      const emailSend = await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: parsedData.email,
        subject: "Message concernant votre soumission",
        text: parsedData.message,
      });

      if (!emailSend) {
        res.status(400).json({ message: "Note not created" });
        return;
      }

      const client = await prisma.client.findFirst({
        where: {
          id: clientId.toString(),
        },
      });

      await prisma.history.create({
        data: {
          soumissionId,
          content: " a envoyé un email à ",
          from: `${client?.firstName} ${client?.lastName}`,
          to: parsedData.email,
          type: "EMAIL",
        },
      });

      res.status(201).json({
        message: "Email envoyé et enregistré avec succès",
        data: newEmail,
      });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  static async getEmails(req: Request, res: Response): Promise<void> {
    try {
      const soumissionId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Vérifier l'accès à la soumission
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
        res
          .status(404)
          .json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }

      const emails = await prisma.email.findMany({
        where: { soumissionId, deletedAt: null },
        select: {
          id: true,
          email: true,
          message: true,
          client: {
            select: {
              firstName: true,
              lastName: true,
              profilImage: true,
            },
          },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({ data: emails });
    } catch (error) {
      console.error("Error fetching emails:", error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  static async deleteEmail(req: Request, res: Response): Promise<void> {
    try {
      const emailId = req.params.emailId;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const email = await prisma.email.findFirst({
        where: {
          id: emailId,
          clientId: clientId.toString(),
          deletedAt: null,
        },
      });
      if (!email) {
        res.status(404).json({ message: "Email non trouvé ou accès refusé" });
        return;
      }

      await prisma.email.update({
        where: { id: emailId },
        data: { deletedAt: new Date() },
      });

      res.status(200).json({ message: "Email supprimé avec succès" });
    } catch (error) {
      console.error("Error deleting email:", error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  // Ajouter un rendez-vous
  static async createAppointment(req: Request, res: Response): Promise<void> {
    try {
      const { date, adress, representantId, commentaire } = req.body;
      const soumissionId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      // Vérifier l'accès à la soumission
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
        res
          .status(404)
          .json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }

      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          compagneId: soumission.compagneId,
          date: new Date(date),
          deletedAt: null,
        },
      });

      if (existingAppointment) {
        res.status(400).json({
          message: "Cette date est déjà réservée pour cette campagne.",
        });
        return;
      }

      const appointment = await prisma.appointment.create({
        data: {
          date: new Date(date),
          compagneId: soumission.compagneId,
          adress: adress,
          commentaire,
          soumissionId,
          clientId: representantId.toString(),
        },
      });
      if (!appointment) {
        res.status(400).json({ message: "appointment not created" });
        return;
      }

      const client = await prisma.client.findFirst({
        where: {
          id: clientId.toString(),
        },
      });

      await prisma.history.create({
        data: {
          soumissionId,
          content: "a ajouté le rendez-vous",
          from: `${client?.firstName} ${client?.lastName}`,
          to: appointment.id,
          type: "APPOINTMENT",
        },
      });

      res
        .status(201)
        .json({ message: "Rendez-vous ajouté", data: appointment });
    } catch (error) {
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  // Modifier un rendez-vous
  static async updateAppointment(req: Request, res: Response): Promise<void> {
    try {
      const appointmentId = req.params.appointmentId;
      const { date, adress, representantId, commentaire } = req.body;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      const appointment = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
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
      if (!appointment) {
        res
          .status(404)
          .json({ message: "appointment non trouvée ou accès refusé" });
        return;
      }

      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          compagneId: appointment.compagneId,
          date: new Date(date),
          deletedAt: null,
        },
      });

      if (existingAppointment) {
        res.status(400).json({
          message: "Cette date est déjà réservée pour cette campagne.",
        });
        return;
      }

      const updateappointment = await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          date: new Date(date),
          adress: adress,
          clientId: representantId,
          commentaire,
        },
      });

      res
        .status(200)
        .json({ message: "Rendez-vous modifié", data: updateappointment });
    } catch (error) {
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  static async getAppointments(req: Request, res: Response): Promise<void> {
    try {
      const soumissionId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
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
        res
          .status(404)
          .json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }

      const appointments = await prisma.appointment.findMany({
        where: { soumissionId, deletedAt: null },
        select: {
          id: true,
          date: true,
          adress: true,
          commentaire: true,
          createdAt: true,
          client: {
            select: {
              firstName: true,
              lastName: true,
              profilImage: true,
            },
          },
        },
        orderBy: { date: "desc" },
      });

      res.status(200).json({ data: appointments });
    } catch (error) {
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  // Supprimer un rendez-vous (soft delete)
  static async deleteAppointment(req: Request, res: Response): Promise<void> {
    try {
      const appointmentId = req.params.appointmentId;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
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
      if (!appointment) {
        res
          .status(404)
          .json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { deletedAt: new Date() },
      });

      res.status(200).json({ message: "Rendez-vous supprimé" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  static async createTask(req: Request, res: Response): Promise<void> {
    try {
      const { titleTask, description, representantId } = req.body;
      const soumissionId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      // Vérifier l'accès à la soumission
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
        res
          .status(404)
          .json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }

      const task = await prisma.task.create({
        data: {
          compagneId: soumission.compagneId,
          titleTask,
          description,
          soumissionId,
          clientId: representantId.toString(),
        },
      });

      if (!task) {
        res.status(400).json({ message: "task not created" });
        return;
      }

      const client = await prisma.client.findFirst({
        where: {
          id: clientId.toString(),
        },
      });

      await prisma.history.create({
        data: {
          soumissionId,
          content: "a réalisé la tâche ",
          from: `${client?.firstName} ${client?.lastName}`,
          to: task.id,
          type: "TASK",
        },
      });
      res.status(201).json({ message: "task ajouté", data: task });
    } catch (error) {
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  static async getTask(req: Request, res: Response): Promise<void> {
    try {
      const soumissionId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
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
        res
          .status(404)
          .json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }

      const tasks = await prisma.task.findMany({
        where: { soumissionId, deletedAt: null },
        select: {
          titleTask: true,
          description: true,
          status: true,
          client: {
            select: {
              firstName: true,
              lastName: true,
              profilImage: true,
            },
          },
        },
      });

      res.status(200).json({ data: tasks });
    } catch (error) {
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  static async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const { titleTask, description, representantId, status } = req.body;
      const soumissionId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
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
        res
          .status(404)
          .json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }

      const taskId = req.params.taskId;
      if (!taskId) {
        res.status(400).json({ message: "taskId requis" });
        return;
      }
      const task = await prisma.task.update({
        where: { id: taskId },
        data: {
          compagneId: soumission.compagneId,
          titleTask,
          description,
          status,
          soumissionId,
          clientId: representantId,
        },
      });

      if (!task) {
        res.status(404).json({
          message: "task not created",
        });
      }
      res.status(201).json({ message: "task ajouté", data: task });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur interne du serveur", error });
    }
  }

  static async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const taskId = req.params.taskId;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }
      const task = await prisma.task.findFirst({
        where: {
          id: taskId,
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
      if (!task) {
        res.status(404).json({ message: "Task non trouvée ou accès refusé" });
        return;
      }

      await prisma.task.update({
        where: { id: taskId },
        data: { deletedAt: new Date() },
      });

      res.status(200).json({ message: "Task supprimé" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  static async getCompagneHistory(req: Request, res: Response): Promise<void> {
    try {
      const compagneId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

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
        res
          .status(404)
          .json({ message: "Campagne non trouvée ou accès refusé" });
        return;
      }

      // Récupérer toutes les soumissions de la campagne
      const soumissions = await prisma.soumission.findMany({
        where: { compagneId },
        select: { id: true },
      });
      const soumissionIds = soumissions.map((s) => s.id);

      // Récupérer l'historique de toutes les soumissions
      const history = await prisma.history.findMany({
        where: { soumissionId: { in: soumissionIds } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          content: true,
          from: true,
          to: true,
          type: true,
          createdAt:true
        },
      });

      res.status(200).json({ data: history });
    } catch (error) {
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }
  static async getExportSoummision(req: Request, res: Response): Promise<void> {
    try {
      const { filters } = req.body; // Récupère les filtres depuis la requête
      const compagneId = req.params.id;
      const clientId = req.client?.id;
      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      // Construction dynamique des filtres
      const where: any = { compagneId };

      // Exemple de gestion de filtres (à adapter selon tes besoins)
      if (req.query.status) {
        where.status = req.query.status;
      }
      if (req.query.startDate && req.query.endDate) {
        where.createdAt = {
          gte: new Date(req.query.startDate as string),
          lte: new Date(req.query.endDate as string),
        };
      }
      if (req.query.favorite) {
        where.favorite = req.query.favorite === "true";
      }
      // Ajoute ici d'autres filtres selon ton interface

      // Recherche texte sur un champ précis (exemple)
      if (req.query.search && req.query.field) {
        const searchTerms = Array.isArray(req.query.search)
          ? (req.query.search as string[])
          : [req.query.search as string];
        const answerConditions = searchTerms.map((term) => ({
          valeu: { contains: term, mode: "insensitive" },
        }));

        where.answer = {
          some: {
            formField: { name: req.query.field },
            AND: answerConditions,
          },
        };
      }

      // Recherche texte globale (sans champ spécifique) ajout 01
      if (filters?.favorite !== undefined) {
        where.AND.push({ favorite: filters.favorite === true });
      }
      if (filters?.startDate && filters?.endDate) {
        where.AND.push({
          createdAt: {
            gte: new Date(filters.startDate),
            lte: new Date(filters.endDate),
          },
        });
      }
      if (filters?.search) {
        const searchTerms = Array.isArray(filters.search)
          ? filters.search
          : [filters.search];
        if (filters.field) {
          const answerConditions = searchTerms.map((term: string) => ({
            valeu: { contains: term, mode: "insensitive" },
          }));
          where.AND.push({
            answer: {
              some: {
                formField: { name: filters.field },
                AND: answerConditions,
              },
            },
          });
        } else {
          const globalSearchConditions = searchTerms.map((term: string) => ({
            answer: {
              some: {
                valeu: { contains: term, mode: "insensitive" },
              },
            },
          }));
          where.AND.push(...globalSearchConditions);
        }
      }
      if (filters?.fieldOption && filters?.selectedValue) {
        const formField = await prisma.formField.findFirst({
          where: {
            name: filters.fieldOption,
            form: { compagneId },
          },
          include: { fields: { select: { type: true } } },
        });
        const isCheckbox = formField?.fields.type === "checkbox";
        const values = Array.isArray(filters.selectedValue)
          ? filters.selectedValue
          : [filters.selectedValue];
        if (isCheckbox) {
          const checkboxConditions = values.map((val: string) => ({
            valeu: { contains: val, mode: "insensitive" },
          }));
          where.AND.push({
            answer: {
              some: {
                formField: { name: filters.fieldOption },
                AND: checkboxConditions,
              },
            },
          });
        } else {
          where.AND.push({
            answer: {
              some: {
                formField: { name: filters.fieldOption },
                valeu: { in: values },
              },
            },
          });
        }
      }

      const soumissions = await prisma.soumission.findMany({
        where,
        include: {
          answer: {
            include: {
              formField: {
                select: {
                  label: true,
                  name: true,
                  fields: { select: { type: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json(soumissions);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async exportSoumissions(req: Request, res: Response): Promise<void> {
    try {
      const compagneId = req.params.id;
      const clientId = req.client?.id;
      const { filters, fields, format } = req.body; // Les filtres, champs et format envoyés par le frontend

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      // Reprise de la logique de getCompagneSoumissions
      const where: any = { AND: [{ compagneId }] };
      if (filters?.startDate && filters?.endDate) {
        where.AND.push({
          createdAt: {
            gte: new Date(filters.startDate),
            lte: new Date(filters.endDate),
          },
        });
      }
      // Récupère les soumissions filtrées
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

      // Génère les données à exporter
      const exportData = soumissions.map((soumission) => {
        const answers = soumission.answer.map((a) => ({
          formFieldName: a.formField.label || a.formField.name,
          valeu: a.valeu,
        }));
        return {
          soumissionId: soumission.id,
          dateSoumission: soumission.createdAt.toISOString(),
          answers,
        };
      });

      // Détermine le nom et le chemin du fichier
      const exportDir = path.join(
        __dirname,
        "../../../uploads/exports",
        compagneId
      );
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      const fileName = `export_soumissions_${Date.now()}.${
        format === "xlsx" || format === "excel" ? "xlsx" : format
      }`;
      const filePath = path.join(exportDir, fileName);

      if (format === "csv") {
        // Pour le CSV, answers est stringifié
        const flatExportData = exportData.map((row) => ({
          ...row,
          answers: JSON.stringify(row.answers),
        }));
        const parser = new Json2csvParser({
          fields: ["soumissionId", "dateSoumission", "answers"],
        });
        const csv = parser.parse(flatExportData);
        fs.writeFileSync(filePath, csv, "utf8");
      } else if (format === "json") {
        fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), "utf8");
      } else if (format === "xlsx" || format === "excel") {
        // On aplatit les réponses pour chaque soumission (une colonne par champ)
        const allFieldNames = Array.from(
          new Set(
            soumissions.flatMap((s) =>
              s.answer
                .map((a) => a.formField.label || a.formField.name)
                .filter((name) => !!name)
            )
          )
        );

        const excelData = soumissions.map((soumission) => {
          const row: Record<string, any> = {
            soumissionId: soumission.id,
            dateSoumission: soumission.createdAt.toISOString(),
          };
          allFieldNames.forEach((fieldName) => {
            if (!fieldName) return; // Ignore les noms nuls
            const answer = soumission.answer.find(
              (a) => (a.formField.label || a.formField.name) === fieldName
            );
            row[fieldName] = answer ? answer.valeu : "";
          });
          return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Soumissions");
        XLSX.writeFile(workbook, filePath);
      } else {
        res.status(400).json({ message: "Format d'export non supporté" });
        return;
      }

      // Retourne le chemin du fichier pour téléchargement
      res.status(200).json({
        message: "Export réussi",
        file: `/uploads/exports/${compagneId}/${fileName}`,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur lors de l'export", error });
    }
  }
}
