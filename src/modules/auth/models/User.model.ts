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

    address:{type: String, required: true },

    governmentIds: [{
      type: Schema.Types.ObjectId,
      ref: "Government",
      required: false,
    }],

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

    jobTitles: {
      type: [String],
      required: false,
      default: [],
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

UserSchema.index({ governmentIds: 1 });

export default mongoose.model<IUser>("User", UserSchema);
