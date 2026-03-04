import { Request, Response } from "express";
import Order from "../models/Order.model";
import { getIO } from "../../../shared/config/socket";
import sessionModel from "../../session/models/session.model";
import UserModel from "../../auth/models/User.model";
import { publishNotification } from "../../notification/notification.publisher";
import OfferModel from "../../offer/models/Offer.model";
import GovernmentModel from "../../government/models/Government.model";
import CategoryModel from "../../category/models/Category.model";
import mongoose from "mongoose";

export const createOrder = async (req: any, res: Response) => {
  try {
    const {
      address,
      description,
      categoryId,
      governmentId,
      requestedPrice,
      timeToStart,
      jobTitle,
    } = req.body;
    const { userId, name } = req.user;

    if (!requestedPrice || requestedPrice <= 0) {
      return res.status(400).json({ message: "Price is required" });
    }

    if (!governmentId) {
      return res.status(400).json({ message: "Government is required" });
    }

    if (!jobTitle) {
      return res.status(400).json({ message: "Job title is required" });
    }

    const government = await GovernmentModel.findById(governmentId);
    if (!government) {
      return res.status(400).json({ message: "Invalid government" });
    }

    const category = await CategoryModel.findById(categoryId);
    if (!category) {
      return res.status(400).json({ message: "Invalid category" });
    }

    if (!category.jobs || !category.jobs.includes(jobTitle)) {
      return res.status(400).json({
        message: "Invalid job title for this category",
        availableJobTitles: category.jobs,
      });
    }

    const existingOrder = await Order.findOne({
      customerId: userId,
      status: { $in: ["pending", "in_progress"] },
    });

    if (existingOrder) {
      return res.status(400).json({
        message:
          "You already have an active order. Please complete it before creating a new one.",
      });
    }

    const unfinishedReview = await Order.findOne({
      customerId: userId,
      status: "completed",
      customerReviewed: false,
    }).sort({ createdAt: -1 });

    if (unfinishedReview) {
      try {
        const session = await sessionModel.findOne({
          orderId: unfinishedReview._id,
        });

        let supplierData = null;
        if (session) {
          supplierData = await UserModel.findById(session.supplierId).select(
            "-password",
          );
        }

        return res.status(403).json({
          message: "You have to review and rate your last order",
          reviewRequired: true,
          order: {
            ...unfinishedReview.toObject(),
            supplier: supplierData,
          },
        });
      } catch (error) {
        console.log("error", error);
        return res.status(403).json({
          reviewRequired: true,
          order: unfinishedReview,
        });
      }
    }

    const order = await Order.create({
      customerId: userId,
      customerName: name,
      address,
      description,
      categoryId: new mongoose.Types.ObjectId(categoryId),
      governmentId: new mongoose.Types.ObjectId(governmentId),
      jobTitle,
      requestedPrice,
      timeToStart,
      status: "pending",
    });

    const populatedOrder = await Order.findById(order._id)
      .populate({
        path: "governmentId",
        select: "name nameAr country isActive",
        model: GovernmentModel,
      })
      .populate({
        path: "categoryId",
        select: "name",
        model: CategoryModel,
      })
      .lean();

    const io = getIO();
    io.to(`category_${categoryId}_government_${governmentId}`).emit(
      "new_order",
      populatedOrder,
    );

    const responseData = {
      ...populatedOrder,
      selectedJobTitle: jobTitle,
    };

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ message: "Failed to create order" });
  }
};

export const updateOrderPrice = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { requestedPrice } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.customerId !== req.user.userId)
      return res.status(403).json({ message: "Not allowed" });

    if (order.status !== "pending")
      return res.status(400).json({ message: "Cannot update price now" });

    order.requestedPrice = requestedPrice;
    await order.save();

    const io = getIO();
    io.to(`category_${order.categoryId}`).emit("order_price_updated", order);

    res.json({ message: "Price updated", order });
  } catch (error) {
    console.error("Update order price error:", error);
    res.status(500).json({ message: "Failed to update price" });
  }
};

export const deleteOrder = async (req: any, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.customerId !== req.user.userId)
      return res.status(403).json({ message: "Not allowed" });

    const pendingOffers = await OfferModel.find({
      orderId: order._id,
      status: "pending",
    });

    const io = getIO();

    for (const offer of pendingOffers) {
      io.to(`user_${offer.supplierId}`).emit("offer_rejected", {
        orderId: order._id,
        reason: "Order deleted by customer",
      });

      await publishNotification({
        userId: offer.supplierId.toString(),
        type: "OFFER_REJECTED",
        title: "Offer Rejected",
        message: `Your offer for order #${order._id} has been rejected because the order was deleted.`,
        data: {
          offerId: offer._id.toString(),
          orderId: order._id.toString(),
        },
      });
    }

    await OfferModel.updateMany(
      { orderId: order._id, status: "pending" },
      { status: "rejected" },
    );

    await order.deleteOne();

    res.json({ message: "Order deleted and offers rejected" });
  } catch (error) {
    console.error("Delete order error:", error);
    res.status(500).json({ message: "Failed to delete order" });
  }
};

export const getActiveOrdersByCategory = async (req: any, res: Response) => {
  try {
    const supplierCategoryId = req.user.categoryId;
    const supplierGovernmentIds = req.user.governmentIds || [];
    const userId = req.user.userId;

    console.log("Supplier Info:", {
      categoryId: supplierCategoryId,
      governmentIds: supplierGovernmentIds,
      userId,
    });

    if (!supplierGovernmentIds || supplierGovernmentIds.length === 0) {
      return res.json({
        type: "available_orders",
        count: 0,
        orders: [],
        message: "No active orders for now",
      });
    }

    const activeOffer = await OfferModel.findOne({
      supplierId: userId,
      status: { $in: ["pending", "accepted"] },
    }).sort({ createdAt: -1 });

    if (activeOffer) {
      const activeOrder = await Order.findById(activeOffer.orderId)
        .populate("governmentId", "name nameAr country")
        .populate("categoryId", "name");

      if (!activeOrder) {
        return res.status(404).json({
          message: "Active order not found",
        });
      }

      return res.json({
        type: "active_job",
        order: activeOrder,
      });
    }

    const orders = await Order.find({
      categoryId: supplierCategoryId,
      governmentId: { $in: supplierGovernmentIds },
      status: "pending",
      customerId: { $ne: userId },
    })
      .populate({
        path: "governmentId",
        select: "name nameAr country isActive",
        model: GovernmentModel,
      })
      .populate({
        path: "categoryId",
        select: "name description icon jobs",
        model: CategoryModel,
      })
      .sort({ createdAt: -1 });

    console.log(
      `Found ${orders.length} orders matching category and government`,
    );

    const enrichedOrders = await Promise.all(
      orders.map(async (order) => {
        try {
          const customer = await UserModel.findById(order.customerId).select(
            "-password -refreshToken -biometrics",
          );

          const orderObj = order.toObject();
          const { categoryId, ...rest } = orderObj;
          const populatedCategory = orderObj.categoryId as any;
          const {jobs, ...categoryWithoutJobs} = populatedCategory || { jobs: [] };
          return {
            ...rest,
            customer: customer || null,
            government: orderObj.governmentId,
            category: categoryWithoutJobs,
          };
        } catch (err) {
          console.error("Failed to fetch customer data:", err);
          return order;
        }
      }),
    );

    return res.json({
      type: "available_orders",
      count: orders.length,
      orders: enrichedOrders,
    });
  } catch (error) {
    console.log("Get active orders error:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

export const getOrderDetails = async (req: any, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ message: "Order not found" });

    if (req.user.role === "supplier") {
      if (
        order.categoryId !== req.user.categoryId ||
        order.customerId === req.user.userId
      ) {
        return res.status(403).json({ message: "Not allowed" });
      }
    }

    if (req.user.role === "customer") {
      if (order.customerId !== req.user.userId) {
        return res.status(403).json({ message: "Not allowed" });
      }
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch order details" });
  }
};

export const getCustomerOrderHistory = async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;

    const orders = await Order.find({ customerId: userId }).sort({
      createdAt: -1,
    });

    res.json({
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.log("Get customer order history error:", error);
    res.status(500).json({ message: "Failed to fetch order history" });
  }
};
