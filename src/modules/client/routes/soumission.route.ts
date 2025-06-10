import express from "express";
import SoumissionController from "../controllers/soumission.controller";
import { authenticate } from "../middleware/auth";

const router = express.Router();

router.get("/compagne/:id", authenticate, SoumissionController.getCompagneSoumissions);
router.get("/:id", authenticate, SoumissionController.getSoumissionDetails);

export default router;
