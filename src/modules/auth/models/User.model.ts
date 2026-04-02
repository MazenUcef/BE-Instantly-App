import mongoose, { Schema, Types, Document } from "mongoose";
import { AUTH_ROLES, BIOMETRIC_TYPES } from "../../../shared/constants/auth.constants";

export interface IUserBiometric {
  deviceId: string;
  type: (typeof BIOMETRIC_TYPES)[keyof typeof BIOMETRIC_TYPES];
  passcodeHash?: string | null;
  createdAt: Date;
}

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  role: (typeof AUTH_ROLES)[keyof typeof AUTH_ROLES];

  categoryId?: Types.ObjectId | null;
  address: string;
  governmentIds: Types.ObjectId[];

  profilePicture?: string | null;

  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isProfileComplete: boolean;

  biometrics: IUserBiometric[];

  averageRating: number;
  totalReviews: number;

  jobTitles: string[];

  createdAt: Date;
  updatedAt: Date;
}

const UserBiometricSchema = new Schema<IUserBiometric>(
  {
    deviceId: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: Object.values(BIOMETRIC_TYPES),
      required: true,
    },
    passcodeHash: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const UserSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    password: { type: String, required: true },

    role: {
      type: String,
      enum: Object.values(AUTH_ROLES),
      default: AUTH_ROLES.CUSTOMER,
      index: true,
    },

    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    governmentIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Government",
      },
    ],

    profilePicture: {
      type: String,
      default: null,
      required: true,
    },

    isEmailVerified: { type: Boolean, default: false, index: true },
    isPhoneVerified: { type: Boolean, default: false },
    isProfileComplete: { type: Boolean, default: false, index: true },

    biometrics: {
      type: [UserBiometricSchema],
      default: [],
    },

    averageRating: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalReviews: {
      type: Number,
      default: 0,
      min: 0,
    },

    jobTitles: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

UserSchema.index({ governmentIds: 1, role: 1 });
UserSchema.index({ role: 1, categoryId: 1 });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ phoneNumber: 1 }, { unique: true });
UserSchema.index({ "biometrics.deviceId": 1 });

export default mongoose.model<IUser>("User", UserSchema);