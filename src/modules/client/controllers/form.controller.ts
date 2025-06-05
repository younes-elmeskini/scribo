import { Request, Response } from "express";
import prisma from "../../../utils/client";
import FromValidation from "../utils/validation/form";
import { validationResult } from "../../../utils/validation/validationResult";
import { z } from "zod";

type updateform = z.infer<typeof FromValidation.updateformSchema>;

interface FormFieldOption {
  ordre: number;
  content: string;
  desactivedAt: boolean;
}

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
              FormFieldOption: {
                select: {
                  id: true,
                  ordre: true,
                  content: true,
                  desactivedAt: true,
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
                      membreId: clientId.toString(),
                    },
                  },
                },
              },
            ],
          },
        },
      });

      if (!form) {
        res.status(404).json({ message: "Form not found or access denied" });
        return;
      }

      // Vérifier les styles de texte si fournis
      const parsedData: updateform = FromValidation.updateformSchema.parse(
        req.body
      );

      if (parsedData.titleStyle) {
        const titleStyleExists = await prisma.textStyle.findUnique({
          where: { id: parsedData.titleStyle },
        });

        if (!titleStyleExists) {
          res.status(400).json({ message: "Invalid title style" });
          return;
        }
      }

      if (parsedData.formStyle) {
        const formStyleExists = await prisma.textStyle.findUnique({
          where: { id: parsedData.formStyle },
        });

        if (!formStyleExists) {
          res.status(400).json({ message: "Invalid form style" });
          return;
        }
      }

      // Mettre à jour le formulaire avec l'ID explicite
      const updatedForm = await prisma.form.update({
        where: {
          id: formId,
        },
        data: parsedData,
      });

      res.status(200).json({
        message: "Form updated successfully",
        data: updatedForm,
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
                        membreId: clientId.toString(), // Membre d'équipe
                      },
                    },
                  },
                },
              ],
            },
          },
        },
        include: {
          fields: {
            select: {
              type: true,
            },
          },
        },
      });

      if (!formField) {
        res
          .status(404)
          .json({ message: "Form field not found or access denied" });
        return;
      }
      const parsedData = FromValidation.updateFormFieldSchema.parse(req.body);
      const result = await prisma.formField.update({
        where: { id: formFieldId },
        data: {
          ...parsedData,
        },
        include: {
          fields: true,
        },
      });
      res.status(200).json({
        message: "Form field updated successfully",
        data: result,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async updateOrderFormField(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      validationResult(FromValidation.updateOrderFormFieldSchema, req, res);
      const formFieldId = req.params.id;
      const clientId = req.client?.id;
      const parsedData = FromValidation.updateOrderFormFieldSchema.parse(
        req.body
      );

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      if (!formFieldId) {
        res.status(400).json({ message: "Form Field ID is required" });
        return;
      }

      // Get the form field and check access
      const formField = await prisma.formField.findUnique({
        where: { id: formFieldId },
        include: {
          fields: true,
          form: true,
        },
      });

      if (!formField) {
        res.status(404).json({ message: "Form field not found" });
        return;
      }

      const formId = formField.formId;
      const oldOrdre = formField.ordre;
      const newOrdre = parsedData.newordre;

      // Get all form fields to reorder
      const allFormFields = await prisma.formField.findMany({
        where: { formId },
        orderBy: { ordre: "asc" },
      });

      await prisma.$transaction(async (tx) => {
        await tx.formField.update({
          where: { id: formFieldId },
          data: { ordre: newOrdre },
        });

        if (newOrdre > oldOrdre) {
          // Moving down: decrement orders for fields between old and new position
          await tx.formField.updateMany({
            where: {
              formId,
              ordre: { gt: oldOrdre, lte: newOrdre },
              id: { not: formFieldId },
            },
            data: { ordre: { decrement: 1 } },
          });
        } else if (newOrdre < oldOrdre) {
          // Moving up: increment orders for fields between new and old position
          await tx.formField.updateMany({
            where: {
              formId,
              ordre: { gte: newOrdre, lt: oldOrdre },
              id: { not: formFieldId },
            },
            data: { ordre: { increment: 1 } },
          });
        }
      });

      // Get updated fields with new order
      const updatedFormFields = await prisma.formField.findMany({
        where: { formId },
        orderBy: { ordre: "asc" },
        include: {
          fields: {
            select: {
              id: true,
              fieldName: true,
              type: true,
            },
          },
        },
      });

      res.status(200).json({
        message: "Form field order updated successfully",
        data: {
          updatedFields: updatedFormFields,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async updateTypeformField(req: Request, res: Response): Promise<void> {
    try {
      const { formFieldId, fieldId } = req.body;
      const formId = req.params.id;
      const clientId = req.client?.id;
      
      const fromField = await prisma.formField.findUnique({
        where: { id: formFieldId, formId: formId },
        select: {
          id: true,
          fieldId: true,
          FormFieldOption: true,
          Answer: true
        },
      });
      
      if (!fromField) {
        res.status(404).json({ message: "Form field not found" });
        return;
      }

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      
      // Check if field exists
      const newField = await prisma.fields.findUnique({
        where: { id: fieldId }
      });
      
      if (!newField) {
        res.status(404).json({ message: "Field type not found" });
        return;
      }
      
      // Update field type and handle answers
      await prisma.$transaction(async (tx) => {
        // Update the form field with new field type
        const updatedField = await tx.formField.update({
          where: { id: formFieldId },
          data: { 
            fieldId: fieldId,
          },
          include: {
            fields: true,
            FormFieldOption: true
          }
        });
        
        // Delete existing options if changing to non-option field type
        if (!["radio", "checkbox", "select"].includes(newField.type)) {
          await tx.formFieldOption.deleteMany({
            where: { formFieldId: formFieldId }
          });
        }
        
        // Clear answers for this field as the type has changed
        if (fromField.Answer.length > 0) {
          await tx.answer.deleteMany({
            where: { formFieldId: formFieldId }
          });
        }
      });
      
      // Get updated form field
      const updatedFormField = await prisma.formField.findUnique({
        where: { id: formFieldId },
        include: {
          fields: true,
          FormFieldOption: true
        }
      });
      
      res.status(200).json({
        message: "Form field type updated successfully",
        data: updatedFormField
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async addFormFieldOption(req: Request, res: Response): Promise<void> {
    try {
      const formFieldId = req.params.id;
      const clientId = req.client?.id;
      const { content } = req.body;
      
      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      
      if (!formFieldId) {
        res.status(400).json({ message: "Form Field ID is required" });
        return;
      }
      
      if (!content) {
        res.status(400).json({ message: "Option content is required" });
        return;
      }
      
      // Get the form field and check access
      const formField = await prisma.formField.findFirst({
        where: {
          id: formFieldId,
          form: {
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
        },
        include: {
          fields: true,
          FormFieldOption: {
            orderBy: {
              ordre: 'asc'
            }
          }
        },
      });
      
      if (!formField) {
        res.status(404).json({ message: "Form field not found or access denied" });
        return;
      }
      
      // Check if field type supports options
      if (!["radio", "checkbox", "select"].includes(formField.fields.type)) {
        res.status(400).json({ message: "This field type does not support options" });
        return;
      }
      
      // Find the highest order
      const maxOrdre = formField.FormFieldOption.length > 0 
        ? Math.max(...formField.FormFieldOption.map(opt => opt.ordre)) 
        : -1;

      // Add new option
      const newOption = await prisma.formFieldOption.create({
        data: {
          formFieldId,
          ordre: maxOrdre + 1,
          content,
          desactivedAt: false
        }
      });

      // Get updated form field with options
      const updatedField = await prisma.formField.findUnique({
        where: { id: formFieldId },
        include: {
          fields: true,
          FormFieldOption: {
            orderBy: {
              ordre: 'asc'
            }
          }
        }
      });
      
      res.status(200).json({
        message: "Option added successfully",
        data: updatedField
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  
  static async updateFormFieldOption(req: Request, res: Response): Promise<void> {
    try {
      const formFieldId = req.params.id;
      const clientId = req.client?.id;
      const { optionId, newOrdre, content, desactivedAt } = req.body;
      
      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      
      if (!formFieldId || !optionId) {
        res.status(400).json({ message: "Form Field ID and Option ID are required" });
        return;
      }
      
      // Get the form field and check access
      const formField = await prisma.formField.findFirst({
        where: {
          id: formFieldId,
          form: {
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
        },
        include: {
          fields: true,
          FormFieldOption: true
        },
      });
      
      if (!formField) {
        res.status(404).json({ message: "Form field not found or access denied" });
        return;
      }
      
      // Find the option to update
      const option = await prisma.formFieldOption.findUnique({
        where: { id: optionId }
      });
      
      if (!option || option.formFieldId !== formFieldId) {
        res.status(404).json({ message: "Option not found" });
        return;
      }
      
      // Update the option
      const updateData: any = {};
      if (content !== undefined) updateData.content = content;
      if (desactivedAt !== undefined) updateData.desactivedAt = desactivedAt;
      
      await prisma.$transaction(async (tx) => {
        // Update basic option data
        await tx.formFieldOption.update({
          where: { id: optionId },
          data: updateData
        });
        
        // Update order if provided
        if (newOrdre !== undefined && newOrdre !== option.ordre) {
          // Get all options for reordering
          const allOptions = await tx.formFieldOption.findMany({
            where: { formFieldId },
            orderBy: { ordre: 'asc' }
          });
          
          if (newOrdre > option.ordre) {
            // Moving down: decrement orders for options between old and new position
            await tx.formFieldOption.updateMany({
              where: {
                formFieldId,
                ordre: { gt: option.ordre, lte: newOrdre },
                id: { not: optionId }
              },
              data: { ordre: { decrement: 1 } }
            });
          } else if (newOrdre < option.ordre) {
            // Moving up: increment orders for options between new and old position
            await tx.formFieldOption.updateMany({
              where: {
                formFieldId,
                ordre: { gte: newOrdre, lt: option.ordre },
                id: { not: optionId }
              },
              data: { ordre: { increment: 1 } }
            });
          }
          
          // Update the option's order
          await tx.formFieldOption.update({
            where: { id: optionId },
            data: { ordre: newOrdre }
          });
        }
      });
      
      // Get updated form field with options
      const updatedField = await prisma.formField.findUnique({
        where: { id: formFieldId },
        include: {
          fields: true,
          FormFieldOption: {
            orderBy: {
              ordre: 'asc'
            }
          }
        }
      });
      
      res.status(200).json({
        message: "Option updated successfully",
        data: updatedField
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  
  static async deleteFormFieldOption(req: Request, res: Response): Promise<void> {
    try {
      const formFieldId = req.params.id;
      const clientId = req.client?.id;
      const { optionId } = req.body;
      
      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      
      if (!formFieldId || !optionId) {
        res.status(400).json({ message: "Form Field ID and Option ID are required" });
        return;
      }
      
      // Get the form field and check access
      const formField = await prisma.formField.findFirst({
        where: {
          id: formFieldId,
          form: {
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
        }
      });
      
      if (!formField) {
        res.status(404).json({ message: "Form field not found or access denied" });
        return;
      }
      
      // Find the option to delete
      const option = await prisma.formFieldOption.findUnique({
        where: { id: optionId }
      });
      
      if (!option || option.formFieldId !== formFieldId) {
        res.status(404).json({ message: "Option not found" });
        return;
      }
      
      await prisma.$transaction(async (tx) => {
        // Delete the option
        await tx.formFieldOption.delete({
          where: { id: optionId }
        });
        
        // Reorder remaining options
        await tx.formFieldOption.updateMany({
          where: {
            formFieldId,
            ordre: { gt: option.ordre }
          },
          data: {
            ordre: { decrement: 1 }
          }
        });
      });
      
      // Get updated form field with options
      const updatedField = await prisma.formField.findUnique({
        where: { id: formFieldId },
        include: {
          fields: true,
          FormFieldOption: {
            orderBy: {
              ordre: 'asc'
            }
          }
        }
      });
      
      res.status(200).json({
        message: "Option deleted successfully",
        data: updatedField
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
}
