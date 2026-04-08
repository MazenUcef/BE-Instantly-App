"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const User_model_1 = __importDefault(require("../models/User.model"));
class UserRepository {
    static findByEmail(email, session) {
        return User_model_1.default.findOne({ email: email.toLowerCase().trim() }).session(session || null);
    }
    static findByPhone(phoneNumber, session) {
        return User_model_1.default.findOne({ phoneNumber }).session(session || null);
    }
    static findByEmailOrPhone(email, phoneNumber, session) {
        return User_model_1.default.findOne({
            $or: [{ email: email.toLowerCase().trim() }, { phoneNumber }],
        }).session(session || null);
    }
    static findById(userId, session) {
        return User_model_1.default.findById(userId).session(session || null);
    }
    static createUser(data, session) {
        return User_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static updateById(userId, updates, session) {
        console.log('Repository - Updating user:', userId);
        console.log('Repository - Updates:', updates);
        return User_model_1.default.findByIdAndUpdate(userId, updates, {
            new: true,
            session,
            runValidators: true,
        });
    }
    static deleteById(userId, session) {
        return User_model_1.default.findByIdAndDelete(userId, { session });
    }
    static listUsers() {
        return User_model_1.default.find().sort({ createdAt: -1 });
    }
    static findByBiometricDevice(deviceId) {
        return User_model_1.default.findOne({ "biometrics.deviceId": deviceId });
    }
}
exports.UserRepository = UserRepository;
