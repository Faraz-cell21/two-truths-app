import { Schema, models, model } from "mongoose";

const VoteSchema = new Schema(
  {
    sessionId: { type: String, required: true },
    votedIndex: { type: Number, enum: [0, 1, 2], required: true },
  },
  { _id: false }
);

const RoundSchema = new Schema(
  {
    roomCode: { type: String, required: true },
    roundNumber: { type: Number, required: true },
    submittedBy: { type: String, required: true },
    statements: {
      type: [String],
      required: true,
      validate: {
        validator: (arr: string[]) => arr.length === 3,
        message: "A round must have exactly 3 statements.",
      },
    },
    lieIndex: { type: Number, enum: [0, 1, 2], required: true },
    votes: { type: [VoteSchema], required: true, default: [] },
    /** Server clock when voting closes; clients countdown against this. */
    voteDeadline: { type: Date, required: false },
    revealedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: false,
  }
);

// TTL index: rounds clean themselves up automatically ~1 hour after
// creation, matching the playing-room safety lifetime.
RoundSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

RoundSchema.index({ roomCode: 1, roundNumber: 1 });

export const RoundModel = models.Round || model("Round", RoundSchema);