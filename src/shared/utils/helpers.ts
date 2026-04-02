import UserModel from "../../modules/auth/models/User.model";
import bundleModel from "../../modules/bundle/models/bundle.model";
import CategoryModel from "../../modules/category/models/category.model";
import GovernmentModel from "../../modules/government/models/government.model";
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



export const buildBundlePayload = async (bundleId: string) => {
  const bundle = await bundleModel.findById(bundleId).lean();
  if (!bundle) return null;

  const [supplier, category, governments] = await Promise.all([
    UserModel.findById(bundle.supplierId)
      .select("-password -refreshToken -biometrics")
      .lean(),
    CategoryModel.findById(bundle.categoryId).lean(),
    GovernmentModel.find({
      _id: { $in: bundle.governmentIds || [] },
      isActive: true,
    }).lean(),
  ]);

  return {
    ...bundle,
    supplier,
    category,
    governments,
  };
};