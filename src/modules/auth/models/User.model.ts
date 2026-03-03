import mongoose, { Schema } from "mongoose";
import { IUser } from "../../../shared/types";

const UserSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },

    email: { type: String, required: true, unique: true },
    phoneNumber: { type: String, required: true, unique: true },

    password: { type: String, required: true },

    role: {
      type: String,
      enum: ["customer", "supplier", "admin"],
      default: "customer",
    },

    categoryId: {
      type: Schema.Types.ObjectId,
      required: false,
      default: null,
    },

    profilePicture: String,

    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    isProfileComplete: { type: Boolean, default: false },

    refreshToken: String,

    biometrics: [
      {
        deviceId: { type: String, required: true },
        type: {
          type: String,
          enum: ["faceid", "fingerprint", "passcode"],
          required: true,
        },
        passcodeHash: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    averageRating: {
      type: Number,
      default: 0,
    },

    totalReviews: {
      type: Number,
      default: 0,
    },

    jobTitle: {
      type: String,
      required: false,
      default: null,
    },

    reviews: [
      {
        reviewerId: String,
        reviewerName: String,
        rating: Number,
        comment: String,
        createdAt: Date,
      },
    ],
  },
  { timestamps: true },
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ phoneNumber: 1 }, { unique: true });

export default mongoose.model<IUser>("User", UserSchema);
