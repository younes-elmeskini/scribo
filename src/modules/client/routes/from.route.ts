import express from "express";
import FormController from "../controllers/form.controller";
import { authenticate } from "../middleware/auth";

const router = express.Router();

router.get("/fields", FormController.getAllfields);
router.get("/model", FormController.getAllModelForms);
router.get("/:id", authenticate, FormController.getformByCompagneId);


export default router;


