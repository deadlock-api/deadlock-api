import { ExternalLink, Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { parseSteamIdInput } from "~/lib/patron-api";

export function DeleteAccountDialog({
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

export function ReplaceAccountDialog({
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

export function ReactivateAccountDialog({
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

export function AddBotDialog({
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
