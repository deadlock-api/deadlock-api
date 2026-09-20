import { ExternalLink, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useId, useState } from "react";

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
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { Stack } from "~/components/ui/stack";
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
        <Button variant="ghost" size="icon-sm" aria-label="Remove account" disabled={isDeleting}>
          {isDeleting ? <Spinner /> : <Trash2 />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Steam Account?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <Stack gap={2}>
              <p>
                Are you sure you want to remove the Steam account{" "}
                <span className="font-mono font-semibold">{steamId3}</span>?
              </p>
              <p className="text-primary">
                <strong>Note:</strong> This slot will be in a 24-hour cooldown period. You won't be able to use this
                slot for a new account until the cooldown expires.
              </p>
            </Stack>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} variant="destructive">
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
  const inputId = useId();

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
        <Button variant="ghost" size="icon-sm" aria-label="Replace account" disabled={isReplacing}>
          {isReplacing ? <Spinner /> : <RefreshCw />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace Steam Account</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <Stack gap={3}>
              <p>
                Replace the removed account <span className="font-mono font-semibold">{oldSteamId3}</span> with a new
                Steam ID.
              </p>
              <Field label="New Steam ID" labelDisplay="hidden" htmlFor={inputId} error={validationError}>
                <Input
                  id={inputId}
                  type="text"
                  placeholder="Enter SteamID64 (17 digits) or SteamID3"
                  value={steamIdInput}
                  onChange={(e) => handleInputChange(e.target.value)}
                  disabled={isReplacing}
                />
              </Field>
            </Stack>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleReplace} disabled={!isInputValid || isReplacing}>
            {isReplacing ? <Spinner /> : null}
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
        <Button variant="ghost" size="icon-sm" aria-label="Reactivate account" disabled={isReactivating}>
          {isReactivating ? <Spinner /> : <RotateCcw />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reactivate Steam Account?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <Stack gap={2}>
              <p>
                Are you sure you want to reactivate the Steam account{" "}
                <span className="font-mono font-semibold">{steamId3}</span>?
              </p>
              <p className="text-primary">
                <strong>Note:</strong> This will use one of your available slots.
              </p>
            </Stack>
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
          <DialogDescription asChild>
            <Stack gap={2}>
              <p>
                Our bot needs to be on your Steam friends list to access your match history. This is how your matches
                get ingested with priority. Without it, only public data is available.
              </p>
              <p>Click one of the invite links below, accept the friend request in Steam, then check the connection.</p>
            </Stack>
          </DialogDescription>
        </DialogHeader>
        <Stack gap={3} className="pt-2">
          <Stack gap={2}>
            {invites.map((invite, i) => (
              <Button key={invite} asChild variant="outline" className="w-full justify-start">
                <a href={invite} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Invite link {i + 1}
                </a>
              </Button>
            ))}
          </Stack>
          <Stack gap={2}>
            <Button onClick={onCheck} disabled={isChecking} className="w-full">
              {isChecking ? <Spinner /> : <RefreshCw />}
              {isChecking ? "Checking…" : "Check connection"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              After accepting the request, it may take a few minutes before the bot can see your profile.
            </p>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
