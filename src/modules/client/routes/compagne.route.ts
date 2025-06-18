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
router.post("/teamcompagne", authenticate, CompagneController.addToTeamCompagne)

router.get("/", authenticate, CompagneController.getAllCompagne);
router.get("/sidebar", authenticate, CompagneController.getsideBarData);
router.get("/team-member",  authenticate, CompagneController.getTeamMembre)
router.get("/:id", authenticate, CompagneController.getCompagneById);
router.get('/teamcompagne/:id', authenticate, CompagneController.getTeamCompagne);

router.put("/:id/favorite", authenticate, CompagneController.favoriteCompagne);
router.put("/:id", authenticate, CompagneController.updateCompagne)

router.delete('/teamcompagne/:id', authenticate, CompagneController.deleteTeamCompagne);

export default router;
