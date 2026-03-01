import { AppError } from "../middlewares/errorHandler";

export const validateFile = (file: Express.Multer.File) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.mimetype)) {
    throw new AppError('Invalid file type', 400);
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new AppError('File too large', 400);
  }
};