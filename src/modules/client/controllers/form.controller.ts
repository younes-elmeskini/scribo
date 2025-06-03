import { Request, Response } from "express";
import prisma from "../../../utils/client";
import FromValidation from "../utils/validation/form";
import { validationResult } from "../../../utils/validation/validationResult";
import { z } from "zod";

type updateform = z.infer<typeof FromValidation.updateformSchema>;

export default class FormController {
  static async getAllfields(req: Request, res: Response): Promise<void> {
    try {
      const fields = await prisma.fields.findMany({
        select: {
          id: true,
          icon: true,
          fieldName: true,
          type: true,
        },
      });
      res.status(200).json({ data: fields });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async getAllModelForms(req: Request, res: Response): Promise<void> {
    try {
      const modelForms = await prisma.modelForm.findMany({
        select: {
          id: true,
          title: true,
          Description: true,
          coverColor: true,
          coverImage: true,
          mode: true,
          messageSucces: true,
          categotyId: true,
          categoty: {
            select: {
              id: true,
              categotyName: true,
            },
          },
        },
      });

      // Group by category
      const categoriesMap: Record<string, any> = {};

      modelForms.forEach((modelForm) => {
        const categoryName = modelForm.categoty.categotyName;

        if (!categoriesMap[categoryName]) {
          categoriesMap[categoryName] = {
            categoryName,
            quantiyformModel: 0,
            formModel: [],
          };
        }

        categoriesMap[categoryName].formModel.push({
          id: modelForm.id,
          title: modelForm.title,
          coverImage: modelForm.coverImage,
        });

        categoriesMap[categoryName].quantiyformModel =
          categoriesMap[categoryName].formModel.length;
      });

      // Convert map to array
      const result = Object.values(categoriesMap);

      res.status(200).json({ data: result });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async getformByCompagneId(req: Request, res: Response): Promise<void> {
    try {
      const compagneId = req.params.id;
      const form = await prisma.form.findFirst({
        where: {
          compagneId: compagneId.toString(),
        },
        select: {
          id: true,
          title: true,
          Description: true,
          coverColor: true,
          coverImage: true,
          mode: true,
          messageSucces: true,
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
              message: true,
              ordre: true,
              placeholdre: true,
              options: true,
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
            },
            orderBy: {
              ordre: "asc",
            },
          },
        },
      });
      res.status(200).json({ data: form });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async updateForm(req: Request, res: Response): Promise<void> {
    try {
      validationResult(FromValidation.updateformSchema, req, res);
      const formId = req.params.id;
      const clientId = req.client?.id;
      
      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      if (!formId) {
        res.status(400).json({ message: "Form ID is required" });
        return;
      }

      // Vérifier si le formulaire existe et si l'utilisateur a accès
      const form = await prisma.form.findFirst({
        where: {
          id: formId,
          compagne: {
            OR: [
              { clientId: clientId.toString() },  
              {
                TeamCompagne: {
                  some: {
                    teamMember: {
                      membreId: clientId.toString() 
                    }
                  }
                }
              }
            ]
          }
        }
      });

      if (!form) {
        res.status(404).json({ message: "Form not found or access denied" });
        return;
      }

      // Vérifier les styles de texte si fournis
      const parsedData: updateform = FromValidation.updateformSchema.parse(req.body);
      
      if (parsedData.titleStyle) {
        const titleStyleExists = await prisma.textStyle.findUnique({
          where: { id: parsedData.titleStyle }
        });
        
        if (!titleStyleExists) {
          res.status(400).json({ message: "Invalid title style" });
          return;
        }
      }
      
      if (parsedData.formStyle) {
        const formStyleExists = await prisma.textStyle.findUnique({
          where: { id: parsedData.formStyle }
        });
        
        if (!formStyleExists) {
          res.status(400).json({ message: "Invalid form style" });
          return;
        }
      }

      // Mettre à jour le formulaire avec l'ID explicite
      const updatedForm = await prisma.form.update({
        where: { 
          id: formId 
        },
        data: parsedData
      });

      res.status(200).json({ 
        message: "Form updated successfully",
        data: updatedForm
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async updateFormField(req: Request, res: Response): Promise<void> {
    try {
      validationResult(FromValidation.updateFormFieldSchema, req, res);
      const formFieldId = req.params.id;
      const clientId = req.client?.id;
      
      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      if (!formFieldId) {
        res.status(400).json({ message: "Form Field ID is required" });
        return;
      }

      // Vérifier si le champ de formulaire existe et si l'utilisateur a accès
      const formField = await prisma.formField.findFirst({
        where: {
          id: formFieldId,
          form: {
            compagne: {
              OR: [
                { clientId: clientId.toString() }, // Propriétaire
                {
                  TeamCompagne: {
                    some: {
                      teamMember: {
                        membreId: clientId.toString() // Membre d'équipe
                      }
                    }
                  }
                }
              ]
            }
          }
        },
        include: {
          fields: true,
          Answer: true
        }
      });

      if (!formField) {
        res.status(404).json({ message: "Form field not found or access denied" });
        return;
      }

      // Vérifier le fieldId s'il est fourni
      const parsedData = FromValidation.updateFormFieldSchema.parse(req.body);
      
      if (parsedData.fieldId) {
        const fieldExists = await prisma.fields.findUnique({
          where: { id: parsedData.fieldId }
        });
        
        if (!fieldExists) {
          res.status(400).json({ message: "Invalid field type" });
          return;
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        if (parsedData.fieldId && parsedData.fieldId !== formField.fieldId) {
          await tx.answer.deleteMany({
            where: {
              formFieldId: formFieldId
            }
          });
        }
        return tx.formField.update({
          where: { id: formFieldId },
          data: parsedData,
          include: {
            fields: true, 
            Answer: true  
          }
        });
      });

      res.status(200).json({ 
        message: "Form field updated successfully",
        data: result
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
}
