import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createServer } from 'http';
import morgan from 'morgan';
import connectDB from './shared/config/database';
import { initSocket } from './shared/config/socket';
import authRoutes from './modules/auth/routes/auth.routes';
import categoryRoutes from './modules/category/routes/category.routes';

dotenv.config();

const app = express();
const server = createServer(app);
initSocket(server);


connectDB();

app.use(morgan("dev"));
app.use(helmet());

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.status(200).json({
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/api/auth',authRoutes)
app.use('/api/categories',categoryRoutes)

app.use((err: any, req: any, res: any, next: any) => {
  if (res.headersSent) return next(err);

  console.error(err.stack);

  res.status(err.status || 500).json({
    message: err.message || 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export { app, server };