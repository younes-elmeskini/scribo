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
import { google } from "googleapis";

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
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      // Vérifier si la campagne existe et si l'utilisateur a accès
      const compagne = await prisma.compagne.findFirst({
        where: {
          deletedAt: null,
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
            disable: false,
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
        where: {
          ...where,
          deletedAt: null
        },
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
            where: {
              disable: false,
            },
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
            orderBy: {
              ordre: "asc",
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
      res.status(500).json({ message: "Erreur interne du serveur" });
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
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      // Vérifier si la soumission existe et si l'utilisateur a accès
      const soumission = await prisma.soumission.findFirst({
        where: {
          deletedAt: null,
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
          Email: true,
          Notes: true,
          Task: {
            select: {
              id: true,
              titleTask: true,
              createdAt: true,
              description: true,
              status: true,
              client: {
                select: {
                  id:true,
                  firstName: true,
                  lastName: true,
                  profilImage: true,
                },
              },
            },
          },
          appointment: {
            select: {
              id: true,
              adress: true,
              date: true,
              client: {
                select: {
                  id:true,
                  firstName: true,
                  lastName: true,
                  profilImage: true,
                },
              },
            },
          },
        },
      });

      if (!soumission) {
        res
          .status(404)
          .json({ message: "Soumission non trouvée ou accès refusé" });
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
      res.status(500).json({ message: "Erreur interne du serveur" });
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
        res.status(401).json({ message: "Non autorisé" });
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
          .json({ message: "Soumission non trouvée ou accès refusé" });
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
        res.status(401).json({ message: "Non autorisé" });
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
          .json({ message: "Soumission non trouvée ou accès refusé" });
        return;
      }
      const parsedData: createNote =
        SoumissionValidation.createNotesSchema.parse(req.body);

      if (!parsedData) {
        res.status(400).json({ message: "Le contenu de la note est requis" });
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
        res.status(400).json({ message: "Note non créée" });
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
        message: "Note créée avec succès",
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
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      // Vérifier si la soumission existe et si l'utilisateur a accès
      const soumission = await prisma.soumission.findFirst({
        where: {
          deletedAt: null,
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
          .json({ message: "Soumission non trouvée ou accès refusé" });
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
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  static async updateNote(req: Request, res: Response): Promise<void> {
    try {
      const noteId = req.params.noteId;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
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
        res.status(404).json({ message: "Note non trouvée ou accès refusé" });
        return;
      }
      const parsedData: createNote =
        SoumissionValidation.createNotesSchema.parse(req.body);
      if (!parsedData) {
        res.status(400).json({ message: "Le contenu de la note est requis" });
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
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      const note = await prisma.notes.findFirst({
        where: {
          id: noteId,
          clientId: clientId.toString(),
        },
      });

      if (!note) {
        res.status(404).json({ message: "Note non trouvée ou accès refusé" });
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
        res.status(401).json({ message: "Non autorisé" });
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
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      // Vérifier l'accès à la soumission
      const soumission = await prisma.soumission.findFirst({
        where: {
          deletedAt: null,
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
        res.status(401).json({ message: "Non autorisé" });
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
      });
      if (!appointment) {
        res.status(400).json({ message: "Rendez-vous non créé" });
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
      console.error(error);
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
          deletedAt: null,
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
          deletedAt: null,
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
        select: {
          id: true,
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

      if (!task) {
        res.status(400).json({ message: "Tâche non créée" });
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
      res.status(201).json({ message: "Tâche ajoutée", data: task });
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
          deletedAt: null,
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
        res.status(400).json({ message: "L'identifiant de la tâche est requis" });
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
        res.status(404).json({ message: "Tâche non trouvée ou accès refusé" });
        return;
      }

      await prisma.task.update({
        where: { id: taskId },
        data: { deletedAt: new Date() },
      });

      res.status(200).json({ message: "Tâche supprimée" });
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
          createdAt: true,
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

      const where: any = { AND: [{ compagneId }] };

      if (filters) {
        if (filters.startDate && filters.endDate) {
          where.AND.push({
            createdAt: {
              gte: new Date(filters.startDate),
              lte: new Date(filters.endDate),
            },
          });
        }
        if (
          filters.selectedIds &&
          Array.isArray(filters.selectedIds) &&
          filters.selectedIds.length > 0
        ) {
          where.AND.push({ id: { in: filters.selectedIds } });
        }
        if (filters.favorite !== undefined) {
          where.AND.push({ favorite: filters.favorite === true });
        }
        if (filters.search) {
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
                some: { valeu: { contains: term, mode: "insensitive" } },
              },
            }));
            where.AND.push(...globalSearchConditions);
          }
        }
        if (filters.fieldOptions && Array.isArray(filters.fieldOptions)) {
          for (const optionFilter of filters.fieldOptions) {
            const { field: fieldName, value: selectedValue } = optionFilter;

            if (fieldName && selectedValue) {
              const formField = await prisma.formField.findFirst({
                where: { name: fieldName, form: { compagneId } },
                include: { fields: { select: { type: true } } },
              });

              const isCheckbox = formField?.fields.type === "checkbox";
              const values = Array.isArray(selectedValue)
                ? selectedValue
                : [selectedValue];

              if (isCheckbox) {
                const checkboxConditions = values.map((val: string) => ({
                  valeu: { contains: val, mode: "insensitive" },
                }));
                where.AND.push({
                  answer: {
                    some: {
                      formField: { name: fieldName },
                      AND: checkboxConditions,
                    },
                  },
                });
              } else {
                where.AND.push({
                  answer: {
                    some: {
                      formField: { name: fieldName },
                      valeu: { in: values },
                    },
                  },
                });
              }
            }
          }
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
      const { selectedIds, filters, fields, format, sinceLastExport } =
        req.body; // Les filtres, champs et format envoyés par le frontend

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      // Reprise de la logique de getCompagneSoumissions
      const where: any = { AND: [{ compagneId }] };

      // Ajout du filtre depuis le dernier export (par id)
      let lastSoumissionId: string | null = null;
      if (sinceLastExport) {
        const lastExport = await prisma.exportHistory.findFirst({
          where: { compagneId },
          orderBy: { createdAt: "desc" },
          select: { lastSoumissionId: true },
        });
        if (lastExport && lastExport.lastSoumissionId) {
          lastSoumissionId = lastExport.lastSoumissionId;
          where.AND.push({ id: { gt: lastSoumissionId } });
        }
      }

      if (selectedIds && Array.isArray(selectedIds) && selectedIds.length > 0) {
        where.AND.push({ id: { in: selectedIds } });
      }
      if (filters) {
        if (filters.startDate && filters.endDate) {
          where.AND.push({
            createdAt: {
              gte: new Date(filters.startDate),
              lte: new Date(filters.endDate),
            },
          });
        }
        if (filters.favorite !== undefined) {
          where.AND.push({ favorite: filters.favorite === true });
        }
        if (filters.search) {
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
                some: { valeu: { contains: term, mode: "insensitive" } },
              },
            }));
            where.AND.push(...globalSearchConditions);
          }
        }
        if (filters.fieldOptions && Array.isArray(filters.fieldOptions)) {
          for (const optionFilter of filters.fieldOptions) {
            const { field: fieldName, value: selectedValue } = optionFilter;

            if (fieldName && selectedValue) {
              const formField = await prisma.formField.findFirst({
                where: { name: fieldName, form: { compagneId } },
                include: { fields: { select: { type: true } } },
              });

              const isCheckbox = formField?.fields.type === "checkbox";
              const values = Array.isArray(selectedValue)
                ? selectedValue
                : [selectedValue];

              if (isCheckbox) {
                const checkboxConditions = values.map((val: string) => ({
                  valeu: { contains: val, mode: "insensitive" },
                }));
                where.AND.push({
                  answer: {
                    some: {
                      formField: { name: fieldName },
                      AND: checkboxConditions,
                    },
                  },
                });
              } else {
                where.AND.push({
                  answer: {
                    some: {
                      formField: { name: fieldName },
                      valeu: { in: values },
                    },
                  },
                });
              }
            }
          }
        }
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

      if (soumissions.length === 0) {
        res.status(404).json({
          message:
            "Aucune soumission ne correspond aux filtres sélectionnés. Aucun fichier n'a été généré.",
          file: null,
        });
        return;
      }

      // Génère les données à exporter
      const exportData = soumissions.map((soumission) => {
        let answersToFilter = soumission.answer;

        if (fields && Array.isArray(fields) && fields.length > 0) {
          answersToFilter = answersToFilter.filter((a) =>
            fields.includes(a.formFieldId)
          );
        }

        const answers = answersToFilter.map((a) => ({
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
        // Gestion du séparateur
        let delimiter = ",";
        if (req.body.delimiter) {
          if (req.body.delimiter === "tab") delimiter = "\t";
          else if (req.body.delimiter === "space") delimiter = " ";
          else if (req.body.delimiter === "virgule") delimiter = ",";
          else if (req.body.delimiter === "dotVirgule") delimiter = ";";
          else if (req.body.delimiter === "pipe") delimiter = "|";
          else delimiter = req.body.delimiter;
        }
        // Pour le CSV, answers est stringifié
        const flatExportData = exportData.map((row) => ({
          ...row,
          answers: JSON.stringify(row.answers),
        }));
        const parser = new Json2csvParser({
          fields: ["soumissionId", "dateSoumission", "answers"],
          delimiter,
        });
        const csv = parser.parse(flatExportData);
        fs.writeFileSync(filePath, csv, "utf8");
      } else if (format === "json") {
        fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), "utf8");
      } else if (format === "xlsx" || format === "excel") {
        const allFieldsFromSubmissions = soumissions.flatMap((s) =>
          s.answer.map((a) => ({
            id: a.formFieldId,
            name: a.formField.label || a.formField.name,
          }))
        );

        let fieldHeaders: { id: string; name: string }[];

        if (fields && Array.isArray(fields) && fields.length > 0) {
          const uniqueFields = [
            ...new Map(
              allFieldsFromSubmissions.map((item) => [item.id, item])
            ).values(),
          ];
          fieldHeaders = fields
            .map((id) => {
              const foundField = uniqueFields.find((f) => f.id === id);
              return { id, name: foundField ? foundField.name : id };
            })
            .filter((f): f is { id: string; name: string } => !!f.name);
        } else {
          fieldHeaders = [
            ...new Map(
              allFieldsFromSubmissions.map((item) => [item.id, item])
            ).values(),
          ].filter((f): f is { id: string; name: string } => !!f.name);
        }

        const excelData = soumissions.map((soumission) => {
          const row: Record<string, any> = {
            soumissionId: soumission.id,
            dateSoumission: soumission.createdAt.toISOString(),
          };
          fieldHeaders.forEach((header) => {
            const answer = soumission.answer.find(
              (a) => a.formFieldId === header.id
            );
            row[header.name] = answer ? answer.valeu : "";
          });
          return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Soumissions");
        XLSX.writeFile(workbook, filePath);
      } else if (format === "xml") {
        // Génération du XML
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<submissions>\n';
        exportData.forEach((row) => {
          xml += `  <submission>\n`;
          xml += `    <soumissionId>${row.soumissionId}</soumissionId>\n`;
          xml += `    <dateSoumission>${row.dateSoumission}</dateSoumission>\n`;
          xml += `    <answers>\n`;
          row.answers.forEach((ans: any) => {
            xml += `      <answer>\n`;
            xml += `        <formFieldName>${ans.formFieldName}</formFieldName>\n`;
            xml += `        <valeu>${ans.valeu}</valeu>\n`;
            xml += `      </answer>\n`;
          });
          xml += `    </answers>\n`;
          xml += `  </submission>\n`;
        });
        xml += "</submissions>\n";
        fs.writeFileSync(filePath, xml, "utf8");
      } else {
        res.status(400).json({ message: "Format d'export non supporté" });
        return;
      }

      const fileUrl = `/exports/${compagneId}/${fileName}`;

      // Lors de la création de l'export, enregistrer le dernier id de soumission exporté
      let lastExportedId: string | null = null;
      if (soumissions.length > 0) {
        // On prend l'id de la dernière soumission (la plus récente dans l'ordre du findMany)
        lastExportedId = soumissions[0].id;
      }

      await prisma.exportHistory.create({
        data: {
          compagneId: compagneId,
          file: fileUrl,
          lastSoumissionId: lastExportedId,
        },
      });

      // Retourne le chemin du fichier pour téléchargement
      res.status(200).json({
        message: "Export réussi",
        file: fileUrl,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur lors de l'export", error });
    }
  }

  static async getMembresCompagne(req: Request, res: Response): Promise<void> {
    try {
      const compagneId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }

      // Vérifier l'accès à la compagne
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

      // Récupérer les membres assignés à la compagne
      const teamCompagne = await prisma.teamCompagne.findMany({
        where: { compagneId },
        select: {
          teamMember: {
            include: {
              member: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });

      // Inclure aussi le propriétaire de la compagne
      const owner = await prisma.client.findFirst({
        where: { id: compagne.clientId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      });

      let membres = teamCompagne.map((tc) => tc.teamMember.member);
      if (owner) {
        membres = [owner, ...membres.filter((m) => m.id !== owner.id)];
      }

      res.status(200).json({ data: membres });
    } catch (error) {
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }

  // Récupérer les emails reçus via l'API Gmail officielle (OAuth2)
  static async getReceivedEmailsViaGmailAPI(req: Request, res: Response): Promise<void> {
    const clientId = req.client?.id;
    if (!clientId) {
      res.status(401).json({ message: "Non autorisé" });
      return;
    }
    // Chemins des fichiers d'authentification
    const CREDENTIALS_PATH = "client_secret.json";;
    const TOKEN_PATH = "token.json";
    try {
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
      const { client_secret, client_id, redirect_uris } = credentials.web;
      const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );
      // Charger le token d'accès
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      oAuth2Client.setCredentials(token);
      const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
      // Récupérer les 10 derniers messages reçus
      const messagesList = await gmail.users.messages.list({
        userId: "me",
        maxResults: 10,
        labelIds: ["INBOX"],
      });
      const messages = messagesList.data.messages || [];
      const emails = [];
      for (const msg of messages) {
        const msgData = await gmail.users.messages.get({ userId: "me", id: msg.id! });
        const payload = msgData.data.payload;
        const headers = payload?.headers || [];
        const getHeader = (name: string) => headers.find((h) => h.name === name)?.value || null;
        emails.push({
          from: getHeader("From"),
          to: getHeader("To"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
        });
      }
      res.status(200).json({ data: emails });
    } catch (error) {
      console.error("Erreur lors de la récupération des emails via Gmail API:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des emails via Gmail API", error });
    }
  }

  // Récupérer les emails reçus via Gmail API, filtrés par campagne et par destinataires des emails envoyés
  static async getFilteredReceivedEmailsViaGmailAPI(req: Request, res: Response): Promise<void> {
    const clientId = req.client?.id;
    const compagneId = req.params.compagneId;
    if (!clientId) {
      res.status(401).json({ message: "Non autorisé" });
      return;
    }
    if (!compagneId) {
      res.status(400).json({ message: "compagneId requis" });
      return;
    }
    // Chemins des fichiers d'authentification
    const CREDENTIALS_PATH = "client_secret.json";
    const TOKEN_PATH = "token.json";
    try {
      // 1. Récupérer les emails envoyés pour cette campagne
      const sentEmails = await prisma.email.findMany({
        where: { compagneId, deletedAt: null },
        select: { email: true },
      });
      const sentToAddresses = sentEmails.map(e => e.email.toLowerCase().trim());
      if (sentToAddresses.length === 0) {
        res.status(200).json({ data: [] });
        return;
      }
      // 2. Authentification Gmail API
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
      const { client_secret, client_id, redirect_uris } = credentials.web;
      const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      oAuth2Client.setCredentials(token);
      const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
      // 3. Récupérer les 30 derniers messages reçus (pour avoir un échantillon plus large)
      const messagesList = await gmail.users.messages.list({
        userId: "me",
        maxResults: 30,
        labelIds: ["INBOX"],
      });
      const messages = messagesList.data.messages || [];
      const emails = [];
      for (const msg of messages) {
        const msgData = await gmail.users.messages.get({ userId: "me", id: msg.id! });
        const payload = msgData.data.payload;
        const headers = payload?.headers || [];
        const getHeader = (name: string) => headers.find((h) => h.name === name)?.value || null;
        const from = getHeader("From");
        // Extraire l'adresse email de l'expéditeur (ex: "Nom <email@domaine.com>")
        const match = from ? from.match(/<(.+?)>/) : null;
        const fromEmail = match ? match[1].toLowerCase().trim() : (from ? from.toLowerCase().trim() : null);
        // On ne garde que si l'expéditeur est dans la liste des destinataires envoyés pour cette campagne
        if (fromEmail && sentToAddresses.includes(fromEmail)) {
          // Extraction du corps du message (texte brut)
          let message = "";
          if (payload?.parts && Array.isArray(payload.parts)) {
            // multipart : chercher la partie text/plain
            const part = payload.parts.find(p => p.mimeType === "text/plain");
            if (part && part.body && part.body.data) {
              message = Buffer.from(part.body.data, 'base64').toString('utf8');
              message = message.split(/\r?\nOn .+wrote:|Le .+ a écrit :/)[0].trim();
            }
          } else if (payload?.body && payload.body.data) {
            // single part
            message = Buffer.from(payload.body.data, 'base64').toString('utf8');
            message = message.split(/\r?\nOn .+wrote:|Le .+ a écrit :/)[0].trim();
          }
          emails.push({
            from,
            to: getHeader("To"),
            subject: getHeader("Subject"),
            message,
            date: getHeader("Date")
          });
        }
      }
      res.status(200).json({ data: emails });
    } catch (error) {
      console.error("Erreur lors de la récupération des emails filtrés via Gmail API:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des emails filtrés via Gmail API", error });
    }
  }
}
