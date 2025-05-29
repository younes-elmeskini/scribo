import express from "express";
import CompagneController from "../controllers/compagne.controller";
import { authenticate } from "../middleware/auth";
import { uploadExcelMiddleware } from "../controllers/compagne.controller";

const router = express.Router();

router.post("/", authenticate, CompagneController.createCompagne);
router.post(
  "/create-from-field-counts-excel",
  authenticate,
  uploadExcelMiddleware,
  CompagneController.createCompagneFromFieldCountsExcel
);
router.get("/", authenticate, CompagneController.getAllCompagne);
router.get("/sidebar",authenticate, CompagneController.getsideBarData);
router.get("/:id",authenticate, CompagneController.getCompagneById);

router.put("/:id/favorite", authenticate, CompagneController.favoriteCompagne);


export default router;
