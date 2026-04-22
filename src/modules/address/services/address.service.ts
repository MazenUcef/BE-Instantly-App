import prisma from "../../../shared/config/prisma";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { AddressRepository } from "../repositories/address.repository";
import { AddressType } from "@prisma/client";

const parseCoord = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new AppError("Latitude and longitude must be valid numbers", 400);
  }
  return num;
};

export class AddressService {
  static async createAddress(params: {
    userId: string;
    type: AddressType;
    label?: string | null;
    address: string;
    latitude?: unknown;
    longitude?: unknown;
  }) {
    const { userId, type, label, address } = params;
    const latitude = parseCoord(params.latitude) ?? null;
    const longitude = parseCoord(params.longitude) ?? null;

    const created = await prisma.$transaction(async (tx) => {
      if (type === AddressType.home || type === AddressType.work) {
        const existing = await AddressRepository.findByUserAndType(userId, type, tx);
        if (existing) {
          throw new AppError(`You already have a ${type} address saved`, 409);
        }
      }

      return AddressRepository.create(
        {
          userId,
          type,
          label: label?.trim() || null,
          address: address.trim(),
          latitude,
          longitude,
        },
        tx,
      );
    });

    return {
      success: true,
      message: "Address saved successfully",
      data: created,
    };
  }

  static async getUserAddresses(userId: string, type?: AddressType) {
    const addresses = await AddressRepository.findByUser(userId, type);
    return {
      success: true,
      count: addresses.length,
      data: addresses,
    };
  }

  static async getAddressById(userId: string, id: string) {
    const address = await AddressRepository.findById(id);
    if (!address || address.userId !== userId) {
      throw new AppError("Address not found", 404);
    }
    return {
      success: true,
      data: address,
    };
  }

  static async updateAddress(params: {
    userId: string;
    id: string;
    type?: AddressType;
    label?: string | null;
    address?: string;
    latitude?: unknown;
    longitude?: unknown;
  }) {
    const { userId, id } = params;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await AddressRepository.findById(id, tx);
      if (!existing || existing.userId !== userId) {
        throw new AppError("Address not found", 404);
      }

      const updates: any = {};

      if (params.type !== undefined && params.type !== existing.type) {
        if (params.type === AddressType.home || params.type === AddressType.work) {
          const clash = await AddressRepository.findByUserAndType(
            userId,
            params.type,
            tx,
          );
          if (clash && clash.id !== id) {
            throw new AppError(
              `You already have a ${params.type} address saved`,
              409,
            );
          }
        }
        updates.type = params.type;
      }

      if (params.label !== undefined) {
        updates.label = params.label?.trim() || null;
      }
      if (params.address !== undefined) {
        updates.address = params.address.trim();
      }

      const lat = parseCoord(params.latitude);
      if (lat !== undefined) updates.latitude = lat;

      const lng = parseCoord(params.longitude);
      if (lng !== undefined) updates.longitude = lng;

      return AddressRepository.updateById(id, updates, tx);
    });

    return {
      success: true,
      message: "Address updated successfully",
      data: updated,
    };
  }

  static async deleteAddress(userId: string, id: string) {
    const existing = await AddressRepository.findById(id);
    if (!existing || existing.userId !== userId) {
      throw new AppError("Address not found", 404);
    }
    await AddressRepository.deleteById(id);
    return {
      success: true,
      message: "Address deleted successfully",
    };
  }
}
