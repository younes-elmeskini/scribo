import express from "express";
import formController from "../controllers/form.controller";
import upload from "../middleware/upload";

const router = express.Router();

router.post("/:id", upload.any(), formController.submitForm);
router.get("/:id", formController.getForm);

export default router;