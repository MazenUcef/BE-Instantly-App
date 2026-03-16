import dotenv from "dotenv";
import express, { NextFunction, Response, Request,ErrorRequestHandler } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createServer } from "http";
import morgan from "morgan";
import connectDB from "./shared/config/database";
import { initSocket } from "./shared/config/socket";
import authRoutes from "./modules/auth/routes/auth.routes";
import categoryRoutes from "./modules/category/routes/category.routes";
import chatRoutes from "./modules/chat/routes/chat.routes";
import governmentRoutes from "./modules/government/routes/Government.routes";
import notificationRoutes from "./modules/notification/routes/notifications.routes";
import offerRoutes from "./modules/offer/routes/offer.routes";
import orderRoutes from "./modules/order/routes/order.routes";
import reviewRoutes from "./modules/review/routes/review.routes";
import sessionRoutes from "./modules/session/routes/session.routes";

dotenv.config();

const app = express();
const server = createServer(app);
initSocket(server);

connectDB();

app.use(morgan("dev"));
app.use(helmet());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 100 : 1000,
});
app.use(limiter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.status(200).json({
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/governments", governmentRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/sessions", sessionRoutes);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);

  console.error(err.stack);

  res.status(err.status || 500).json({
    message: err.message || "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

export { app, server };
