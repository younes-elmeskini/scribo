import express from "express";
import SoumissionController from "../controllers/soumission.controller";
import { authenticate } from "../middleware/auth";

const router = express.Router();

router.post("/:id/notes", authenticate, SoumissionController.createNote);
router.post("/:id/email",authenticate, SoumissionController.sendEmail)
router.post("/:id/appointment", authenticate, SoumissionController.createAppointment)
router.post("/:id/task", authenticate, SoumissionController.createTask)
router.post( "/compagne/:id/export", authenticate, SoumissionController.exportSoumissions);

router.get("/compagne/:id", authenticate, SoumissionController.getCompagneSoumissions);
router.get("/:id", authenticate, SoumissionController.getSoumissionDetails);
router.get("/:id/notes", authenticate, SoumissionController.getNotes);
router.get("/:id/email", authenticate, SoumissionController.getEmails);
router.get("/:id/appointment", authenticate, SoumissionController.getAppointments)
router.get("/:id/task", authenticate, SoumissionController.getTask)
router.get("/:id/history", authenticate, SoumissionController.getCompagneHistory);
router.get('/compagne/:id/membres', authenticate, SoumissionController.getMembresCompagne);
router.get("/compagne/:id/export", authenticate, SoumissionController.getExportSoummision);
router.get("/compagne/:compagneId/emails/received", authenticate, SoumissionController.getFilteredReceivedEmailsViaGmailAPI);

router.put("/:id/favorite", authenticate, SoumissionController.toggleSoumissionFavorite);
router.put("/soumission/:id/answers", authenticate, SoumissionController.updateSoumissionAnswers);
router.put("/note/:noteId", authenticate, SoumissionController.updateNote);
router.put("/appointment/:appointmentId", authenticate, SoumissionController.updateAppointment);
router.put("/task/:taskId", authenticate, SoumissionController.updateTask); 

router.delete("/note/:noteId", authenticate, SoumissionController.deleteNote);
router.delete("/email/:emailId", authenticate, SoumissionController.deleteEmail);
router.delete("/:id", authenticate, SoumissionController.deleteSoumission);
router.delete("/appointment/:appointmentId", authenticate, SoumissionController.deleteAppointment);
router.delete("/task/:taskId", authenticate, SoumissionController.deleteTask);


export default router;