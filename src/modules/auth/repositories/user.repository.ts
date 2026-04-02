import mongoose, { ClientSession, Types } from "mongoose";
import UserModel, { IUser } from "../models/User.model";

export class UserRepository {
  static findByEmail(email: string, session?: ClientSession) {
    return UserModel.findOne({ email: email.toLowerCase().trim() }).session(session || null);
  }

  static findByPhone(phoneNumber: string, session?: ClientSession) {
    return UserModel.findOne({ phoneNumber }).session(session || null);
  }

  static findByEmailOrPhone(email: string, phoneNumber: string, session?: ClientSession) {
    return UserModel.findOne({
      $or: [{ email: email.toLowerCase().trim() }, { phoneNumber }],
    }).session(session || null);
  }

  static findById(userId: string | Types.ObjectId, session?: ClientSession) {
    return UserModel.findById(userId).session(session || null);
  }

  static createUser(data: Partial<IUser>, session?: ClientSession) {
    return UserModel.create([data], { session }).then((docs) => docs[0]);
  }

  static updateById(
    userId: string | Types.ObjectId,
    updates: Record<string, any>,
    session?: ClientSession,
  ) {
    console.log('Repository - Updating user:', userId);
    console.log('Repository - Updates:', updates);
    return UserModel.findByIdAndUpdate(userId, updates, {
      new: true,
      session,
      runValidators: true,
    });
  }

  static deleteById(userId: string | Types.ObjectId, session?: ClientSession) {
    return UserModel.findByIdAndDelete(userId, { session });
  }

  static listUsers() {
    return UserModel.find().sort({ createdAt: -1 });
  }

  static findByBiometricDevice(deviceId: string) {
    return UserModel.findOne({ "biometrics.deviceId": deviceId });
  }
}