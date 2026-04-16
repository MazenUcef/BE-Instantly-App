import prisma from "../config/prisma";
import { AppError } from "../middlewares/errorHandler";

export const validateFile = (file: Express.Multer.File) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.mimetype)) {
    throw new AppError("Invalid file type", 400);
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new AppError("File too large", 400);
  }
};

export const buildBundlePayload = async (bundleId: string) => {
  const bundle = await prisma.bundle.findUnique({
    where: { id: bundleId },
    include: { governments: { include: { government: true } } },
  });
  if (!bundle) return null;

  const [supplier, category] = await Promise.all([
    prisma.user.findUnique({
      where: { id: bundle.supplierId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profilePicture: true,
        averageRating: true,
        totalReviews: true,
      },
    }),
    prisma.category.findUnique({ where: { id: bundle.categoryId } }),
  ]);

  const governments = bundle.governments
    .map((g) => g.government)
    .filter((g) => g.isActive);

  const { governments: _g, ...bundleRest } = bundle;

  return {
    ...bundleRest,
    supplier,
    category,
    governments,
  };
};
