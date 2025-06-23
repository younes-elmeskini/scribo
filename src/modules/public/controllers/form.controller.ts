import { Request, Response } from "express";
import prisma from "../../../utils/client";
import path from "path";
import fs from "fs/promises"; 

export default class FormController {
  static async getForm(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.id;
      const form = await prisma.form.findUnique({
        where: { id: formId },
      });
      if (!form) {
        res.status(404).json({ message: "Form not found" });
        return;
      }
      res.status(200).json({ form });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async submitForm(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.id;
      const form = await prisma.form.findUnique({
        where: { id: formId },
        include: {
          formField: {
            include: {
              fields: true,
            },
          },
        },
      });
      if (!form) {
        res.status(404).json({ message: "Form not found" });
        return;
      }
      const soumission = await prisma.soumission.create({
        data: {
          compagneId: form.compagneId,
        },
      });
      if (!soumission) {
        res.status(400).json({ message: "Soumission not created" });
        return;
      }
      const answers = req.body.answers;
      const results: Array<{ formFieldId: string; value: any }> = [];

      for (const answer of answers) {
        let valueToSave: any = answer.value;
        const formField = Array.isArray(form.formField)
          ? form.formField.find((ff) => ff.id === answer.fieldId)
          : form.formField && form.formField.id === answer.fieldId
            ? form.formField
            : undefined;

        // Handle file upload
        if (formField?.fields.type === "file" && answer.file) {
          // Create upload directory for this soumission if it doesn't exist
          const uploadDir = path.join(__dirname, "../../../../uploads", soumission.id);
          await fs.mkdir(uploadDir, { recursive: true });

          // Decode base64 or handle file buffer (assuming answer.file is base64 string)
          const fileBuffer = Buffer.from(answer.file, "base64");
          const fileName = `${Date.now()}_${answer.fileName || "upload"}`;
          const filePath = path.join(uploadDir, fileName);

          await fs.writeFile(filePath, fileBuffer);
          valueToSave = `/uploads/${soumission.id}/${fileName}`;
        }

        // Handle map coordinates
        if (formField?.fields.type === "map" && answer.coordinates) {
          valueToSave = JSON.stringify(answer.coordinates);
        }

        // Handle select option
        if (formField?.fields.type === "select" && answer.selectedOption) {
          valueToSave = answer.selectedOption;
        }

        await prisma.answer.create({
          data: {
            valeu: valueToSave,
            formFieldId: answer.fieldId,
            soumissionId: soumission.id,
          },
        });

        results.push({ formFieldId: answer.fieldId, value: valueToSave });
      }

      res.status(200).json({ form, answers: results });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
}