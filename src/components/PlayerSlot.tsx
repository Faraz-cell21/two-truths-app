import type { Player } from "@/types/game";

/* ===================================================================
   PlayerSlot — a single cell in the lobby's player grid.

   When occupied, shows the player's display name styled like a case-file
   entry. When empty, shows a dashed placeholder indicating the room is
   waiting for another detective to join.
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
        {/* Avatar — initials in a circle */}
        <div
          className={
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold " +
            (isSelf
              ? "bg-truth text-ink"
              : "bg-border text-warm")
          }
          aria-hidden="true"
        >
          {getInitials(player.displayName)}
        </div>

        {/* Name + label */}
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

        {/* Connected indicator */}
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

  /* ---- Empty slot ---- */
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
        <p className="text-xs text-muted/60">Slot {index + 1}</p>
      </div>
    </div>
  );
}

/** "Foo Bar" → "FB", "Alice" → "AL" */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
