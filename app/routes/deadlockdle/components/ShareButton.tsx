import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { getDayNumber } from "../lib/seed";
import type { GameMode, GameStatus } from "../lib/types";

const MODE_LABELS: Record<GameMode, string> = {
	"guess-hero": "Hero",
	"guess-item": "Item",
	"guess-sound": "Sound",
	"guess-ability": "Ability",
	"item-stats": "Stats",
	trivia: "Trivia",
};

export function generateShareText(
	mode: GameMode,
	date: string,
	guesses: string[],
	maxAttempts: number,
	status: GameStatus,
): string {
	const dayNum = getDayNumber(date);
	const label = MODE_LABELS[mode];
	const score = status === "won" ? `${guesses.length}/${maxAttempts}` : `X/${maxAttempts}`;
	const grid = guesses
		.map((_, i) => (i === guesses.length - 1 && status === "won" ? "\u{1f7e9}" : "\u{1f7e5}"))
		.join("");
	return `Deadlockdle #${dayNum} - ${label} ${score}\n${grid}\nhttps://deadlock-api.com/deadlockdle`;
}

interface ShareButtonProps {
	mode: GameMode;
	date: string;
	guesses: string[];
	maxAttempts: number;
	status: GameStatus;
}

export function ShareButton({ mode, date, guesses, maxAttempts, status }: ShareButtonProps) {
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		const text = generateShareText(mode, date, guesses, maxAttempts, status);
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<Button
			onClick={handleCopy}
			variant="outline"
			className="font-mono uppercase tracking-wider text-xs border-primary/40 hover:bg-primary/10 hover:border-primary/60"
		>
			{copied ? (
				<>
					<Check className="w-3.5 h-3.5 mr-1.5" /> Copied
				</>
			) : (
				<>
					<Copy className="w-3.5 h-3.5 mr-1.5" /> Share Result
				</>
			)}
		</Button>
	);
}
