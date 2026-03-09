export type GameStatus = "playing" | "won" | "lost";

export interface DailyGameState {
  date: string;
  guesses: string[];
  status: GameStatus;
  hintsRevealed: number;
}

export interface StreakState {
  currentStreak: number;
  maxStreak: number;
  lastPlayedDate: string;
  gamesPlayed: number;
  gamesWon: number;
}

export type GameMode = "guess-hero" | "guess-item" | "guess-sound" | "guess-ability" | "item-stats" | "trivia";
