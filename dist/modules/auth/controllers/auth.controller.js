"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeDevice = exports.biometricLogin = exports.registerDevice = exports.deleteUser = exports.updateUser = exports.getUserById = exports.getAllUsers = exports.switchRole = exports.resetPassword = exports.verifyResetOTP = exports.forgotPassword = exports.changePassword = exports.logout = exports.refreshToken = exports.login = exports.resendVerificationEmail = exports.verifyEmailOTP = exports.register = void 0;
const auth_service_1 = require("../services/AuthService/auth.service");
const user_service_1 = require("../services/UserService/user.service");
const auth_device_service_1 = require("../services/AuthDeviceService/auth-device.service");
const register = async (req, res) => {
    const result = await auth_service_1.AuthService.register(req);
    return res.status(201).json(result);
};
exports.register = register;
const verifyEmailOTP = async (req, res) => {
    const result = await auth_service_1.AuthService.verifyEmailOTP(req.body.email, req.body.otp);
    return res.json(result);
};
exports.verifyEmailOTP = verifyEmailOTP;
const resendVerificationEmail = async (req, res) => {
    const result = await auth_service_1.AuthService.resendVerificationEmail(req.body.email);
    return res.json(result);
};
exports.resendVerificationEmail = resendVerificationEmail;
const login = async (req, res) => {
    const result = await auth_service_1.AuthService.login(req.body.email, req.body.password);
    return res.json(result);
};
exports.login = login;
const refreshToken = async (req, res) => {
    const result = await auth_service_1.AuthService.refreshToken(req.body.refreshToken);
    return res.json(result);
};
exports.refreshToken = refreshToken;
const logout = async (req, res) => {
    const result = await auth_service_1.AuthService.logout(req.user.userId, req.user.sessionId, req.user.token);
    return res.json(result);
};
exports.logout = logout;
const changePassword = async (req, res) => {
    const result = await auth_service_1.AuthService.changePassword({
        userId: req.user.userId,
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
        sessionId: req.user.sessionId,
    });
    return res.json(result);
};
exports.changePassword = changePassword;
const forgotPassword = async (req, res) => {
    const result = await auth_service_1.AuthService.forgotPassword(req.body.email);
    return res.json(result);
};
exports.forgotPassword = forgotPassword;
const verifyResetOTP = async (req, res) => {
    const result = await auth_service_1.AuthService.verifyResetOTP(req.body.email, req.body.otp);
    return res.json(result);
};
exports.verifyResetOTP = verifyResetOTP;
const resetPassword = async (req, res) => {
    const result = await auth_service_1.AuthService.resetPassword(req.body.token, req.body.password);
    return res.json(result);
};
exports.resetPassword = resetPassword;
const switchRole = async (req, res) => {
    const result = await auth_service_1.AuthService.switchRole({
        userId: req.user.userId,
        currentRole: req.user.role,
        sessionId: req.user.sessionId,
        targetRole: req.body.targetRole,
        categoryId: req.body.categoryId,
        jobs: req.body.jobs,
        governmentIds: req.body.governmentIds,
    });
    return res.json(result);
};
exports.switchRole = switchRole;
const getAllUsers = async (_req, res) => {
    const result = await user_service_1.UserService.getAllUsers();
    return res.status(200).json(result);
};
exports.getAllUsers = getAllUsers;
const getUserById = async (req, res) => {
    const result = await user_service_1.UserService.getUserById(req.params.id);
    return res.status(200).json(result);
};
exports.getUserById = getUserById;
const updateUser = async (req, res) => {
    const result = await user_service_1.UserService.updateUser(req.params.id, req.body);
    return res.status(200).json(result);
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    const result = await user_service_1.UserService.deleteUser(req.params.id);
    return res.status(200).json(result);
};
exports.deleteUser = deleteUser;
const registerDevice = async (req, res) => {
    const result = await auth_device_service_1.AuthDeviceService.registerDevice({
        userId: req.user.userId,
        deviceId: req.body.deviceId,
        type: req.body.type,
        passcode: req.body.passcode,
    });
    return res.status(200).json(result);
};
exports.registerDevice = registerDevice;
const biometricLogin = async (req, res) => {
    const result = await auth_device_service_1.AuthDeviceService.biometricLogin({
        deviceId: req.body.deviceId,
        type: req.body.type,
        passcode: req.body.passcode,
    });
    return res.json(result);
};
exports.biometricLogin = biometricLogin;
const removeDevice = async (req, res) => {
    const result = await auth_device_service_1.AuthDeviceService.removeDevice({
        userId: req.user.userId,
        deviceId: req.body.deviceId,
    });
    return res.json(result);
};
exports.removeDevice = removeDevice;
