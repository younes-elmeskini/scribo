import express from "express";
import FormController from "../controllers/form.controller";
import { authenticate } from "../middleware/auth";

const router = express.Router();
router.post("/field/duplicate/:id", authenticate, FormController.duplicateFormField);
router.post("/field/option/:id", authenticate, FormController.addFormFieldOption);
router.post("/field/:id", authenticate, FormController.addFormField);

router.get("/fields", FormController.getAllfields);
router.get("/model", FormController.getAllModelForms);
router.get("/:id", authenticate, FormController.getformByCompagneId);
router.get("/messages/:id", authenticate, FormController.getFormFieldMessages);

router.put("/:id", authenticate, FormController.updateForm);
router.put("/field/:id", authenticate, FormController.updateFormField);
router.put("/field/order/:id", authenticate, FormController.updateOrderFormField);
router.put("/field/type/:id", authenticate, FormController.updateTypeformField);
router.put("/field/message/:id", authenticate, FormController.updateFormFieldMessages);

router.delete("/field/option/:id", authenticate, FormController.deleteFormFieldOption);
router.delete("/field/:id", authenticate, FormController.deleteFormField);

// Routes pour la configuration du formulaire
router.get("/configuration/:id", authenticate, FormController.getFormConfiguration);
router.put("/configuration/:id", authenticate, FormController.updateFormConfiguration);

export default router;


