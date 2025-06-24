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
        include: {
          formField: {
            where: { disable: false },
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
              UniqueEmailForms: true,
            },
          },
        },
      });
      if (!form) {
        res.status(404).json({ message: "Form not found" });
        return;
      }

      // Check for UniqueEmailForms if email field exists
      const formFields = Array.isArray(form.formField) ? form.formField : [form.formField].filter(Boolean);

      const emailField = formFields.find(
        (ff) =>
          ff.fields.type === "email" &&
          ff.UniqueEmailForms &&
          ff.UniqueEmailForms.length > 0
      );

      if (emailField) {
        const answers = req.body.answers || [];
        const emailAnswer = answers.find((a: any) => a.formFieldId === emailField.id);
        if (emailAnswer && emailAnswer.value) {
          const existing = await prisma.answer.findFirst({
            where: {
              formFieldId: emailField.id,
              valeu: emailAnswer.value,
              soumission: {
                compagneId: form.compagneId,
              },
            },
          });
          if (existing) {
            res.status(400).json({ message: "Email already used for this form" });
            return;
          }
        }
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
          ? form.formField.find((ff) => ff.id === answer.formFieldId)
          : form.formField && form.formField.id === answer.formFieldId
            ? form.formField
            : undefined;

        // Handle file upload
        if (formField?.fields.type === "file" && answer.file) {
          const uploadDir = path.join(__dirname, "../../../../uploads", soumission.id);
          await fs.mkdir(uploadDir, { recursive: true });
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
            formFieldId: answer.formFieldId,
            soumissionId: soumission.id,
          },
        });

        results.push({ formFieldId: answer.formFieldId, value: valueToSave });
      }

      res.status(200).json({ form, answers: results });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
}