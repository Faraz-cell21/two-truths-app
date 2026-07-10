import { Schema, models, model } from "mongoose";

const AdminSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: false }
);

export const AdminModel = models.Admin || model("Admin", AdminSchema);
