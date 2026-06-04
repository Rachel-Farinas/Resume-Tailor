import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import resumeRouter from "./routes/resume.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
// 5mb so base64-encoded LinkedIn PDF uploads (~33% larger than the file) fit.
app.use(express.json({ limit: "5mb" }));

app.use("/api/resume", resumeRouter);

// Serve the client so everything runs from one origin (http://localhost:3000).
app.use(express.static(path.join(__dirname, "..", "client")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
