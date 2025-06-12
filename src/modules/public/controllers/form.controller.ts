import { Request, Response } from "express";
import prisma from "../../../utils/client";

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
}