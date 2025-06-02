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
              label: true,
              requird: true,
              disable: true,
              style: true,
              message: true,
              ordre: true,
              placeholdre: true,
              options: true,
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
  static async updateform(req: Request, res: Response): Promise<void> {
    try {
      validationResult(FromValidation.updateformSchema, req, res);
      const { id } = req.params;
      const parsedData: updateform = FromValidation.updateformSchema.parse(
        req.body
      );
      if (!id) {
        res.status(400).json({ message: "Form ID is required" });
        return;
      }
      const form = await prisma.form.update({
        where: { id },
        data: {
          ...parsedData,
        },
      });
      if (!form) {
        res.status(400).json({ message: "Form not updated" });
        return;
      }
      res.status(200).json({ message: "Form updated successfully", data: form });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
}
