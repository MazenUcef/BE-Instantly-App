import { Document, Types } from "mongoose";
import { Request } from 'express';

export interface ICategory extends Document {
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUser {
  _id: string;
  firstName: string;
  profilePicture: string;
  lastName: string;
  email: string;
  password: string;
  role: 'customer' | 'supplier' | 'admin';
  isProfileComplete: boolean;
  address: string;
  categoryId: Types.ObjectId;
  nationalId: string;
  jobTitle?: string | null;
  phoneNumber: string;
  nationalIdPhotoFront?: string;
  nationalIdPhotoBack?: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
  biometrics?: Array<{
    deviceId: string;
    type: 'faceid' | 'fingerprint' | 'passcode';
    passcodeHash?: string;
    createdAt: Date;
  }>;
  averageRating?: number;
  totalReviews?: number;
  reviews?: Array<{
    reviewerId: string;
    reviewerName: string;
    rating: number;
    comment: string;
    createdAt: Date;
  }>;
}

export interface ITokenPayload {
  userId: string;
  role: string;
  sessionId?: string;
  iat?: number;
  exp?: number;
}

export interface IAuthRequest extends Request {
  user?: ITokenPayload;
}