const ADJECTIVES = [
    "BLUE",
    "RED",
    "GOLD",
    "SILVER",
    "SWIFT",
    "LOUD",
    "QUIET",
    "BRAVE",
    "LUCKY",
    "SUNNY",
  ];
  
  const NOUNS = [
    "FOX",
    "WOLF",
    "BEAR",
    "HAWK",
    "LION",
    "OWL",
    "DEER",
    "SEAL",
    "CRAB",
    "FROG",
  ];
  
  /**
   * Generates a short, human-readable room code like "BLUE-FOX-42".
   * Easy to read aloud or type on a phone keyboard, unlike a raw UUID.
   * Not guaranteed globally unique — callers should check for collisions
   * against the database and retry if needed (see route.ts).
   */
  export function generateRoomCode(): string {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const number = Math.floor(Math.random() * 90) + 10; // 10-99
  
    return `${adjective}-${noun}-${number}`;
  }