import {
  AlertCircle,
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
  XCircle,
} from "lucide-react";
import { useState } from "react";
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
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { parseSteamIdInput, steamId3ToSteamId64 } from "~/lib/patron-api";
import {
  useAddSteamAccount,
  useDeleteSteamAccount,
  usePatronStatus,
  useReactivateSteamAccount,
  useReplaceSteamAccount,
  useSteamAccounts,
} from "~/queries/patron-queries";

export const meta: MetaFunction = () => {
  return [
    { title: "Patron Dashboard | Deadlock API" },
    {
      name: "description",
      content: "Manage your prioritized Steam accounts as a Deadlock API patron.",
    },
  ];
};

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

function UnauthenticatedState({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Patron Dashboard</CardTitle>
          <CardDescription className="text-base mt-2">
            Become a patron to unlock prioritized data fetching for your Steam accounts. Patronage helps us cover
            infrastructure costs — we don't make a profit from this.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Benefits section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Patron Benefits</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">Priority Data Fetching</strong> — Your match history and stats are
                  fetched more frequently, ensuring up-to-date information.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">Multiple Steam Accounts</strong> — Add multiple Steam accounts
                  based on your pledge level ($3 = 1 account slot, capped at 10).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">Flexible Management</strong> — Add, remove, or replace Steam
                  accounts anytime with a simple 24-hour cooldown between changes.
                </span>
              </li>
            </ul>
          </div>

          {/* How it works section */}
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-lg font-semibold">How Prioritization Works</h3>
            <p className="text-sm text-muted-foreground">
              Deadlock API fetches match data for millions of players. Patron accounts are placed in a priority queue,
              meaning your matches and stats are updated more frequently. This ensures you always have the latest data
              for analysis and tracking.
            </p>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Free users are not affected!</strong> The experience for non-patrons
              stays exactly the same. Patronage solely funds the additional infrastructure costs of running priority
              fetches. We don't profit from this; every cent goes toward keeping the service running.
            </p>
          </div>

          {/* Actions section */}
          <div className="space-y-3 border-t pt-4">
            <Button onClick={onLogin} className="w-full" size="lg">
              <LogIn className="h-4 w-4 mr-2" />
              Login with Patreon
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Already a patron? Sign in above to manage your Steam accounts.
            </p>
            <p className="text-sm text-center">
              <span className="text-muted-foreground">Not a patron yet? </span>
              <a
                href="https://www.patreon.com/c/manuelhexe"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Support us on Patreon
              </a>
              <span className="text-muted-foreground"> to unlock these benefits.</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Format cents as currency (USD)
 */
function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/**
 * Format a date string in human-readable format
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Format a date as relative time (e.g., "7 days ago")
 */
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

/**
 * Calculate time remaining until cooldown expires
 * @returns Formatted string like "18h 32m" or null if cooldown has expired
 */
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
  const { data: status, isLoading, isError, error } = usePatronStatus();

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Your Patron Status
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
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Pledge Amount</p>
            <p className="text-lg font-semibold">{pledge_amount_cents ? formatCurrency(pledge_amount_cents) : "—"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Last Verified</p>
            <p className="text-lg font-semibold">{formatDate(last_verified_at)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Slot Usage</p>
            <p className="text-lg font-semibold">
              {usedSlots} of {total_slots} slots used
              {cooldown_count > 0 && (
                <span className="text-sm font-normal text-muted-foreground"> ({cooldown_count} in cooldown)</span>
              )}
            </p>
          </div>
        </div>
        {available_slots === 0 && canUpgrade && (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-5 text-center">
            <p className="text-sm text-muted-foreground">
              All slots are in use. Increase your Patreon pledge to unlock more accounts (up to 10 slots).
            </p>
            <Button asChild>
              <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Upgrade on Patreon
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
  const { data: status } = usePatronStatus();
  const addSteamAccountMutation = useAddSteamAccount();

  const availableSlots = status?.steam_accounts_summary.available_slots ?? 0;
  const hasAvailableSlots = availableSlots > 0;

  // Validate input on change
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
            <p className="text-amber-500">
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

  // Reset form when dialog closes
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
            <p className="text-amber-500">
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

function SteamAccountsList() {
  const { data, isLoading, isError, error } = useSteamAccounts();
  const deleteSteamAccountMutation = useDeleteSteamAccount();
  const replaceSteamAccountMutation = useReplaceSteamAccount();
  const reactivateSteamAccountMutation = useReactivateSteamAccount();

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
        <CardTitle>Steam Accounts</CardTitle>
        <CardDescription>Your prioritized Steam accounts for data fetching</CardDescription>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p>No Steam accounts added yet.</p>
            <p className="text-sm mt-1">Add a Steam account to get prioritized data fetching.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SteamID3</TableHead>
                <TableHead>SteamID64</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
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
                // Can replace only if deleted and cooldown has expired
                const canReplace = account.deleted_at !== null && !account.is_in_cooldown;
                // Can reactivate any deleted account (regardless of cooldown) if slots are available
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

function AuthenticatedDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Patron Dashboard</h1>
        <p className="text-muted-foreground">Manage your prioritized Steam accounts</p>
      </div>

      <PatronStatusCard />

      <AddSteamAccountForm />

      <SteamAccountsList />
    </div>
  );
}

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
