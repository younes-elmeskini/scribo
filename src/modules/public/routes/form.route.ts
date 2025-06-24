import express from "express";
import formController from "../controllers/form.controller";

const router = express.Router();

router.post("/:id", formController.submitForm);
router.get("/:id", formController.getForm);

export default router;