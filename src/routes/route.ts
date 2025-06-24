import express from "express";
import authClient from "../modules/client/routes/auth.route";
import compagneClient from "../modules/client/routes/compagne.route";
import formClient from "../modules/client/routes/from.route";
import soumissionClient from "../modules/client/routes/soumission.route";
import formPublic from "../modules/public/routes/form.route";

const router = express.Router();

// client
router.use("/client/auth", authClient);
router.use("/client/compagne", compagneClient);
router.use("/client/form", formClient);
router.use("/client/soumission", soumissionClient);
// public
router.use("/public/form", formPublic);

export default router;
