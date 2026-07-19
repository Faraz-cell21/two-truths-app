import { Schema, models, model } from "mongoose";

const PlayerSchema = new Schema(
  {
    sessionId: { type: String, required: true },
    displayName: { type: String, required: true },
    avatarColor: { type: String, required: false },
    joinedAt: { type: Date, required: true, default: Date.now },
    connected: { type: Boolean, required: true, default: true },
    /** Updated on join/rejoin — used to ignore stale leave beacons after refresh. */
    lastSeenAt: { type: Date, required: false },
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
    // TTL field — MongoDB deletes the document once this timestamp is past.
    // Waiting lobbies use a short idle window (5m random / 10m private).
    // Playing rooms get ~1h; finished rooms get ~30m for play-again.
    expiresAt: { type: Date, required: true },
    /**
     * When connected players drop below 2 mid-game, we schedule a force-end
     * at this time so a quick refresh doesn't kill the room.
     */
    abandonDeadline: { type: Date, default: null },
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