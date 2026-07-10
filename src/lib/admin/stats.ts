import { RoomModel } from "@/models/Room";
import { RoundModel } from "@/models/Round";
import { ActivityEventModel } from "@/models/ActivityEvent";

function startOfDay(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date = new Date()): Date {
  const start = startOfDay(date);
  const day = start.getDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - diff);
  return start;
}

export async function getAdminStats() {
  const now = new Date();
  const today = startOfDay(now);
  const weekStart = startOfWeek(now);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalRooms,
    activeRooms,
    waitingRooms,
    playingRooms,
    finishedRooms,
    totalRounds,
    revealedRounds,
    totalEvents,
    eventsToday,
    eventsThisWeek,
    activeIps24h,
    eventsByTypeToday,
    eventsByTypeWeek,
    topIps24h,
    recentRooms,
    recentEvents,
    uniquePlayersToday,
    gamesStartedToday,
    gamesStartedWeek,
    gamesCompletedToday,
    gamesCompletedWeek,
    modeBreakdown,
    targetSizeBreakdown,
  ] = await Promise.all([
    RoomModel.countDocuments(),
    RoomModel.countDocuments({ expiresAt: { $gt: now } }),
    RoomModel.countDocuments({ status: "waiting", expiresAt: { $gt: now } }),
    RoomModel.countDocuments({ status: "playing", expiresAt: { $gt: now } }),
    RoomModel.countDocuments({ status: "finished", expiresAt: { $gt: now } }),
    RoundModel.countDocuments(),
    RoundModel.countDocuments({ revealedAt: { $ne: null } }),
    ActivityEventModel.countDocuments(),
    ActivityEventModel.countDocuments({ createdAt: { $gte: today } }),
    ActivityEventModel.countDocuments({ createdAt: { $gte: weekStart } }),
    ActivityEventModel.distinct("ip", {
      createdAt: { $gte: last24h },
      ip: { $ne: "unknown" },
    }),
    ActivityEventModel.aggregate([
      { $match: { createdAt: { $gte: today } } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ActivityEventModel.aggregate([
      { $match: { createdAt: { $gte: weekStart } } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ActivityEventModel.aggregate([
      { $match: { createdAt: { $gte: last24h }, ip: { $ne: "unknown" } } },
      { $group: { _id: "$ip", count: { $sum: 1 }, lastSeen: { $max: "$createdAt" } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    RoomModel.find({ expiresAt: { $gt: now } })
      .sort({ createdAt: -1 })
      .limit(12)
      .select("roomCode status mode targetSize currentRound players createdAt expiresAt")
      .lean(),
    ActivityEventModel.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .select("type ip route roomCode createdAt")
      .lean(),
    RoomModel.aggregate([
      { $match: { createdAt: { $gte: today } } },
      { $unwind: "$players" },
      { $group: { _id: "$players.sessionId" } },
      { $count: "count" },
    ]),
    ActivityEventModel.countDocuments({
      type: "start_game",
      createdAt: { $gte: today },
    }),
    ActivityEventModel.countDocuments({
      type: "start_game",
      createdAt: { $gte: weekStart },
    }),
    RoomModel.countDocuments({
      status: "finished",
      createdAt: { $gte: today },
    }),
    RoomModel.countDocuments({
      status: "finished",
      createdAt: { $gte: weekStart },
    }),
    RoomModel.aggregate([
      { $group: { _id: "$mode", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    RoomModel.aggregate([
      { $group: { _id: "$targetSize", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const connectedPlayers = recentRooms.reduce((sum, room) => {
    return (
      sum +
      room.players.filter((player: { connected: boolean }) => player.connected)
        .length
    );
  }, 0);

  return {
    generatedAt: now.toISOString(),
    rooms: {
      total: totalRooms,
      active: activeRooms,
      waiting: waitingRooms,
      playing: playingRooms,
      finished: finishedRooms,
      connectedPlayers,
      modeBreakdown: modeBreakdown.map((item) => ({
        mode: item._id,
        count: item.count,
      })),
      targetSizeBreakdown: targetSizeBreakdown.map((item) => ({
        targetSize: item._id,
        count: item.count,
      })),
      recent: recentRooms.map((room) => ({
        roomCode: room.roomCode,
        status: room.status,
        mode: room.mode,
        targetSize: room.targetSize,
        currentRound: room.currentRound,
        playerCount: room.players.length,
        connectedCount: room.players.filter(
          (player: { connected: boolean }) => player.connected
        ).length,
        createdAt: room.createdAt,
        expiresAt: room.expiresAt,
      })),
    },
    rounds: {
      total: totalRounds,
      revealed: revealedRounds,
    },
    activity: {
      totalEvents,
      today: eventsToday,
      thisWeek: eventsThisWeek,
      activeIps24h: activeIps24h.length,
      uniquePlayersToday: uniquePlayersToday[0]?.count ?? 0,
      gamesStartedToday,
      gamesStartedWeek,
      gamesCompletedToday,
      gamesCompletedWeek,
      byTypeToday: eventsByTypeToday.map((item) => ({
        type: item._id,
        count: item.count,
      })),
      byTypeWeek: eventsByTypeWeek.map((item) => ({
        type: item._id,
        count: item.count,
      })),
      topIps24h: topIps24h.map((item) => ({
        ip: item._id,
        events: item.count,
        lastSeen: item.lastSeen,
      })),
      recent: recentEvents.map((event) => ({
        type: event.type,
        ip: event.ip,
        route: event.route,
        roomCode: event.roomCode,
        createdAt: event.createdAt,
      })),
    },
    storage: {
      rooms: totalRooms,
      rounds: totalRounds,
      activityEvents: totalEvents,
    },
  };
}

export type CleanupAction =
  | "purge_activity"
  | "delete_finished_rooms"
  | "delete_stale_rooms"
  | "delete_all_rounds"
  | "purge_all_game_data";

export async function runCleanup(
  action: CleanupAction,
  olderThanDays = 7
): Promise<Record<string, number>> {
  const now = new Date();

  switch (action) {
    case "purge_activity": {
      const cutoff = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);
      const result = await ActivityEventModel.deleteMany({
        createdAt: { $lt: cutoff },
      });
      return { activityEventsDeleted: result.deletedCount };
    }
    case "delete_finished_rooms": {
      const finishedRooms = await RoomModel.find({ status: "finished" })
        .select("roomCode")
        .lean();
      const roomCodes = finishedRooms.map((room) => room.roomCode);
      const [roomsResult, roundsResult] = await Promise.all([
        RoomModel.deleteMany({ status: "finished" }),
        RoundModel.deleteMany({ roomCode: { $in: roomCodes } }),
      ]);
      return {
        roomsDeleted: roomsResult.deletedCount,
        roundsDeleted: roundsResult.deletedCount,
      };
    }
    case "delete_stale_rooms": {
      const result = await RoomModel.deleteMany({ expiresAt: { $lte: now } });
      return { roomsDeleted: result.deletedCount };
    }
    case "delete_all_rounds": {
      const result = await RoundModel.deleteMany({});
      return { roundsDeleted: result.deletedCount };
    }
    case "purge_all_game_data": {
      const [roomsResult, roundsResult, eventsResult] = await Promise.all([
        RoomModel.deleteMany({}),
        RoundModel.deleteMany({}),
        ActivityEventModel.deleteMany({}),
      ]);
      return {
        roomsDeleted: roomsResult.deletedCount,
        roundsDeleted: roundsResult.deletedCount,
        activityEventsDeleted: eventsResult.deletedCount,
      };
    }
    default:
      return {};
  }
}
