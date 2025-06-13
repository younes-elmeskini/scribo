import express from "express";
import SoumissionController from "../controllers/soumission.controller";
import { authenticate } from "../middleware/auth";

const router = express.Router();

router.post("/:id/notes", authenticate, SoumissionController.createNote);
router.post("/:id/email",authenticate, SoumissionController.sendEmail)

router.get("/compagne/:id", authenticate, SoumissionController.getCompagneSoumissions);
router.get("/:id", authenticate, SoumissionController.getSoumissionDetails);
router.get("/:id/notes", authenticate, SoumissionController.getNotes);
router.get("/:id/email", authenticate, SoumissionController.getEmails);

router.put("/:id/favorite", authenticate, SoumissionController.toggleSoumissionFavorite);
router.put("/soumission/:id/answers", authenticate, SoumissionController.updateSoumissionAnswers);
router.put("/notes/:noteId", authenticate, SoumissionController.updateNote);

router.delete("/notes/:noteId", authenticate, SoumissionController.deleteNote);
router.delete("/emails/:emailId", authenticate, SoumissionController.deleteEmail);
router.delete("/soumission/:id", authenticate, SoumissionController.deleteSoumission);

export default router;