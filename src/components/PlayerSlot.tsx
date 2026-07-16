import type { Player } from "@/types/game";
import PlayerAvatar from "@/components/PlayerAvatar";

/* ===================================================================
   PlayerSlot — a single cell in the lobby's player grid.

   When occupied, shows the player's avatar token + display name.
   When empty, shows a dashed placeholder for the waiting seat.
   =================================================================== */

interface PlayerSlotProps {
  player: Player | null;
  isSelf: boolean;
  index: number;
}

export default function PlayerSlot({ player, isSelf, index }: PlayerSlotProps) {
  if (player) {
    return (
      <div
        className={
          "interrogation-card flex items-center gap-4 transition-colors " +
          (isSelf ? "ring-1 ring-truth/40" : "")
        }
      >
        <PlayerAvatar
          displayName={player.displayName}
          avatarColor={player.avatarColor}
          index={index}
          size="md"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-warm">
            {player.displayName}
            {isSelf && (
              <span className="ml-2 text-xs text-truth">(you)</span>
            )}
          </p>
          <p className="text-xs text-muted">
            Subject #{index + 1} &middot;{" "}
            {player.connected ? "Present" : "Disconnected"}
          </p>
        </div>

        <div
          className={
            "h-2 w-2 rounded-full " +
            (player.connected ? "bg-truth" : "bg-lie")
          }
          aria-label={player.connected ? "Connected" : "Disconnected"}
        />
      </div>
    );
  }

  return (
    <div className="interrogation-card flex items-center gap-4 border-dashed opacity-60">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-border font-mono text-sm text-muted"
        aria-hidden="true"
      >
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">Waiting for player…</p>
        <p className="text-xs text-muted/85">Slot {index + 1}</p>
      </div>
    </div>
  );
}
