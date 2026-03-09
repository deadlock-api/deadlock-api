import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { AttemptsIndicator } from "./AttemptsIndicator";

interface GameShellProps {
	title: string;
	subtitle?: string;
	totalAttempts: number;
	usedAttempts: number;
	status: "playing" | "won" | "lost";
	children: React.ReactNode;
	hideAttempts?: boolean;
}

export function GameShell({
	title,
	subtitle,
	totalAttempts,
	usedAttempts,
	status,
	children,
	hideAttempts,
}: GameShellProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25, ease: "easeOut" }}
			className="max-w-5xl mx-auto px-4 py-8"
		>
			<div className="mb-6">
				<Link
					to="/deadlockdle"
					className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground/50 hover:text-primary transition-colors mb-4"
				>
					<ArrowLeft className="w-3 h-3" />
					Back to Hub
				</Link>

				<h1 className="text-2xl font-game tracking-tight uppercase bg-gradient-to-b from-foreground to-foreground/50 bg-clip-text text-transparent">{title}</h1>
				{subtitle && (
					<p className="text-sm text-muted-foreground/60 mt-1 font-mono">{subtitle}</p>
				)}

				{!hideAttempts && (
					<div className="mt-3">
						<AttemptsIndicator total={totalAttempts} used={usedAttempts} status={status} />
					</div>
				)}
			</div>

			<div className="space-y-6">{children}</div>
		</motion.div>
	);
}
