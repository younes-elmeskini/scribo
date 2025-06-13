import { z } from "zod";

export default class SoumissionValidation {

static createNotesSchema = z.object({
    note: z.string({message:"note is required"}).min(3),
  });
  
}