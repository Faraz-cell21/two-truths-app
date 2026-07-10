import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import {
  ActivityEventModel,
  type ActivityEventType,
} from "@/models/ActivityEvent";
import { getClientIp } from "@/lib/admin/getClientIp";

interface TrackActivityOptions {
  type: ActivityEventType;
  request: NextRequest;
  route: string;
  roomCode?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export function trackActivity(options: TrackActivityOptions): void {
  const { type, request, route, roomCode, sessionId, metadata } = options;

  void (async () => {
    try {
      await connectToDatabase();
      await ActivityEventModel.create({
        type,
        ip: getClientIp(request),
        route,
        roomCode: roomCode ?? null,
        sessionId: sessionId ?? null,
        metadata: metadata ?? null,
        createdAt: new Date(),
      });
    } catch {
      // Activity tracking should never block gameplay.
    }
  })();
}
