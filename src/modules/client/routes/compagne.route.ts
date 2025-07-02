import express from "express";
import CompagneController from "../controllers/compagne.controller";
import { authenticate } from "../middleware/auth";
import { uploadExcelMiddleware } from "../controllers/compagne.controller";

const router = express.Router();

router.post("/", authenticate, CompagneController.createCompagne);
router.post(
  "/create-from-excel",
  authenticate,
  uploadExcelMiddleware,
  CompagneController.createCompagneFromExcel
);
router.post(
  "/create-from-model",
  authenticate,
  CompagneController.createCompagneFromModel
);
router.post("/:compagneId/teamcompagne", authenticate, CompagneController.addToTeamCompagne)
router.post("/:id/duplicate", authenticate, CompagneController.duplicateCompagne);

router.get("/", authenticate, CompagneController.getAllCompagne);
router.get("/sidebar", authenticate, CompagneController.getsideBarData);
router.get("/:id", authenticate, CompagneController.getCompagneById);
router.get('/team/:id', authenticate, CompagneController.getTeam);
router.get("/:id/history-export",authenticate ,CompagneController.getExportHistory)

router.put("/:id/favorite", authenticate, CompagneController.favoriteCompagne);
router.put("/:id", authenticate, CompagneController.updateCompagne)

router.delete('/teamcompagne/:id', authenticate, CompagneController.deleteTeamCompagne);
router.delete('/:id', authenticate, CompagneController.deleteCompagne);


export default router;
