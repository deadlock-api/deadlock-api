import { useQuery } from "@tanstack/react-query";
import type { RankV2 } from "assets_deadlock_api_client";
import axios from "axios";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  Clock,
  ExternalLink,
  HelpCircle,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { assetsApi } from "~/lib/assets-api";
import { BotNotFriendError, type PlayerCard, parseSteamIdInput, steamId3ToSteamId64 } from "~/lib/patron-api";
import { getRankImageUrl, getRankLabel } from "~/lib/rank-utils";
import {
  useAddSteamAccount,
  useDeleteSteamAccount,
  usePatronStatus,
  usePlayerCard,
  useReactivateSteamAccount,
  useRefetchMatchHistory,
  useReplaceSteamAccount,
  useSteamAccounts,
} from "~/queries/patron-queries";

export const meta: MetaFunction = () => {
  return [
    { title: "Prioritized Fetching | Deadlock API" },
    {
      name: "description",
      content: "Get priority data fetching for your Steam accounts. Your matches and stats updated faster.",
    },
  ];
};

// ============================================================================
// Unauthenticated Landing Page
// ============================================================================

function UnauthenticatedState({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="space-y-4">
      {/* Hero Section */}
      <section className="relative text-center space-y-6 py-8">
        {/* Glow effect behind hero */}
        <div className="absolute inset-0 -top-12 flex items-center justify-center pointer-events-none" aria-hidden>
          <div className="w-80 h-80 rounded-full bg-primary/8 blur-3xl" />
        </div>

        <div className="relative space-y-6">
          <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">
            Your matches. Updated <span className="text-primary">faster</span>.
          </h1>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Patron accounts get a dedicated queue with reserved resources, guaranteeing fast and reliable data fetching
            for your match history and stats.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8"
              onClick={onLogin}
            >
              <LogIn className="h-4 w-4 mr-2" />
              Sign in with Patreon
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
                Become a Patron
                <ArrowRight className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Starting at $3/month — every cent goes to infrastructure</p>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="max-w-2xl mx-auto">
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_120px_120px] sm:grid-cols-[1fr_140px_140px] bg-muted/40">
            <div className="p-4" />
            <div className="p-4 text-center text-sm font-medium text-muted-foreground border-l border-border">Free</div>
            <div className="p-4 text-center text-sm font-semibold text-primary border-l border-primary/30 bg-primary/5">
              Patron
            </div>
          </div>
          {/* Rows */}
          <ComparisonRow label="Full API access" free checked />
          <ComparisonRow label="Match history & stats" free checked />
          <ComparisonRow label="Dedicated queue with reserved resources" checked />
          <ComparisonRow label="Faster data updates" checked />
          <ComparisonRow label="Up to 10 prioritized accounts" checked />
          <ComparisonRow label="Swap accounts anytime" checked />
          <ComparisonRow label="Accurate rank data from Steam" checked />
        </div>
      </section>
    </div>
  );
}

function ComparisonRow({ label, free, checked }: { label: string; free?: boolean; checked?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_120px_120px] sm:grid-cols-[1fr_140px_140px] border-t border-border">
      <div className="p-3 px-4 text-sm">{label}</div>
      <div className="p-3 flex items-center justify-center border-l border-border">
        {free ? (
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>
      <div className="p-3 flex items-center justify-center border-l border-primary/30 bg-primary/5">
        {checked ? (
          <CheckCircle className="h-4 w-4 text-primary" />
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) {
    return "just now";
  }
  if (diffMin < 60) {
    return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  }
  if (diffHr < 24) {
    return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  }
  if (diffDays < 30) {
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
  }
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} year${diffYears !== 1 ? "s" : ""} ago`;
}

const COOLDOWN_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function formatCooldownRemaining(deletedAt: string): string | null {
  const deletedDate = new Date(deletedAt);
  const cooldownEnd = new Date(deletedDate.getTime() + COOLDOWN_DURATION_MS);
  const now = new Date();
  const remainingMs = cooldownEnd.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return null;
  }

  const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
  const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  if (remainingHours > 0) {
    return `${remainingHours}h ${remainingMinutes}m`;
  }
  return `${remainingMinutes}m`;
}

// ============================================================================
// Authenticated Dashboard
// ============================================================================

function PatronPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function PatronStatusCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-40" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PatronStatusCard() {
  const query = usePatronStatus();
  const status = query.data;
  const isLoading = query.isLoading;
  const isError = query.isError;
  const error = query.error;

  if (isLoading) {
    return <PatronStatusCardSkeleton />;
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error loading patron status</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Failed to load patron status"}</AlertDescription>
      </Alert>
    );
  }

  if (!status) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Session expired</AlertTitle>
        <AlertDescription>Please log in again to view your patron status.</AlertDescription>
      </Alert>
    );
  }

  const { is_active, pledge_amount_cents, last_verified_at, steam_accounts_summary, total_slots } = status;
  const { active_count, cooldown_count, available_slots } = steam_accounts_summary;
  const usedSlots = active_count + cooldown_count;
  const canUpgrade = total_slots < 10;
  const slotPercentage = total_slots > 0 ? (usedSlots / total_slots) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Patron Status
            {is_active ? (
              <Badge className="bg-green-600 hover:bg-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                Active
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                Inactive
              </Badge>
            )}
          </CardTitle>
        </div>
        <CardDescription>
          {pledge_amount_cents ? `Pledging ${formatCurrency(pledge_amount_cents)} / month` : "No active pledge"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Pledge</p>
            <p className="text-2xl font-bold">{pledge_amount_cents ? formatCurrency(pledge_amount_cents) : "—"}</p>
            <p className="text-xs text-muted-foreground">per month</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Last Verified</p>
            <p className="text-lg font-semibold">{formatDate(last_verified_at)}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Account Slots</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{usedSlots}</p>
              <p className="text-sm text-muted-foreground">of {total_slots} used</p>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${slotPercentage}%` }}
              />
            </div>
            {cooldown_count > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {cooldown_count} in cooldown
              </p>
            )}
          </div>
        </div>
        {available_slots === 0 && canUpgrade && (
          <div className="rounded-xl border border-primary/20 bg-linear-to-br from-primary/10 to-primary/5 p-6 text-center space-y-3">
            <p className="text-base font-medium">Want to prioritize more accounts?</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Each additional $3/month unlocks another slot. You can add up to {10 - total_slots} more.
            </p>
            <Button size="lg" asChild className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
              <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
                Increase Pledge
                <ArrowRight className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Steam Account Management Components
// ============================================================================

function SteamIdFormatHelper() {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground p-0 h-auto">
          <HelpCircle className="h-4 w-4 mr-1" />
          <span className="text-sm">What's a Steam ID?</span>
          <ChevronDown className="h-4 w-4 ml-1 transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <div className="rounded-md border bg-muted/50 p-4 space-y-3 text-sm">
          <div>
            <p className="font-medium mb-1">Steam ID Formats</p>
            <p className="text-muted-foreground">You can enter your Steam ID in either format:</p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col gap-1">
              <span className="font-medium">SteamID64 (17 digits)</span>
              <code className="bg-muted rounded px-2 py-1 font-mono text-xs">76561198012345678</code>
              <span className="text-muted-foreground text-xs">
                Found in your Steam profile URL: steamcommunity.com/profiles/
                <span className="font-semibold">76561198012345678</span>
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-medium">SteamID3 (shorter number)</span>
              <code className="bg-muted rounded px-2 py-1 font-mono text-xs">52079950</code>
              <span className="text-muted-foreground text-xs">
                The account ID portion, also known as &quot;Friend ID&quot;
              </span>
            </div>
          </div>

          <div className="pt-2 border-t">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">How to find your Steam ID: </span>
              Open Steam → View your profile → The URL contains your SteamID64, or right-click and copy your profile
              URL.
            </p>
            <a
              href="https://steamcommunity.com/my/profile"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1 mt-1"
            >
              Open your Steam profile
              <span className="text-xs">↗</span>
            </a>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AddSteamAccountForm() {
  const [steamIdInput, setSteamIdInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const query = usePatronStatus();
  const addSteamAccountMutation = useAddSteamAccount();

  const status = query.data;
  const availableSlots = status?.steam_accounts_summary.available_slots ?? 0;
  const hasAvailableSlots = availableSlots > 0;

  const handleInputChange = (value: string) => {
    setSteamIdInput(value);
    if (!value.trim()) {
      setValidationError(null);
      return;
    }
    const result = parseSteamIdInput(value);
    if ("error" in result) {
      setValidationError(result.error);
    } else {
      setValidationError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const result = parseSteamIdInput(steamIdInput);
    if ("error" in result) {
      setValidationError(result.error);
      return;
    }

    addSteamAccountMutation.mutate(result.steamId3, {
      onSuccess: () => {
        toast.success("Steam account added successfully");
        setSteamIdInput("");
        setValidationError(null);
      },
      onError: () => {
        toast.error("Failed to add Steam account");
      },
    });
  };

  const isInputValid = steamIdInput.trim() !== "" && validationError === null;
  const canSubmit = isInputValid && hasAvailableSlots && !addSteamAccountMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Steam Account</CardTitle>
        <CardDescription>
          Add a Steam account for prioritized data fetching.{" "}
          {hasAvailableSlots ? (
            <span className="text-green-500">
              {availableSlots} slot{availableSlots !== 1 ? "s" : ""} available
            </span>
          ) : (
            <span className="text-destructive">No slots available</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="flex-1 space-y-1">
            <Input
              type="text"
              placeholder="Enter SteamID64 (17 digits) or SteamID3"
              value={steamIdInput}
              onChange={(e) => handleInputChange(e.target.value)}
              aria-invalid={validationError !== null}
              disabled={addSteamAccountMutation.isPending}
            />
            {validationError && <p className="text-sm text-destructive">{validationError}</p>}
          </div>
          <Button type="submit" disabled={!canSubmit}>
            {addSteamAccountMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span className="ml-2">Add</span>
          </Button>
        </form>
        <div className="mt-4">
          <SteamIdFormatHelper />
        </div>
      </CardContent>
    </Card>
  );
}

function SteamAccountsListSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteAccountDialog({
  steamId3,
  onDelete,
  isDeleting,
}: {
  steamId3: number;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isDeleting}>
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Steam Account?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Are you sure you want to remove the Steam account{" "}
              <span className="font-mono font-semibold">{steamId3}</span>?
            </p>
            <p className="text-primary">
              <strong>Note:</strong> This slot will be in a 24-hour cooldown period. You won't be able to use this slot
              for a new account until the cooldown expires.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Remove Account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReplaceAccountDialog({
  oldSteamId3,
  onReplace,
  isReplacing,
}: {
  oldSteamId3: number;
  onReplace: (steamId3: number) => void;
  isReplacing: boolean;
}) {
  const [steamIdInput, setSteamIdInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleInputChange = (value: string) => {
    setSteamIdInput(value);
    if (!value.trim()) {
      setValidationError(null);
      return;
    }
    const result = parseSteamIdInput(value);
    if ("error" in result) {
      setValidationError(result.error);
    } else {
      setValidationError(null);
    }
  };

  const handleReplace = () => {
    const result = parseSteamIdInput(steamIdInput);
    if ("error" in result) {
      setValidationError(result.error);
      return;
    }
    onReplace(result.steamId3);
  };

  const isInputValid = steamIdInput.trim() !== "" && validationError === null;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSteamIdInput("");
      setValidationError(null);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isReplacing}>
          {isReplacing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace Steam Account</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Replace the removed account <span className="font-mono font-semibold">{oldSteamId3}</span> with a new
                Steam ID.
              </p>
              <div className="space-y-1">
                <Input
                  type="text"
                  placeholder="Enter SteamID64 (17 digits) or SteamID3"
                  value={steamIdInput}
                  onChange={(e) => handleInputChange(e.target.value)}
                  aria-invalid={validationError !== null}
                  disabled={isReplacing}
                />
                {validationError && <p className="text-sm text-destructive">{validationError}</p>}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleReplace} disabled={!isInputValid || isReplacing}>
            {isReplacing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Replace Account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReactivateAccountDialog({
  steamId3,
  onReactivate,
  isReactivating,
}: {
  steamId3: number;
  onReactivate: () => void;
  isReactivating: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isReactivating}>
          {isReactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reactivate Steam Account?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Are you sure you want to reactivate the Steam account{" "}
              <span className="font-mono font-semibold">{steamId3}</span>?
            </p>
            <p className="text-primary">
              <strong>Note:</strong> This will use one of your available slots.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onReactivate}>Reactivate Account</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AddBotDialog({
  open,
  onOpenChange,
  invites,
  isChecking,
  onCheck,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invites: string[];
  isChecking: boolean;
  onCheck: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add bot as Steam friend</DialogTitle>
          <DialogDescription>
            To retrieve your rank, our bot needs to be on your Steam friends list. Click one of the invite links below,
            accept the friend request in Steam, then check the connection.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-2">
            {invites.map((invite, i) => (
              <a
                key={invite}
                href={invite}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
                Invite link {i + 1}
              </a>
            ))}
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={onCheck}
              disabled={isChecking}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isChecking ? "Checking…" : "Check connection"}
            </button>
            <p className="text-xs text-center text-muted-foreground">
              After accepting the request, it may take a few minutes before the bot can see your profile.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlayerCardRankCell({ steamId3, isActive }: { steamId3: number; isActive: boolean }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const refetchMutation = useRefetchMatchHistory();

  const cardQuery = usePlayerCard(steamId3, isActive);

  const ranksQuery = useQuery({
    queryKey: ["assets-ranks"],
    queryFn: async () => (await assetsApi.default_api.getRanksV2RanksGet()).data as RankV2[],
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Close dialog automatically once card loads successfully after a refetch
  useEffect(() => {
    if (cardQuery.isSuccess && dialogOpen) {
      setDialogOpen(false);
    }
  }, [cardQuery.isSuccess, dialogOpen]);

  if (!isActive) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (cardQuery.isLoading) {
    return <Skeleton className="h-5 w-20" />;
  }

  if (cardQuery.isError) {
    const err = cardQuery.error;
    if (Object.hasOwn(err, "invites") && Array.isArray(err.invites)) {
      return (
        <>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add bot
          </button>
          <AddBotDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            invites={err.invites}
            isChecking={cardQuery.isFetching}
            onCheck={() => cardQuery.refetch()}
          />
        </>
      );
    }
    return <span className="text-muted-foreground">—</span>;
  }

  const card = cardQuery.data as PlayerCard;

  const handleRefetch = () => {
    refetchMutation.mutate(steamId3, {
      onSuccess: (response) => {
        const count = response.data.length;
        toast.success(`Fetched ${count} match${count !== 1 ? "es" : ""}`);
      },
      onError: (error) => {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          const retryAfter = Number(error.response.headers["retry-after"]);
          if (retryAfter && retryAfter > 0) {
            const minutes = Math.ceil(retryAfter / 60);
            toast.error(`Rate limited — try again in ${minutes} minute${minutes !== 1 ? "s" : ""}`);
          } else {
            toast.error("Rate limited — please wait before trying again");
          }
        } else if (axios.isAxiosError(error)) {
          const detail = error.response?.data?.detail ?? error.response?.data?.message;
          toast.error(detail ?? `Request failed (${error.response?.status ?? "network error"})`);
        } else {
          toast.error(error instanceof Error ? error.message : "Failed to refetch match history");
        }
      },
    });
  };

  const refetchButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleRefetch}
          disabled={refetchMutation.isPending}
          className="ml-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refetchMutation.isPending ? "animate-spin" : ""}`} />
        </button>
      </TooltipTrigger>
      <TooltipContent>Refetch full match history</TooltipContent>
    </Tooltip>
  );

  if (card.ranked_rank === null || card.ranked_badge_level === null) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">—</span>
        {refetchButton}
      </div>
    );
  }

  const rank = ranksQuery.data?.find((r) => r.tier === card.ranked_rank);
  // Obscurus (tier 0) has subrank 0 in the card — use 1 for image lookup fallback
  const subrank = (card.ranked_subrank ?? 0) === 0 ? 1 : (card.ranked_subrank as number);
  const imageUrl = getRankImageUrl(rank, subrank, "small", "webp");
  const label = rank ? getRankLabel(rank, subrank) : `${card.ranked_rank}·${card.ranked_subrank}`;

  return (
    <div className="flex items-center gap-1.5">
      {imageUrl && <img src={imageUrl} alt={label} className="size-6 object-contain" />}
      <span className="text-sm">{label}</span>
      {refetchButton}
    </div>
  );
}

function SteamAccountsList() {
  const query = useSteamAccounts();
  const deleteSteamAccountMutation = useDeleteSteamAccount();
  const replaceSteamAccountMutation = useReplaceSteamAccount();
  const reactivateSteamAccountMutation = useReactivateSteamAccount();

  const data = query.data;
  const isLoading = query.isLoading;
  const isError = query.isError;
  const error = query.error;

  const handleDeleteAccount = (accountId: string) => {
    deleteSteamAccountMutation.mutate(accountId, {
      onSuccess: () => {
        toast.success("Steam account removed successfully");
      },
      onError: () => {
        toast.error("Failed to remove Steam account");
      },
    });
  };

  const handleReplaceAccount = (accountId: string, steamId3: number) => {
    replaceSteamAccountMutation.mutate(
      { accountId, steamId3 },
      {
        onSuccess: () => {
          toast.success("Steam account replaced successfully");
        },
        onError: () => {
          toast.error("Failed to replace Steam account");
        },
      },
    );
  };

  const handleReactivateAccount = (accountId: string) => {
    reactivateSteamAccountMutation.mutate(accountId, {
      onSuccess: () => {
        toast.success("Steam account reactivated successfully");
      },
      onError: () => {
        toast.error("Failed to reactivate Steam account");
      },
    });
  };

  if (isLoading) {
    return <SteamAccountsListSkeleton />;
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error loading Steam accounts</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Failed to load Steam accounts"}</AlertDescription>
      </Alert>
    );
  }

  const { accounts } = data ?? { accounts: [] };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prioritized Accounts</CardTitle>
        <CardDescription>Your Steam accounts with priority data fetching</CardDescription>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p>No Steam accounts added yet.</p>
            <p className="text-sm mt-1">Add a Steam account above to get prioritized data fetching.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SteamID3</TableHead>
                <TableHead>SteamID64</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead className="w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => {
                const isActive = account.deleted_at === null;
                const cooldownRemaining = account.deleted_at ? formatCooldownRemaining(account.deleted_at) : null;
                const isDeleting =
                  deleteSteamAccountMutation.isPending && deleteSteamAccountMutation.variables === account.id;
                const isReplacing =
                  replaceSteamAccountMutation.isPending &&
                  replaceSteamAccountMutation.variables?.accountId === account.id;
                const isReactivating =
                  reactivateSteamAccountMutation.isPending && reactivateSteamAccountMutation.variables === account.id;
                const canReplace = account.deleted_at !== null && !account.is_in_cooldown;
                const isDeleted = account.deleted_at !== null;

                return (
                  <TableRow key={account.id}>
                    <TableCell className="font-mono">{account.steam_id3}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {steamId3ToSteamId64(account.steam_id3)}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">{formatRelativeTime(account.created_at)}</span>
                        </TooltipTrigger>
                        <TooltipContent>{formatDate(account.created_at)}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {isActive ? (
                        <Badge className="bg-green-600 hover:bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : account.is_in_cooldown && cooldownRemaining ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Removed
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Available in {cooldownRemaining}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 mr-1" />
                          Removed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <PlayerCardRankCell steamId3={account.steam_id3} isActive={account.deleted_at === null} />
                    </TableCell>
                    <TableCell>
                      {isActive ? (
                        <DeleteAccountDialog
                          steamId3={account.steam_id3}
                          onDelete={() => handleDeleteAccount(account.id)}
                          isDeleting={isDeleting}
                        />
                      ) : (
                        <div className="flex gap-1">
                          {canReplace && (
                            <ReplaceAccountDialog
                              oldSteamId3={account.steam_id3}
                              onReplace={(steamId3) => handleReplaceAccount(account.id, steamId3)}
                              isReplacing={isReplacing}
                            />
                          )}
                          {isDeleted && (
                            <ReactivateAccountDialog
                              steamId3={account.steam_id3}
                              onReactivate={() => handleReactivateAccount(account.id)}
                              isReactivating={isReactivating}
                            />
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function NotSubscribedState() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Welcome, Patron!</h1>
        <p className="text-muted-foreground mt-1">You're signed in but don't have an active subscription yet.</p>
      </div>

      <Card className="border-primary/30 bg-linear-to-br from-primary/10 to-primary/5">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center">
            <ArrowRight className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Get prioritized fetching</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Subscribe on Patreon to unlock dedicated queue access with reserved resources. Your match data and stats
              will be fetched faster and more reliably.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 pt-2">
            <Button
              size="lg"
              asChild
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8"
            >
              <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
                Subscribe on Patreon
                <ArrowRight className="h-4 w-4 ml-2" />
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">Starting at $3/month — every cent goes to infrastructure</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AuthenticatedDashboard() {
  const query = usePatronStatus();
  const status = query.data;
  const isLoading = query.isLoading;
  const hasAvailableSlots = (status?.steam_accounts_summary.available_slots ?? 0) > 0;
  const totalSlots = status?.total_slots ?? 0;

  if (isLoading) {
    return <PatronPageSkeleton />;
  }

  // 0/0 state: user is authed but has no subscription / 0 slots
  if (totalSlots === 0) {
    return <NotSubscribedState />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Patron Dashboard</h1>
        <p className="text-muted-foreground">Manage your prioritized Steam accounts</p>
      </div>

      <PatronStatusCard />

      {hasAvailableSlots && <AddSteamAccountForm />}

      <SteamAccountsList />
    </div>
  );
}

// ============================================================================
// Page Entry Point
// ============================================================================

export default function PatronPage() {
  const { isAuthenticated, isLoading, login } = usePatronAuth();

  if (isLoading) {
    return <PatronPageSkeleton />;
  }

  if (!isAuthenticated) {
    return <UnauthenticatedState onLogin={login} />;
  }

  return <AuthenticatedDashboard />;
}
