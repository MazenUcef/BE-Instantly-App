import { Request, Response } from "express";
import { AuthService } from "../services/AuthService/auth.service";
import { UserService } from "../services/UserService/user.service";
import { AuthDeviceService } from "../services/AuthDeviceService/auth-device.service";

export const register = async (req: Request, res: Response) => {
  const result = await AuthService.register(req);
  return res.status(201).json(result);
};

export const verifyEmailOTP = async (req: Request, res: Response) => {
  const result = await AuthService.verifyEmailOTP(req.body.email, req.body.otp);
  return res.json(result);
};

export const resendVerificationEmail = async (req: Request, res: Response) => {
  const result = await AuthService.resendVerificationEmail(req.body.email);
  return res.json(result);
};

export const login = async (req: Request, res: Response) => {
  const result = await AuthService.login(req.body.email, req.body.password);
  return res.json(result);
};

export const refreshToken = async (req: Request, res: Response) => {
  const result = await AuthService.refreshToken(req.body.refreshToken);
  return res.json(result);
};

export const logout = async (req: any, res: Response) => {
  const result = await AuthService.logout(
    req.user.userId,
    req.user.sessionId,
    req.user.token,
  );
  return res.json(result);
};

export const changePassword = async (req: any, res: Response) => {
  const result = await AuthService.changePassword({
    userId: req.user.userId,
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
    sessionId: req.user.sessionId,
  });

  return res.json(result);
};

export const forgotPassword = async (req: Request, res: Response) => {
  const result = await AuthService.forgotPassword(req.body.email);
  return res.json(result);
};

export const verifyResetOTP = async (req: Request, res: Response) => {
  const result = await AuthService.verifyResetOTP(req.body.email, req.body.otp);
  return res.json(result);
};

export const resetPassword = async (req: Request, res: Response) => {
  const result = await AuthService.resetPassword(
    req.body.token,
    req.body.password,
  );
  return res.json(result);
};

export const switchRole = async (req: any, res: Response) => {
  const result = await AuthService.switchRole({
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

export const getAllUsers = async (_req: Request, res: Response) => {
  const result = await UserService.getAllUsers();
  return res.status(200).json(result);
};

export const getUserById = async (req: Request, res: Response) => {
  const result = await UserService.getUserById(req.params.id as string);
  return res.status(200).json(result);
};

export const updateUser = async (req: Request, res: Response) => {
  const result = await UserService.updateUser(
    req.params.id as string,
    req.body,
  );
  return res.status(200).json(result);
};

export const deleteUser = async (req: Request, res: Response) => {
  const result = await UserService.deleteUser(req.params.id as string);
  return res.status(200).json(result);
};

export const registerDevice = async (req: any, res: Response) => {
  const result = await AuthDeviceService.registerDevice({
    userId: req.user.userId,
    deviceId: req.body.deviceId,
    type: req.body.type,
    passcode: req.body.passcode,
  });

  return res.status(200).json(result);
};

export const biometricLogin = async (req: Request, res: Response) => {
  const result = await AuthDeviceService.biometricLogin({
    deviceId: req.body.deviceId,
    type: req.body.type,
    passcode: req.body.passcode,
  });

  return res.json(result);
};

export const removeDevice = async (req: any, res: Response) => {
  const result = await AuthDeviceService.removeDevice({
    userId: req.user.userId,
    deviceId: req.body.deviceId,
  });

  return res.json(result);
};
