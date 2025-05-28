import express from "express";
import CompagneController from "../controllers/compagne.controller";
import { authenticate } from "../middleware/auth";

const router = express.Router();

router.post("/", authenticate, CompagneController.createCompagne);
router.get("/", authenticate, CompagneController.getAllCompagne);
router.get("/sidebar",authenticate, CompagneController.getsideBarData);
router.get("/:id",authenticate, CompagneController.getCompagneById);


export default router;
