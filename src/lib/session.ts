"use client";

import { v4 as uuidv4 } from "uuid";

const SESSION_ID_KEY = "ttal_session_id";
const DISPLAY_NAME_KEY = "ttal_display_name";

/**
 * Returns the current browser's session ID, creating and persisting one
 * to localStorage if it doesn't exist yet. This is the entire "identity"
 * system for the app — no accounts, no passwords, just a random ID that
 * survives page refreshes but nothing more permanent than that.
 */
export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") {
    throw new Error(
      "getOrCreateSessionId can only be called in the browser."
    );
  }

  const existing = window.localStorage.getItem(SESSION_ID_KEY);
  if (existing) {
    return existing;
  }

  const newSessionId = uuidv4();
  window.localStorage.setItem(SESSION_ID_KEY, newSessionId);
  return newSessionId;
}

export function getStoredDisplayName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(DISPLAY_NAME_KEY);
}

export function setStoredDisplayName(name: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISPLAY_NAME_KEY, name);
}

const LAST_ROOM_CODE_KEY = "ttal_last_room_code";

/**
 * Stores which room the player last joined, so that on refresh/reconnect
 * we know which room to attempt to rejoin (see the reconnection flow in
 * the project docs).
 */
export function setStoredRoomCode(roomCode: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_ROOM_CODE_KEY, roomCode);
}

export function getStoredRoomCode(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_ROOM_CODE_KEY);
}

export function clearStoredRoomCode(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LAST_ROOM_CODE_KEY);
}