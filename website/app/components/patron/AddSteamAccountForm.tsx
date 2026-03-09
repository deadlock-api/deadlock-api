import { ChevronDown, HelpCircle, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { parseSteamIdInput } from "~/lib/patron-api";
import { useAddSteamAccount, usePatronStatus } from "~/queries/patron-queries";

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

export function AddSteamAccountForm() {
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
