import UserModel from "../../modules/auth/models/User.model";
import categoryModel from "../../modules/category/models/category.model";
import governmentModel from "../../modules/government/models/government.model";
import orderModel from "../../modules/order/models/order.model";


export const buildSupplierOrderPayload = async (orderId: string) => {
  const order = await orderModel.findById(orderId)
    .populate({
      path: "governmentId",
      select: "name nameAr country isActive",
      model: governmentModel,
    })
    .populate({
      path: "categoryId",
      select: "name description icon jobs",
      model: categoryModel,
    });

  if (!order) return null;

  const customer = await UserModel.findById(order.customerId).select(
    "-password -refreshToken -biometrics",
  );

  const orderObj = order.toObject();

  const populatedCategory = orderObj.categoryId as any;
  const populatedGovernment = orderObj.governmentId as any;

  const { jobs, ...categoryWithoutJobs } = populatedCategory || { jobs: [] };

  const { categoryId, governmentId, ...rest } = orderObj;

  return {
    ...rest,
    customer: customer || null,
    government: populatedGovernment || null,
    category: categoryWithoutJobs || null,
  };
};