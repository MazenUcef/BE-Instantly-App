import { Request } from "express";

export interface ICategory {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUser {
  id: string;
  firstName: string;
  profilePicture: string;
  lastName: string;
  email: string;
  password: string;
  role: "customer" | "supplier" | "admin";
  isProfileComplete: boolean;
  address: string;
  categoryId: string | null;
  governmentIds?: string[];
  jobTitles?: string[];
  phoneNumber: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  biometrics?: Array<{
    deviceId: string;
    type: "faceid" | "fingerprint" | "passcode";
    passcodeHash?: string;
    createdAt: Date;
  }>;
  averageRating?: number;
  totalReviews?: number;
}

export interface ITokenPayload {
  userId: string;
  role: string;
  sessionId?: string;
  token?: string;
  iat?: number;
  exp?: number;
}

export interface IAuthRequest extends Request {
  user?: ITokenPayload;
}
