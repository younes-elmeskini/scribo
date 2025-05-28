import { Request, Response } from "express";
import prisma from "../../../utils/client";
import { z } from "zod";
import FieldsValidation from "../utils/validation/fields";
import { validationResult } from "../../../utils/validation/validationResult";

type CreateField = z.infer<typeof FieldsValidation.createFieldSchema>;

export default class CompagneController {
  static async addField(req: Request, res: Response): Promise<void> {
    try {
      validationResult(FieldsValidation.createFieldSchema, req, res);
      const parsedData: CreateField = FieldsValidation.createFieldSchema.parse(
        req.body
      );
      const field = await prisma.fields.create({
        data: {
          ...parsedData,
        },
      });
      if (!field) {
        res.status(400).json({ message: "Field not created" });
        return;
      }
      res.status(201).json(field);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async getFields(req: Request, res: Response): Promise<void> {
    try {
      const fields = await prisma.fields.findMany({
        select: {
          icon: true,
          fieldName: true,
          type: true,
        },
      });
      if (fields.length === 0) {
        res.status(404).json({ message: "fields not found" });
        return;
      }
      res.status(200).json({
        data: fields,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
}
