import { Schema, models, model } from "mongoose";

export const ACTIVITY_EVENT_TYPES = [
  "join",
  "create_room",
  "start_game",
  "submit_statements",
  "vote",
  "reveal",
  "leave",
  "rejoin",
  "play_again",
  "room_fetch",
  "round_fetch",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

const ActivityEventSchema = new Schema(
  {
    type: {
      type: String,
      enum: ACTIVITY_EVENT_TYPES,
      required: true,
    },
    ip: { type: String, required: true },
    route: { type: String, required: true },
    roomCode: { type: String, default: null },
    sessionId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false }
);

ActivityEventSchema.index({ createdAt: -1 });
ActivityEventSchema.index({ ip: 1, createdAt: -1 });
ActivityEventSchema.index({ type: 1, createdAt: -1 });

export const ActivityEventModel =
  models.ActivityEvent || model("ActivityEvent", ActivityEventSchema);
