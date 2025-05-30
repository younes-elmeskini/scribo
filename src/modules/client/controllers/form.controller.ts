import { Request, Response } from "express";
import prisma from "../../../utils/client";
import { z } from "zod";
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
      res.status(200).json(fields);
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
      
      modelForms.forEach(modelForm => {
        const categoryName = modelForm.categoty.categotyName;
        
        if (!categoriesMap[categoryName]) {
          categoriesMap[categoryName] = {
            categoryName,
            quantiyformModel: 0,
            formModel: []
          };
        }
        
        categoriesMap[categoryName].formModel.push({
          id: modelForm.id,
          title: modelForm.title,
          coverImage: modelForm.coverImage
        });
        
        categoriesMap[categoryName].quantiyformModel = categoriesMap[categoryName].formModel.length;
      });
      
      // Convert map to array
      const result = Object.values(categoriesMap);
      
      res.status(200).json(result);
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
}
