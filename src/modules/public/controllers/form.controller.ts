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
        select: {
          id: true,
          title: true,
          Description: true,
          coverColor: true,
          coverImage: true,
          mode: true,
          desactivatedAt: true,
          FormField: {
            select: {
              id: true,
              fieldId: true,
              name: true,
              label: true,
              requird: true,
              disable: true,
              style: true,
              ordre: true,
              selectId:true,
              placeholdre: true,
              FormFieldOption: {
                select: {
                  id: true,
                  ordre: true,
                  content: true,
                  desactivedAt: true,
                  default: true,
                },
                orderBy: {
                  ordre: "asc",
                },
              },
              min: true,
              max: true,
              fileType: true,
              instruction: true,
              fields: {
                select: {
                  id: true,
                  icon: true,
                  fieldName: true,
                  type: true,
                },
              },
              FormFieldMap:{
                select:{
                  id:true,
                  lat:true,    
                  lng:true,       
                  zoom:true,  
                  height:true,
                }
              }
            },
            orderBy:{
              ordre:"asc"
            }
          },
        },
      });
      if (!form) {
        res.status(404).json({ message: "Formulaire non trouvé" });
        return;
      }

      res.status(200).json({ form, message: "Form retrieved successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur interne du serveur" });
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
        res.status(404).json({ message: "Formulaire non trouvé" });
        return;
      }

      const formFieldMap = new Map(
        form.FormField.map((field) => [
          field.id,
          { type: field.fields.type },
        ])
      );
    
      const { answers } = req.body;

      // Check for unique email if required
      if (form.uniqueEmailUsage && form.uniqueEmailField) {
        if (answers && Array.isArray(answers)) {
          const emailAnswer = answers.find(
            (ans: any) => ans.formFieldId === form.uniqueEmailField
          );

          if (emailAnswer && emailAnswer.value) {
            const emailValue = emailAnswer.value;

            const existingAnswer = await prisma.answer.findFirst({
              where: {
                formFieldId: form.uniqueEmailField,
                valeu: emailValue,
              },
            });

            if (existingAnswer) {
              res
                .status(409)
                .json({ message: "This email has already been used for a submission." });
              return;
            }
          }
        }
      }

      const soumission = await prisma.soumission.create({
        data: {
          compagneId: form.compagneId,
        },
      });
      
      const submissionUploadDir = path.join(process.cwd(), 'src/uploads/soumissions', soumission.id);
      await fs.mkdir(submissionUploadDir, { recursive: true });

      const answerPromises: any[] = [];
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
          } else if (fieldInfo?.type === "checkbox") {
            let arr: string[] = [];
            if (Array.isArray(textValue)) {
              arr = textValue;
            } else if (typeof textValue === "string" && textValue.startsWith("[") && textValue.endsWith("]")) {
              try {
                arr = JSON.parse(textValue);
              } catch {
                arr = [textValue];
              }
            } else if (typeof textValue === "string") {
              arr = [textValue];
            }
            finalValue = arr.join(", ");
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
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }
}
