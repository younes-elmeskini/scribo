import express from "express";
import AuthController from "../controllers/auth.controller";
import {authenticate} from "../middleware/auth";

const router = express.Router();

router.post("/register", AuthController.createUser);
router.post("/login", AuthController.login);
router.get("/me", authenticate, AuthController.clientData);
router.post("/logout", AuthController.logout);

export default router;
