import { AnimatePresence, motion } from "framer-motion";
import { useCountdown } from "../lib/use-countdown";
import type { GameMode, GameStatus, StreakState } from "../lib/types";
import { ShareButton } from "./ShareButton";

interface ResultModalProps {
	open: boolean;
	status: GameStatus;
	answer: string;
	mode: GameMode;
	date: string;
	guesses: string[];
	maxAttempts: number;
	streakState: StreakState;
}

export function ResultModal({
	open,
	status,
	answer,
	mode,
	date,
	guesses,
	maxAttempts,
	streakState,
}: ResultModalProps) {
	const countdown = useCountdown();

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					initial={{ opacity: 0, scale: 0.95 }}
					animate={{ opacity: 1, scale: 1 }}
					exit={{ opacity: 0, scale: 0.95 }}
					transition={{ duration: 0.2 }}
					className="mt-8 border border-muted-foreground/20 bg-[#0d1117]/80 backdrop-blur-sm p-6"
				>
					<div className="text-center mb-5">
						<p
							className={`text-lg font-game uppercase tracking-wider ${
								status === "won" ? "text-green-400" : "text-primary"
							}`}
						>
							{status === "won" ? "TARGET ELIMINATED" : "MISSION FAILED"}
						</p>
						<p className="text-sm text-muted-foreground/60 font-mono mt-1">
							The answer was <span className="text-foreground font-semibold">{answer}</span>
						</p>
					</div>

					<div className="grid grid-cols-4 gap-3 mb-5">
						{[
							{ label: "Played", value: streakState.gamesPlayed },
							{
								label: "Win %",
								value:
									streakState.gamesPlayed > 0
										? Math.round((streakState.gamesWon / streakState.gamesPlayed) * 100)
										: 0,
							},
							{ label: "Streak", value: streakState.currentStreak },
							{ label: "Best", value: streakState.maxStreak },
						].map((stat) => (
							<div key={stat.label} className="text-center">
								<p className="text-xl font-bold font-mono">{stat.value}</p>
								<p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
									{stat.label}
								</p>
							</div>
						))}
					</div>

					<div className="text-center mb-5 py-3 border-t border-b border-muted-foreground/10">
						<p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 mb-1">
							Next Puzzle
						</p>
						<p className="text-lg font-mono font-bold tracking-widest">{countdown}</p>
					</div>

					<div className="flex justify-center">
						<ShareButton
							mode={mode}
							date={date}
							guesses={guesses}
							maxAttempts={maxAttempts}
							status={status}
						/>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
