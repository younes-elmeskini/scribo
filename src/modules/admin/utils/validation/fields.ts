import { z } from "zod";

export default class FieldsValidation {
  static createFieldSchema = z.object({
    icon: z.string({ message: "Icon is required." }),
    fieldName: z
      .string()
      .min(3, { message: "Field name must be at least 3 characters long." }),
    type: z.string({ message: "Type is required." }),
  });
}