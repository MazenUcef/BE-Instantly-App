import { Response } from "express";
import { AddressType } from "@prisma/client";
import { IAuthRequest } from "../../../shared/types";
import { AddressService } from "../services/address.service";
 
export const createAddress = async (req: IAuthRequest, res: Response) => {
  const result = await AddressService.createAddress({
    userId: req.user!.userId,
    type: req.body.type,
    label: req.body.label,
    address: req.body.address,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
  });
  return res.status(201).json(result);
};

export const getUserAddresses = async (req: IAuthRequest, res: Response) => {
  const type = req.query.type as AddressType | undefined;
  const result = await AddressService.getUserAddresses(req.user!.userId, type);
  return res.status(200).json(result);
};

export const getAddressById = async (req: IAuthRequest, res: Response) => {
  const result = await AddressService.getAddressById(
    req.user!.userId,
    req.params.id as string,
  );
  return res.status(200).json(result);
};

export const updateAddress = async (req: IAuthRequest, res: Response) => {
  const result = await AddressService.updateAddress({
    userId: req.user!.userId,
    id: req.params.id as string,
    type: req.body.type,
    label: req.body.label,
    address: req.body.address,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
  });
  return res.status(200).json(result);
};

export const deleteAddress = async (req: IAuthRequest, res: Response) => {
  const result = await AddressService.deleteAddress(
    req.user!.userId,
    req.params.id as string,
  );
  return res.status(200).json(result);
};
