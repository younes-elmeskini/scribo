import express from "express";
import authClient from "../modules/client/routes/auth.route";
import compagneClient from "../modules/client/routes/compagne.route";
import formClient from "../modules/client/routes/from.route";

const router = express.Router();

// client
router.use("/client/auth", authClient);
router.use("/client/compagne", compagneClient);
router.use("/client/form", formClient);


export default router;
