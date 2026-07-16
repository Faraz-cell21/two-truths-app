import {
  AVATAR_INK,
  getInitials,
  resolveAvatarColor,
} from "@/lib/avatarTokens";

type AvatarSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "h-7 w-7 text-[0.65rem]",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

interface PlayerAvatarProps {
  displayName: string;
  avatarColor?: string | null;
  /** Seat index used when color is missing (legacy rooms). */
  index?: number;
  size?: AvatarSize;
  className?: string;
  title?: string;
}

export default function PlayerAvatar({
  displayName,
  avatarColor,
  index = 0,
  size = "md",
  className = "",
  title,
}: PlayerAvatarProps) {
  const bg = resolveAvatarColor(avatarColor, index);

  return (
    <div
      className={
        "relative shrink-0 rounded-full " +
        SIZE_CLASS[size] +
        (className ? ` ${className}` : "")
      }
      title={title ?? displayName}
      aria-hidden="true"
    >
      {/* Rotating specular rim — color-matched to the seat token */}
      <span
        className="avatar-shine-ring absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(from 0deg, ${bg}, #ffffffd9, ${bg} 28%, #00000055 48%, ${bg} 68%, #ffffffb3, ${bg})`,
        }}
      />
      <span
        className="absolute inset-[2px] flex items-center justify-center rounded-full font-mono font-bold shadow-sm"
        style={{ backgroundColor: bg, color: AVATAR_INK }}
      >
        {getInitials(displayName)}
      </span>
    </div>
  );
}
