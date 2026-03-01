import { Router } from "express";
import { createReview } from "../controllers/review.controller";

const router = Router();

router.post("/", createReview);

export default router;