import express from "express";
import FormController from "../controllers/form.controller";
import { authenticate } from "../middleware/auth";
import upload from "../middleware/upload";

const router = express.Router();
router.post("/field/duplicate/:id", authenticate, FormController.duplicateFormField);
router.post("/field/option/:id", authenticate, FormController.addFormFieldOption);
router.post("/field/:id", authenticate, FormController.addFormField);
router.post("/:id/cover-image", upload.single("coverImage"), FormController.uploadCoverImage);


router.get("/fields", FormController.getAllfields);
router.get("/model", FormController.getAllModelForms);
router.get("/fonts",FormController.getTextStyle)
router.get("/:id", authenticate, FormController.getformByCompagneId);
router.get("/configuration/:id", authenticate, FormController.getFormConfiguration);
router.get("/validation/:id", authenticate, FormController.getValidationForm);
router.get("/:id/fields-with-options", authenticate, FormController.getFormFieldsWithOptions);
router.get("/:id/formfiel-exports", authenticate, FormController.getFormFieldsByCompagneId);


router.put("/:id", authenticate, FormController.updateForm);
router.put("/field/:id", authenticate, FormController.updateFormField);
router.put("/field/order/:id", authenticate, FormController.updateOrderFormField);
router.put("/field/type/:id", authenticate, FormController.updateTypeformField);
router.put("/field/option/:id", authenticate, FormController.updateFormFieldOption);
router.put("/configuration/:id", authenticate, FormController.updateFormConfiguration);
router.put("/validations/:id", authenticate, FormController.updateValidationValues);


router.delete("/field/option/:id", authenticate, FormController.deleteFormFieldOption);
router.delete("/field/:id", authenticate, FormController.deleteFormField);
router.delete("/:id/cover-image", FormController.deleteCoverImage);


export default router;


