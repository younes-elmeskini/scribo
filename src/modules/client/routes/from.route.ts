import express from "express";
import FormController from "../controllers/form.controller";
import { authenticate } from "../middleware/auth";

const router = express.Router();

router.get("/fields", FormController.getAllfields);


export default router;
