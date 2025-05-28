import express from "express";
import CompagneController from "../controllers/compagne.controller"
// import {authenticate} from "../middleware/auth";
const router = express.Router();

router.post("/field", CompagneController.addField);
router.get("/field", CompagneController.getFields);

export default router;
