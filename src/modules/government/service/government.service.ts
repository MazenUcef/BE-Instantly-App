import mongoose from "mongoose";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { publishToQueue } from "../../../shared/config/rabbitmq";
import { GOVERNMENT_QUEUE_EVENTS } from "../../../shared/constants/government.constants";
import { GovernmentRepository } from "../repository/government.repository";

const normalizeText = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

export class GovernmentService {
  static async createGovernment(input: {
    name: string;
    nameAr: string;
    country?: string;
    order?: number;
  }) {
    const dbSession = await mongoose.startSession();
    let createdGovernment: any = null;

    try {
      await dbSession.withTransaction(async () => {
        const normalizedName = normalizeText(input.name);
        const normalizedNameAr = normalizeText(input.nameAr);

        const existingGovernment = await GovernmentRepository.findByNormalizedNames(
          normalizedName,
          normalizedNameAr,
          dbSession,
        );

        if (existingGovernment) {
          throw new AppError("Government already exists", 409);
        }

        createdGovernment = await GovernmentRepository.create(
          {
            name: input.name.trim(),
            nameAr: input.nameAr.trim(),
            normalizedName,
            normalizedNameAr,
            country: input.country?.trim() || "Egypt",
            order: input.order ?? 0,
            isActive: true,
          },
          dbSession,
        );
      });
    } finally {
      await dbSession.endSession();
    }

    await publishToQueue(GOVERNMENT_QUEUE_EVENTS.CREATED, {
      governmentId: createdGovernment._id.toString(),
      name: createdGovernment.name,
      nameAr: createdGovernment.nameAr,
      country: createdGovernment.country,
      order: createdGovernment.order,
    });

    return {
      success: true,
      message: "Government created successfully",
      data: createdGovernment,
    };
  }

  static async getAllGovernments() {
    const governments = await GovernmentRepository.findActive();

    return {
      success: true,
      count: governments.length,
      data: governments,
    };
  }

  static async getAllGovernmentsAdmin() {
    const governments = await GovernmentRepository.findAll();

    return {
      success: true,
      count: governments.length,
      data: governments,
    };
  }

  static async getGovernmentById(governmentId: string) {
    const government = await GovernmentRepository.findById(governmentId);

    if (!government) {
      throw new AppError("Government not found", 404);
    }

    return {
      success: true,
      data: government,
    };
  }

  static async updateGovernment(
    governmentId: string,
    input: {
      name?: string;
      nameAr?: string;
      country?: string;
      order?: number;
      isActive?: boolean;
    },
  ) {
    const dbSession = await mongoose.startSession();
    let updatedGovernment: any = null;

    try {
      await dbSession.withTransaction(async () => {
        const government = await GovernmentRepository.findById(governmentId, dbSession);

        if (!government) {
          throw new AppError("Government not found", 404);
        }

        const updates: Record<string, any> = {};

        const nextName = input.name?.trim() ?? government.name;
        const nextNameAr = input.nameAr?.trim() ?? government.nameAr;

        const normalizedName = normalizeText(nextName);
        const normalizedNameAr = normalizeText(nextNameAr);

        if (
          normalizedName !== government.normalizedName ||
          normalizedNameAr !== government.normalizedNameAr
        ) {
          const existing = await GovernmentRepository.findByNormalizedNames(
            normalizedName,
            normalizedNameAr,
            dbSession,
          );

          if (existing && existing._id.toString() !== governmentId) {
            throw new AppError("Government name already exists", 409);
          }
        }

        if (input.name !== undefined) {
          updates.name = nextName;
          updates.normalizedName = normalizedName;
        }

        if (input.nameAr !== undefined) {
          updates.nameAr = nextNameAr;
          updates.normalizedNameAr = normalizedNameAr;
        }

        if (input.country !== undefined) {
          updates.country = input.country.trim();
        }

        if (input.order !== undefined) {
          updates.order = input.order;
        }

        if (input.isActive !== undefined) {
          updates.isActive = input.isActive;
        }

        updatedGovernment = await GovernmentRepository.updateById(
          governmentId,
          updates,
          dbSession,
        );
      });
    } finally {
      await dbSession.endSession();
    }

    await publishToQueue(GOVERNMENT_QUEUE_EVENTS.UPDATED, {
      governmentId: updatedGovernment._id.toString(),
      name: updatedGovernment.name,
      nameAr: updatedGovernment.nameAr,
      country: updatedGovernment.country,
      order: updatedGovernment.order,
      isActive: updatedGovernment.isActive,
    });

    return {
      success: true,
      message: "Government updated successfully",
      data: updatedGovernment,
    };
  }

  static async deleteGovernment(governmentId: string) {
    const government = await GovernmentRepository.findById(governmentId);

    if (!government) {
      throw new AppError("Government not found", 404);
    }

    if (!government.isActive) {
      throw new AppError("Government is already inactive", 400);
    }

    const updatedGovernment = await GovernmentRepository.updateById(governmentId, {
      isActive: false,
    });

    await publishToQueue(GOVERNMENT_QUEUE_EVENTS.DEACTIVATED, {
      governmentId: updatedGovernment!._id.toString(),
      name: updatedGovernment!.name,
      nameAr: updatedGovernment!.nameAr,
      isActive: updatedGovernment!.isActive,
    });

    return {
      success: true,
      message: "Government deactivated successfully",
    };
  }

  static async toggleGovernmentStatus(governmentId: string) {
    const government = await GovernmentRepository.findById(governmentId);

    if (!government) {
      throw new AppError("Government not found", 404);
    }

    const updatedGovernment = await GovernmentRepository.updateById(governmentId, {
      isActive: !government.isActive,
    });

    await publishToQueue(
      updatedGovernment!.isActive
        ? GOVERNMENT_QUEUE_EVENTS.ACTIVATED
        : GOVERNMENT_QUEUE_EVENTS.DEACTIVATED,
      {
        governmentId: updatedGovernment!._id.toString(),
        name: updatedGovernment!.name,
        nameAr: updatedGovernment!.nameAr,
        isActive: updatedGovernment!.isActive,
      },
    );

    return {
      success: true,
      message: `Government ${updatedGovernment!.isActive ? "activated" : "deactivated"} successfully`,
      data: updatedGovernment,
    };
  }
}