import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
dotenv.config();

const app = express();

// Middleware
app.use(express.json());

app.use(cookieParser());

app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Set-Cookie"],
  })
);

app.use("/api/uploads", express.static(path.join(__dirname, "uploads")));

app.disable("x-powered-by");

app.use(helmet());
app.set("trust proxy", 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
});

app.use(limiter);
// routes
import routes from "./routes/route";
app.use("/api", routes);


export default app;
