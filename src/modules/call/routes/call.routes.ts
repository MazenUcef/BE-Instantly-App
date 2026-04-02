import { Router } from "express";
import { authenticate } from "../../../shared/middlewares/auth";
import {
  startCall,
  acceptCall,
  declineCall,
  endCall,
  markMissedCall,
  getSessionCallHistory,
  getIceConfig,
} from "../controllers/call.controller";
import {
  validateCallIdParam,
  validateSessionIdParam,
  validateStartCall,
} from "../validators/call.validation";

const router = Router();

router.get("/ice-config", authenticate, getIceConfig);

router.get(
  "/session/:sessionId/history",
  authenticate,
  validateSessionIdParam,
  getSessionCallHistory,
);

router.post("/start", authenticate, validateStartCall, startCall);

router.post("/:id/accept", authenticate, validateCallIdParam, acceptCall);

router.post("/:id/decline", authenticate, validateCallIdParam, declineCall);

router.post("/:id/end", authenticate, validateCallIdParam, endCall);

router.post("/:id/missed", authenticate, validateCallIdParam, markMissedCall);

export default router;
