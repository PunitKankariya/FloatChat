import express from "express";
import { handleChat } from "../controllers/chatController.js";

const router = express.Router();

// This must be POST
router.post("/", handleChat);

export default router;
