import express from "express";
import cors from "cors";
import chatRoutes from "./routes/chatRoutes.js";

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.send("✅ Chatbot backend is running...");
});

// Chat API
app.use("/api/chat", chatRoutes);

export default app;
