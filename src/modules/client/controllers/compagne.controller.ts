import { Request, Response } from "express";
import prisma from "../../../utils/client";
import { z } from "zod";
import CompagneValidation from "../utils/validation/compagne";
import { validationResult } from "../../../utils/validation/validationResult";
import { Role } from "@prisma/client";

type createCompagne = z.infer<typeof CompagneValidation.createCompagneSchema>;

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

      res.status(200).json(formattedResult);
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
          favrite: true,
        },
      });

      const formattedResult = campagnes.map((campagne) => ({
        id: campagne.id,
        favrite: campagne.favrite,
      }));

      const favriteCampagnes = formattedResult.filter(
        (campagne) => campagne.favrite
      );
      const notFavriteCampagnes = formattedResult.filter(
        (campagne) => !campagne.favrite
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
}
