import { Crosshair, Ear, HelpCircle, Puzzle, ShoppingBag, Swords } from "lucide-react";
import { motion } from "framer-motion";
import type { MetaFunction } from "react-router";
import { createPageMeta } from "~/lib/meta";
import { GameCard } from "./deadlockdle/components/GameCard";
import { getDayNumber, getTodayDate } from "./deadlockdle/lib/seed";

export const meta: MetaFunction = () => {
	return createPageMeta({
		title: "Deadlockdle - Daily Deadlock Minigames | Deadlock API",
		description:
			"Test your Deadlock knowledge with daily puzzles. Guess heroes, items, sounds, abilities, and more.",
		path: "/deadlockdle",
	});
};

const GAMES = [
	{
		mode: "guess-hero" as const,
		title: "Guess the Hero",
		description: "Identify the hero from their silhouette. Clues revealed with each guess.",
		icon: Crosshair,
		path: "/deadlockdle/guess-hero",
	},
	{
		mode: "guess-item" as const,
		title: "Guess the Item",
		description: "Name the item from a blurred shop image. Gets clearer each attempt.",
		icon: ShoppingBag,
		path: "/deadlockdle/guess-item",
	},
	{
		mode: "guess-sound" as const,
		title: "Guess the Sound",
		description: "Listen to a game sound and identify what it belongs to.",
		icon: Ear,
		path: "/deadlockdle/guess-sound",
	},
	{
		mode: "guess-ability" as const,
		title: "Ability to Hero",
		description: "See an ability icon. Name the hero it belongs to.",
		icon: Swords,
		path: "/deadlockdle/guess-ability",
	},
	{
		mode: "item-stats" as const,
		title: "Item Stats Quiz",
		description: "Fill in the missing stats for each item. How well do you know your shop?",
		icon: Puzzle,
		path: "/deadlockdle/item-stats",
	},
	{
		mode: "trivia" as const,
		title: "Deadlock Trivia",
		description: "10 questions about heroes, items, NPCs, and game mechanics.",
		icon: HelpCircle,
		path: "/deadlockdle/trivia",
	},
] as const;

export default function DeadlockdleHub() {
	const today = getTodayDate();
	const dayNum = getDayNumber(today);

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25, ease: "easeOut" }}
			className="max-w-3xl mx-auto px-4 py-8"
		>
			<div className="text-center mb-8">
				<h1 className="text-3xl font-bold tracking-tight uppercase">Deadlockdle</h1>
				<p className="text-sm font-mono text-muted-foreground/50 mt-2 tracking-wider">
					DAY #{dayNum} — DAILY DEADLOCK CHALLENGES
				</p>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{GAMES.map((game, i) => (
					<motion.div
						key={game.mode}
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.25, delay: i * 0.05 }}
					>
						<GameCard {...game} />
					</motion.div>
				))}
			</div>
		</motion.div>
	);
}
