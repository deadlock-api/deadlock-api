import React, { useCallback } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

export interface LeaderboardControlsProps {
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	itemsPerPage: number;
	setItemsPerPage: (items: number) => void;
	currentPage: number;
	setCurrentPage: (page: number | ((prev: number) => number)) => void;
	totalPages: number;
}

export function LeaderboardControls({
	searchQuery,
	setSearchQuery,
	itemsPerPage,
	setItemsPerPage,
	currentPage,
	setCurrentPage,
	totalPages,
}: LeaderboardControlsProps) {
	const handleSearchChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setSearchQuery(e.target.value);
			if (e.target.value.length > 0) setCurrentPage(0);
		},
		[setSearchQuery, setCurrentPage],
	);

	const handleItemsPerPageChange = useCallback(
		(value: string) => {
			setItemsPerPage(Number(value));
			setCurrentPage(0);
		},
		[setItemsPerPage, setCurrentPage],
	);

	const handlePageInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const page = parseInt(e.target.value, 10);
			if (!isNaN(page) && page > 0 && page <= totalPages) {
				setCurrentPage(page - 1);
			}
		},
		[setCurrentPage, totalPages],
	);

	const handlePreviousPage = useCallback(
		() => setCurrentPage((prev) => Math.max(0, prev - 1)),
		[setCurrentPage],
	);

	const handleNextPage = useCallback(
		() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1)),
		[setCurrentPage, totalPages],
	);

	return (
		<div className="flex flex-wrap items-center justify-between py-4 gap-4">
			<div className="flex items-center space-x-2">
				<Input
					placeholder="Search player..."
					value={searchQuery}
					onChange={handleSearchChange}
					className="h-8 w-40"
				/>
			</div>
			<div className="flex items-center space-x-2">
				<span className="text-sm text-muted-foreground">Rows per page</span>
				<Select
					value={String(itemsPerPage)}
					onValueChange={handleItemsPerPageChange}
				>
					<SelectTrigger className="h-8 w-20">
						<SelectValue placeholder={itemsPerPage} />
					</SelectTrigger>
					<SelectContent>
						{[10, 25, 50, 100].map((size) => (
							<SelectItem key={size} value={String(size)}>
								{size}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<span className="text-sm text-muted-foreground flex items-center space-x-1">
				Page
				<span className="mx-2">
					<Input
						type="number"
						max={totalPages}
						min={1}
						value={currentPage + 1}
						onChange={handlePageInputChange}
						className="h-8 w-16 text-center"
					/>
				</span>
				of {totalPages}
			</span>
			<div className="flex items-center space-x-2">
				<Button
					variant="outline"
					size="sm"
					onClick={handlePreviousPage}
					disabled={currentPage === 0}
				>
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={handleNextPage}
					disabled={currentPage >= totalPages - 1}
				>
					Next
				</Button>
			</div>
		</div>
	);
}
