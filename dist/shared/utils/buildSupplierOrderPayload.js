"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSupplierOrderPayload = void 0;
const User_model_1 = __importDefault(require("../../modules/auth/models/User.model"));
const Category_model_1 = __importDefault(require("../../modules/category/models/Category.model"));
const Government_model_1 = __importDefault(require("../../modules/government/models/Government.model"));
const Order_model_1 = __importDefault(require("../../modules/order/models/Order.model"));
const buildSupplierOrderPayload = async (orderId) => {
    const order = await Order_model_1.default.findById(orderId)
        .populate({
        path: "governmentId",
        select: "name nameAr country isActive",
        model: Government_model_1.default,
    })
        .populate({
        path: "categoryId",
        select: "name description icon jobs",
        model: Category_model_1.default,
    });
    if (!order)
        return null;
    const customer = await User_model_1.default.findById(order.customerId).select("-password -refreshToken -biometrics");
    const orderObj = order.toObject();
    const populatedCategory = orderObj.categoryId;
    const populatedGovernment = orderObj.governmentId;
    const { jobs, ...categoryWithoutJobs } = populatedCategory || { jobs: [] };
    const { categoryId, governmentId, ...rest } = orderObj;
    return {
        ...rest,
        customer: customer || null,
        government: populatedGovernment || null,
        category: categoryWithoutJobs || null,
    };
};
exports.buildSupplierOrderPayload = buildSupplierOrderPayload;
