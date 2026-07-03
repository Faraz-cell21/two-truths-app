import { Schema, models, model } from "mongoose";

const PlayerSchema = new Schema(
  {
    sessionId: { type: String, required: true },
    displayName: { type: String, required: true },
    joinedAt: { type: Date, required: true, default: Date.now },
    connected: { type: Boolean, required: true, default: true },
    score: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const RoomSchema = new Schema(
  {
    roomCode: { type: String, required: true, unique: true },
    mode: { type: String, enum: ["random", "private"], required: true },
    targetSize: { type: Number, enum: [2, 3, 4, 5], required: true },
    status: {
      type: String,
      enum: ["waiting", "playing", "finished"],
      required: true,
      default: "waiting",
    },
    currentRound: { type: Number, required: true, default: 0 },
    players: { type: [PlayerSchema], required: true, default: [] },
    createdAt: { type: Date, required: true, default: Date.now },
    // TTL field — MongoDB will automatically delete this document once
    // this timestamp is in the past. Set at creation time, e.g. now + 4hrs.
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: false,
  }
);

// TTL index: MongoDB's background task checks this every ~60 seconds and
// deletes documents where expiresAt has passed.
RoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index to make matchmaking lookups ("find a waiting Trio room")
// fast instead of a full collection scan.
RoomSchema.index({ mode: 1, targetSize: 1, status: 1 });

RoomSchema.index({ roomCode: 1 });

export const RoomModel = models.Room || model("Room", RoomSchema);