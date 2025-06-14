import express from "express";
import SoumissionController from "../controllers/soumission.controller";
import { authenticate } from "../middleware/auth";

const router = express.Router();

router.post("/:id/notes", authenticate, SoumissionController.createNote);
router.post("/:id/email",authenticate, SoumissionController.sendEmail)
router.post("/:id/appointment", authenticate, SoumissionController.createAppointment)

router.get("/compagne/:id", authenticate, SoumissionController.getCompagneSoumissions);
router.get("/:id", authenticate, SoumissionController.getSoumissionDetails);
router.get("/:id/notes", authenticate, SoumissionController.getNotes);
router.get("/:id/email", authenticate, SoumissionController.getEmails);
router.get("/:id/appointment", authenticate, SoumissionController.getAppointments)

router.put("/:id/favorite", authenticate, SoumissionController.toggleSoumissionFavorite);
router.put("/soumission/:id/answers", authenticate, SoumissionController.updateSoumissionAnswers);
router.put("/note/:noteId", authenticate, SoumissionController.updateNote);
router.put("/appointment/:appointmentId", authenticate, SoumissionController.updateAppointment);

router.delete("/note/:noteId", authenticate, SoumissionController.deleteNote);
router.delete("/email/:emailId", authenticate, SoumissionController.deleteEmail);
router.delete("/soumission/:id", authenticate, SoumissionController.deleteSoumission);
router.delete("/appointment/:appointmentId", authenticate, SoumissionController.deleteAppointment);


export default router;