import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { MetaFunction } from "react-router";
import { LoadingLogo } from "~/components/LoadingLogo";
import { createPageMeta } from "~/lib/meta";
import { cn } from "~/lib/utils";
import { GameShell } from "./components/GameShell";
import { GuessInput } from "./components/GuessInput";
import { HintReveal } from "./components/HintReveal";
import { ResultModal } from "./components/ResultModal";
import { filterPlayableHeroes, useHeroes } from "./lib/queries";
import { getDailySeed, seededPick, seededRandom } from "./lib/seed";
import { useDailyGame } from "./lib/use-daily-game";

export const meta: MetaFunction = () => {
	return createPageMeta({
		title: "Guess the Hero - Deadlockdle | Deadlock API",
		description:
			"Can you identify the Deadlock hero from their silhouette? Daily puzzle with progressive hints.",
		path: "/deadlockdle/guess-hero",
	});
};

const MAX_ATTEMPTS = 6;

/** Map guess count to CSS filter intensity: fully dark at 0, progressively lighter */
function getSilhouetteFilter(hintsRevealed: number, isFinished: boolean): string {
	if (isFinished) return "none";
	const steps: string[] = [
		"brightness(0) saturate(0)",          // 0 guesses: full silhouette
		"brightness(0.08) saturate(0)",        // 1 guess
		"brightness(0.15) saturate(0)",        // 2 guesses
		"brightness(0.25) saturate(0.1)",      // 3 guesses
		"brightness(0.4) saturate(0.2)",       // 4 guesses
		"brightness(0.7) saturate(0.5)",       // 5 guesses: nearly full reveal
	];
	return steps[Math.min(hintsRevealed, steps.length - 1)];
}

export default function GuessHero() {
	const { data: heroes, isLoading } = useHeroes();
	const { gameState, streakState, isFinished, submitGuess, today } =
		useDailyGame("guess-hero", MAX_ATTEMPTS);

	const [shakeKey, setShakeKey] = useState(0);

	const playableHeroes = useMemo(
		() => (heroes ? filterPlayableHeroes(heroes) : []),
		[heroes],
	);

	const dailyHero = useMemo(() => {
		if (playableHeroes.length === 0) return null;
		const seed = getDailySeed(today);
		const rng = seededRandom(seed);
		return seededPick(playableHeroes, rng);
	}, [playableHeroes, today]);

	const hints = useMemo(() => {
		if (!dailyHero) return [];

		const heroType = dailyHero.hero_type
			? dailyHero.hero_type.charAt(0).toUpperCase() + dailyHero.hero_type.slice(1)
			: "Unknown";

		const startingStatEntries = Object.entries(dailyHero.starting_stats) as [
			string,
			{ value: unknown; display_stat_name: string },
		][];
		const statEntry = startingStatEntries.find(([key]) => key === "max_health");
		const statHint = statEntry
			? `${statEntry[1].display_stat_name}: ${statEntry[1].value}`
			: startingStatEntries.length > 0
				? `${startingStatEntries[0][1].display_stat_name}: ${startingStatEntries[0][1].value}`
				: "No stats available";

		const lore = dailyHero.description?.lore;
		const loreTruncated = lore
			? lore.length > 100
				? `${lore.slice(0, 100)}...`
				: lore
			: "No lore available";

		const weaponImgSrc =
			dailyHero.images?.weapon_image_webp ?? dailyHero.images?.weapon_image ?? null;

		return [
			{ label: "TYPE", value: heroType },
			{ label: "STAT", value: statHint },
			{ label: "LORE", value: loreTruncated },
			{
				label: "WEAPON",
				value: weaponImgSrc ? (
					<img
						src={weaponImgSrc}
						alt="Hero weapon"
						className="h-10 w-auto object-contain inline-block"
					/>
				) : (
					"No weapon image"
				),
			},
			{ label: "REVEAL", value: "Silhouette filter greatly reduced" },
		];
	}, [dailyHero]);

	const guessOptions = useMemo(() => {
		const guessedSet = new Set(
			gameState.guesses.map((g) => g.toLowerCase()),
		);
		return playableHeroes
			.filter((h) => !guessedSet.has(h.name.toLowerCase()))
			.map((h) => ({ id: h.id, name: h.name }));
	}, [playableHeroes, gameState.guesses]);

	function handleGuess(_id: string | number, name: string) {
		if (!dailyHero || isFinished) return;
		const correct = name.toLowerCase() === dailyHero.name.toLowerCase();
		submitGuess(name, correct);
		if (!correct) {
			setShakeKey((k) => k + 1);
		}
	}

	if (isLoading || !dailyHero) {
		return (
			<div className="flex items-center justify-center min-h-[50vh]">
				<LoadingLogo className="w-16 h-16 animate-pulse" />
			</div>
		);
	}

	const heroImgSrc =
		dailyHero.images?.minimap_image_webp ?? dailyHero.images?.minimap_image ?? "";

	return (
		<GameShell
			title="Guess the Hero"
			subtitle="Identify the hero from their silhouette"
			totalAttempts={MAX_ATTEMPTS}
			usedAttempts={gameState.guesses.length}
			status={gameState.status}
		>
			{/* Hero silhouette image */}
			<motion.div
				key={shakeKey}
				animate={shakeKey > 0 ? { x: [-8, 8, -4, 4, 0] } : undefined}
				transition={{ duration: 0.35, ease: "easeInOut" }}
				className="flex justify-center"
			>
				<div className="relative">
					<picture>
						{dailyHero.images?.minimap_image_webp && (
							<source srcSet={dailyHero.images.minimap_image_webp} type="image/webp" />
						)}
						{dailyHero.images?.minimap_image && (
							<source srcSet={dailyHero.images.minimap_image} type="image/png" />
						)}
						<img
							src={heroImgSrc}
							alt="Mystery hero"
							className="w-[200px] h-[200px] object-contain transition-all duration-500"
							style={{
								filter: getSilhouetteFilter(gameState.hintsRevealed, isFinished),
							}}
							draggable={false}
						/>
					</picture>
					{isFinished && (
						<motion.p
							initial={{ opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							className="text-center mt-2 text-sm font-mono font-semibold text-foreground"
						>
							{dailyHero.name}
						</motion.p>
					)}
				</div>
			</motion.div>

			{/* Progressive hints */}
			{hints.length > 0 && (
				<HintReveal hints={hints} revealedCount={gameState.hintsRevealed} />
			)}

			{/* Guess input */}
			<div className="flex justify-center">
				<GuessInput
					options={guessOptions}
					onSubmit={handleGuess}
					disabled={isFinished}
					placeholder="GUESS THE HERO..."
				/>
			</div>

			{/* Previous guesses */}
			{gameState.guesses.length > 0 && (
				<div className="space-y-1.5">
					<p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/40">
						Previous Guesses
					</p>
					<div className="flex flex-wrap gap-2">
						{gameState.guesses.map((guess, i) => {
							const isCorrect =
								guess.toLowerCase() === dailyHero.name.toLowerCase();
							return (
								<span
									key={`${guess}-${i}`}
									className={cn(
										"px-2.5 py-1 text-xs font-mono border",
										isCorrect
											? "border-green-500/40 bg-green-500/10 text-green-400"
											: "border-primary/20 bg-primary/5 text-primary/70",
									)}
								>
									{guess}
								</span>
							);
						})}
					</div>
				</div>
			)}

			{/* Result modal */}
			<ResultModal
				open={isFinished}
				status={gameState.status}
				answer={dailyHero.name}
				mode="guess-hero"
				date={today}
				guesses={gameState.guesses}
				maxAttempts={MAX_ATTEMPTS}
				streakState={streakState}
			/>
		</GameShell>
	);
}
