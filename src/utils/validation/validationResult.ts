export const validationResult = (schema: any, req: any, res: any) => {
  const validationResult = schema.safeParse(req.body);
  if (!validationResult.success) {
    const firstError =
      validationResult.error.errors[0]?.message || "Validation error.";
    res.status(400).json({ message: firstError });
    return false;
  }
  return true;
}