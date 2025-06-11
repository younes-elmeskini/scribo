import { Request, Response } from "express";
import prisma from "../../../utils/client";
import FormValidation from "../utils/validation/form";
import { validationResult } from "../../../utils/validation/validationResult";
import { z } from "zod";
import GestionForm from "../utils/gestionfrom";

type updateform = z.infer<typeof FormValidation.updateformSchema>;
type updateFormField = z.infer<typeof FormValidation.updateFormFieldSchema>;
type updateOrderFormField = z.infer<
  typeof FormValidation.updateOrderFormFieldSchema
>;
type updateOption = z.infer<typeof FormValidation.updateOptionSchema>;
type deleteOption = z.infer<typeof FormValidation.deleteOptionSchema>;
type FormConfiguration = z.infer<typeof FormValidation.formConfigurationSchema>;

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
      validationResult(FormValidation.updateformSchema, req, res);
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
      const parsedData: updateform = FormValidation.updateformSchema.parse(
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
      validationResult(FormValidation.updateFormFieldSchema, req, res);
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
          FormFieldMap: true
        },
      });

      if (!formField) {
        res
          .status(404)
          .json({ message: "Form field not found or access denied" });
        return;
      }
      
      const parsedData: updateFormField = FormValidation.updateFormFieldSchema.parse(req.body);
      const { mapConfig, ...formFieldData } = parsedData;
      
      await prisma.$transaction(async (tx) => {
        // Update form field data
        await tx.formField.update({
          where: { id: formFieldId },
          data: formFieldData,
        });
        
        // If field is map type and mapConfig is provided, update map configuration
        if (formField.fields.type === "map" && mapConfig) {
          // Vérifier explicitement si l'enregistrement existe dans la base de données
          const mapRecord = await tx.formFieldMap.findUnique({
            where: { formFieldId }
          });
          
          if (mapRecord) {
            // L'enregistrement existe, on peut le mettre à jour
            await tx.formFieldMap.update({
              where: { formFieldId },
              data: mapConfig
            });
          } else {
            // L'enregistrement n'existe pas, on doit le créer
            await tx.formFieldMap.create({
              data: {
                formFieldId,
                ...mapConfig
              }
            });
          }
        }
      });
      
      // Get updated form field with all related data
      const result = await prisma.formField.findUnique({
        where: { id: formFieldId },
        include: {
          fields: true,
          FormFieldMap: formField.fields.type === "map" ? true : false
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
      validationResult(FormValidation.updateOrderFormFieldSchema, req, res);
      const formFieldId = req.params.id;
      const clientId = req.client?.id;
      const parsedData = FormValidation.updateOrderFormFieldSchema.parse(
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
        : 0;

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
      const updateData: updateOption  = FormValidation.updateOptionSchema.parse(req.body);
      
      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      
      if (!formFieldId || !updateData.optionId) {
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
        where: { id: updateData.optionId }
      });
      
      if (!option || option.formFieldId !== formFieldId) {
        res.status(404).json({ message: "Option not found" });
        return;
      }
      
      
      await prisma.$transaction(async (tx) => {
        // Update basic option data
        await tx.formFieldOption.update({
          where: { id: updateData.optionId },
          data: {
            ordre: updateData.newOrdre,
            desactivedAt: updateData.desactivedAt,
            default: updateData.default
          }
        });
        
        // Update order if provided
        if (updateData.newOrdre !== undefined && updateData.newOrdre  !== option.ordre) {
          // Get all options for reordering
          const allOptions = await tx.formFieldOption.findMany({
            where: { formFieldId },
            orderBy: { ordre: 'asc' }
          });
          
          if (updateData.newOrdre  > option.ordre) {
            // Moving down: decrement orders for options between old and new position
            await tx.formFieldOption.updateMany({
              where: {
                formFieldId,
                ordre: { gt: option.ordre, lte: updateData.newOrdre  },
                id: { not: updateData.optionId }
              },
              data: { ordre: { decrement: 1 } }
            });
          } else if (updateData.newOrdre  < option.ordre) {
            // Moving up: increment orders for options between new and old position
            await tx.formFieldOption.updateMany({
              where: {
                formFieldId,
                ordre: { gte: updateData.newOrdre , lt: option.ordre },
                id: { not: updateData.optionId }
              },
              data: { ordre: { increment: 1 } }
            });
          }
          
          // Update the option's order
          await tx.formFieldOption.update({
            where: { id: updateData.optionId },
            data: { ordre: updateData.newOrdre  }
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
  static async deleteFormField(req: Request, res: Response): Promise<void> {
    try {
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
          form: true,
          FormFieldOption: true,
          Answer: true
        }
      });
      
      if (!formField) {
        res.status(404).json({ message: "Form field not found or access denied" });
        return;
      }
      
      const formId = formField.formId;
      const deletedOrdre = formField.ordre;
      
      await prisma.$transaction(async (tx) => {
        // Delete all options for this field
        if (formField.FormFieldOption.length > 0) {
          await tx.formFieldOption.deleteMany({
            where: { formFieldId }
          });
        }
        
        // Delete all answers for this field
        if (formField.Answer.length > 0) {
          await tx.answer.deleteMany({
            where: { formFieldId }
          });
        }
        
        // Delete the form field
        await tx.formField.delete({
          where: { id: formFieldId }
        });
        
        // Reorder remaining fields
        await tx.formField.updateMany({
          where: {
            formId,
            ordre: { gt: deletedOrdre }
          },
          data: {
            ordre: { decrement: 1 }
          }
        });
      });
      
      // Get updated form fields
      const updatedFormFields = await prisma.formField.findMany({
        where: { formId },
        orderBy: { ordre: 'asc' },
        include: {
          fields: {
            select: {
              id: true,
              fieldName: true,
              type: true,
              icon: true
            }
          },
          FormFieldOption: {
            orderBy: {
              ordre: 'asc'
            }
          }
        }
      });
      
      res.status(200).json({
        message: "Form field deleted successfully",
        data: updatedFormFields
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async duplicateFormField(req: Request, res: Response): Promise<void> {
    try {
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
        }
      });
      
      if (!formField) {
        res.status(404).json({ message: "Form field not found or access denied" });
        return;
      }
      
      // Get all form fields to find the highest order
      const allFormFields = await prisma.formField.findMany({
        where: { formId: formField.formId },
        orderBy: { ordre: 'desc' },
        take: 1
      });
      
      const highestOrdre = allFormFields.length > 0 ? allFormFields[0].ordre : 0;
      const newOrdre = highestOrdre + 1;
      
      // Generate a new name with "copy" suffix
      const originalName = formField.name || '';
      const baseName = originalName.replace(/\s*\(copy\s*\d*\)\s*$/, '');
      const newName = `${baseName}_copy`;
      
      // Generate a new label with "copy" suffix
      const originalLabel = formField.label || '';
      const baseLabel = originalLabel.replace(/_copy$/, '');
      const newLabel = `${baseLabel}_copy_${newOrdre }`;
      
      // Create the duplicate field
      const duplicatedField = await prisma.$transaction(async (tx) => {
        // Create the new form field
        const newField = await tx.formField.create({
          data: {
            formId: formField.formId,
            fieldId: formField.fieldId,
            name: newName,
            label: newLabel,
            requird: formField.requird,
            disable: formField.disable,
            style: formField.style,
            message: formField.message,
            ordre: newOrdre,
            placeholdre: formField.placeholdre,
            min: formField.min,
            max: formField.max,
            fileType: formField.fileType,
            instruction: formField.instruction
          }
        });
        
        // Duplicate options if any
        if (formField.FormFieldOption.length > 0) {
          for (const option of formField.FormFieldOption) {
            await tx.formFieldOption.create({
              data: {
                formFieldId: newField.id,
                ordre: option.ordre,
                content: option.content,
                desactivedAt: option.desactivedAt
              }
            });
          }
        }
        
        return newField;
      });
      
      // Get the duplicated field with all its data
      const result = await prisma.formField.findUnique({
        where: { id: duplicatedField.id },
        include: {
          fields: {
            select: {
              id: true,
              fieldName: true,
              type: true,
              icon: true
            }
          },
          FormFieldOption: {
            orderBy: {
              ordre: 'asc'
            }
          }
        }
      });
      
      // Get all form fields with the updated order
      const allUpdatedFields = await prisma.formField.findMany({
        where: { formId: formField.formId },
        orderBy: { ordre: 'asc' },
        include: {
          fields: {
            select: {
              id: true,
              fieldName: true,
              type: true,
              icon: true
            }
          },
          FormFieldOption: {
            orderBy: {
              ordre: 'asc'
            }
          }
        }
      });
      
      res.status(200).json({
        message: "Form field duplicated successfully",
        data: {
          duplicatedField: result,
          allFields: allUpdatedFields
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async addFormField(req: Request, res: Response): Promise<void> {
    try {
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
      
      // Validate request body
      validationResult(FormValidation.addFormFieldSchema, req, res);
      const { fieldId, name, label } = FormValidation.addFormFieldSchema.parse(req.body);
      
      // Check if form exists and user has access
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
        include: {
          FormField: {
            orderBy: {
              ordre: 'desc'
            },
            take: 1
          }
        }
      });
      
      if (!form) {
        res.status(404).json({ message: "Form not found or access denied" });
        return;
      }
      
      // Check if field type exists
      const field = await prisma.fields.findUnique({
        where: { id: fieldId }
      });
      
      if (!field) {
        res.status(404).json({ message: "Field type not found" });
        return;
      }
      
      // Determine the next order value
      const nextOrdre = form.FormField.length > 0 ? form.FormField[0].ordre + 1 : 1;
      
      // Generate default name and label if not provided
      const fieldName = field.fieldName;
      const defaultName = `field_${field.type.toLowerCase()}_${nextOrdre}`;
      const defaultLabel = `${fieldName} ${nextOrdre}`;
      
      // Create the new form field
      const newFormField = await prisma.$transaction(async (tx) => {
        // Create the form field
        const createdField = await tx.formField.create({
          data: {
            formId,
            fieldId,
            name: name || defaultName,
            label: label || defaultLabel,
            requird: false,
            disable: false,
            style: [],
            message: GestionForm.generateDefaultErrorMessage(field.type, fieldName, false),
            ordre: nextOrdre,
            placeholdre: field.type === "text" ? `Enter ${fieldName.toLowerCase()}` : "",
          }
        });
        
        // If field type supports options, create default options
        if (["radio", "checkbox", "select"].includes(field.type)) {
          const defaultOptions = [
            { ordre: 0, content: "Option 1", desactivedAt: false },
            { ordre: 1, content: "Option 2", desactivedAt: false },
            { ordre: 2, content: "Option 3", desactivedAt: false }
          ];
          
          for (const option of defaultOptions) {
            await tx.formFieldOption.create({
              data: {
                formFieldId: createdField.id,
                ordre: option.ordre,
                content: option.content,
                desactivedAt: option.desactivedAt
              }
            });
          }
        }
        
        return createdField;
      });
      
      // Get the created field with all its data
      const result = await prisma.formField.findUnique({
        where: { id: newFormField.id },
        include: {
          fields: {
            select: {
              id: true,
              fieldName: true,
              type: true,
              icon: true
            }
          },
          FormFieldOption: {
            orderBy: {
              ordre: 'asc'
            }
          }
        }
      });
      
      // Get all form fields with the updated order
      const allFields = await prisma.formField.findMany({
        where: { formId },
        orderBy: { ordre: 'asc' },
        include: {
          fields: {
            select: {
              id: true,
              fieldName: true,
              type: true,
              icon: true
            }
          },
          FormFieldOption: {
            orderBy: {
              ordre: 'asc'
            }
          }
        }
      });
      
      res.status(201).json({
        message: "Form field added successfully",
        data: {
          newField: result,
          allFields
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async getFormFieldMessages(req: Request, res: Response): Promise<void> {
    try {
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
          fields: true
        }
      });

      if (!formField) {
        res.status(404).json({ message: "Form field not found or access denied" });
        return;
      }

      // Générer un message par défaut si aucun message n'est défini
      let fieldMessage = formField.message || "";
      
      if (!fieldMessage) {
        fieldMessage = GestionForm.generateDefaultErrorMessage(
          formField.fields.type,
          formField.fields.fieldName,
          formField.requird?? false
        );
      }

      res.status(200).json({
        data: { message: fieldMessage }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async updateFormFieldMessages(req: Request, res: Response): Promise<void> {
    try {
      const formFieldId = req.params.id;
      const clientId = req.client?.id;
      const { message } = req.body;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      if (!formFieldId) {
        res.status(400).json({ message: "Form Field ID is required" });
        return;
      }

      if (typeof message !== 'string') {
        res.status(400).json({ message: "Message must be a string" });
        return;
      }

      // Vérifier si le champ de formulaire existe et si l'utilisateur a accès
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

      // Mettre à jour le champ de formulaire
      const updatedField = await prisma.formField.update({
        where: { id: formFieldId },
        data: {
          message: message
        },
        include: {
          fields: {
            select: {
              id: true,
              fieldName: true,
              type: true
            }
          }
        }
      });

      res.status(200).json({
        message: "Form field message updated successfully",
        data: updatedField
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
  static async updateFormConfiguration(req: Request, res: Response): Promise<void> {
    try {
      validationResult(FormValidation.formConfigurationSchema, req, res)
      const formId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Récupérer les données validées
      const configData = FormValidation.formConfigurationSchema.parse(req.body);
      
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
        include: {
          FormField: {
            select: {
              id: true,
              name: true,
              fields: {
                select: {
                  type: true
                }
              }
            }
          }
        }
      });

      if (!form) {
        res.status(404).json({ message: "Form not found or access denied" });
        return;
      }

      // Vérifier que le champ email unique existe et est de type email
      if (configData.uniqueEmailUsage && configData.uniqueEmailField) {
        const emailField = form.FormField.find(field => 
          field.id === configData.uniqueEmailField && 
          field.fields.type === 'email'
        );
        
        if (!emailField) {
          res.status(400).json({ 
            message: "Le champ sélectionné doit être un champ email" 
          });
          return;
        }
      }

      // Vérifier que le champ par défaut existe
      if (configData.defaultFieldId) {
        const defaultField = form.FormField.find(field => 
          field.id === configData.defaultFieldId
        );
        
        if (!defaultField) {
          res.status(400).json({ 
            message: "Le champ par défaut sélectionné n'existe pas" 
          });
          return;
        }
      }

      const updatedForm = await prisma.form.update({
        where: { id: formId },
        data: {
          sendCopyToUser: configData.sendCopyToUser ?? form.sendCopyToUser,
          uniqueEmailUsage: configData.uniqueEmailUsage ?? form.uniqueEmailUsage,
          uniqueEmailField: configData.uniqueEmailUsage ? configData.uniqueEmailField : form.uniqueEmailField,
          isDeactivated: configData.isDeactivated ?? form.isDeactivated,
          desactivatedAt: configData.isDeactivated ? 
            (configData.desactivatedAt && !isNaN(new Date(configData.desactivatedAt).getTime()) ? 
              new Date(configData.desactivatedAt) : 
              new Date()) : 
            null,
          defaultFieldId: configData.defaultFieldId 
        }
      });

      if(configData.uniqueEmailUsage){
        const updateUniqueEmailField = await prisma.formField.findFirst({
          where: { id: configData.uniqueEmailField ?? "" },
        })
        if(updateUniqueEmailField){
          await prisma.formField.update({
            where: { id: updateUniqueEmailField.id },
            data: { unique: true }
          })
        }
      }
      if(configData.defaultFieldId){
        const updateDefaultField = await prisma.formField.findFirst({
          where: { id: configData.defaultFieldId ?? "" },
        })
        if(updateDefaultField){
          await prisma.formField.update({
            where: { id: updateDefaultField.id },
            data: { default: true }
          })
        }
      }
      res.status(200).json({
        message: "Configuration du formulaire mise à jour avec succès",
        data: {
          id: updatedForm.id,
          sendCopyToUser: updatedForm.sendCopyToUser,
          uniqueEmailUsage: updatedForm.uniqueEmailUsage,
          uniqueEmailField: updatedForm.uniqueEmailField,
          isDeactivated: updatedForm.isDeactivated,
          desactivatedAt: updatedForm.desactivatedAt,
          defaultFieldId: updatedForm.defaultFieldId
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }
  static async getFormConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.id;
      const clientId = req.client?.id;

      if (!clientId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

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
        include: {
          FormField: {
            where: {
              fields: {
                type: 'email'
              }
            },
            select: {
              id: true,
              name: true,
              label: true
            }
          }
        }
      });
      const formFields = form?.FormField || [];

      if (!form) {
        res.status(404).json({ message: "Form not found or access denied" });
        return;
      }

      // Récupérer tous les champs pour le sélecteur de champ par défaut
      const allFields = await prisma.formField.findMany({
        where: {
          formId
        },
        select: {
          id: true,
          name: true,
          label: true
        }
      });

      res.status(200).json({
        data: {
          id: form.id,
          sendCopyToUser: form.sendCopyToUser,
          uniqueEmailUsage: form.uniqueEmailUsage,
          uniqueEmailField: form.uniqueEmailField,
          isDeactivated: form.isDeactivated,
          deactivationDate: form.desactivatedAt,
          defaultFieldId: form.defaultFieldId,
          emailFields: formFields, 
          allFields: allFields 
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
}
