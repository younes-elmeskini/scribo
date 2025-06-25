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

      res.status(200).json({ form, message: "Form retrieved successfully" });
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
          FormField: {
            select: {
              id: true,
              fields: {
                select: {
                  type: true,
                },
              },
            },
          },
        },
      });

      if (!form) {
        res.status(404).json({ message: "Form not found" });
        return;
      }

      const formFieldMap = new Map(
        form.FormField.map((field) => [
          field.id,
          { type: field.fields.type },
        ])
      );
      
      console.log("Expected FormFieldIDs:", Array.from(formFieldMap.keys()));
      console.log("Received body:", req.body);
      console.log("Received files:", req.files);

      const soumission = await prisma.soumission.create({
        data: {
          compagneId: form.compagneId,
        },
      });
      
      const submissionUploadDir = path.join(process.cwd(), 'src/uploads/soumissions', soumission.id);
      await fs.mkdir(submissionUploadDir, { recursive: true });

      const answerPromises: any[] = [];
      const { answers } = req.body;
      const files = req.files as Express.Multer.File[];

      if (answers && Array.isArray(answers)) {
        for (const [index, answer] of answers.entries()) {
          const { formFieldId, value: textValue } = answer;

          if (!formFieldMap.has(formFieldId)) {
            console.warn(`Received answer for an unknown formFieldId: ${formFieldId}. Skipping.`);
            continue;
          }

          const fieldInfo = formFieldMap.get(formFieldId);
          let finalValue: string | undefined = undefined;

          if (fieldInfo?.type === "file" || fieldInfo?.type === "image") {
            const expectedFieldname = `answers[${index}][value]`;
            const file = files.find((f) => f.fieldname === expectedFieldname);
            if (file) {
              const newPath = path.join(submissionUploadDir, file.filename);
              await fs.rename(file.path, newPath);
              finalValue = path.relative(path.join(process.cwd(), 'src'), newPath);
            }
          } else {
            finalValue = textValue;
          }

          if (finalValue !== undefined && finalValue !== null) {
            answerPromises.push(
              prisma.answer.create({
                data: {
                  soumissionId: soumission.id,
                  formFieldId: formFieldId,
                  valeu: String(finalValue),
                },
              })
            );
          }
        }
      }

      const createdAnswers = await Promise.all(answerPromises);

      res
        .status(201)
        .json({ message: "Form submitted successfully", data: createdAnswers });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
}
