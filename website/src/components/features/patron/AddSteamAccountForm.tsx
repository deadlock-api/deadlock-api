import { HelpCircle, Plus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Disclosure } from "~/components/patterns/content/Disclosure";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Code } from "~/components/ui/code";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import { Spinner } from "~/components/ui/spinner";
import { Stack } from "~/components/ui/stack";
import { parseSteamIdInput } from "~/lib/steam";
import { useAddSteamAccount, usePatronStatus } from "~/queries/patron-queries";

function SteamIdFormatHelper() {
  return (
    <Disclosure variant="inline" title="What's a Steam ID?" icon={<HelpCircle />}>
      <Card tone="inset" size="sm" radius="lg" className="gap-3 p-4 text-sm">
        <Stack gap={1}>
          <p className="font-medium">Steam ID Formats</p>
          <p className="text-muted-foreground">
            Paste your profile link (steamcommunity.com/profiles/…), or enter either ID:
          </p>
        </Stack>

        <Stack gap={2}>
          <Stack gap={1}>
            <span className="font-medium">SteamID64 (17 digits)</span>
            <Code>76561198012345678</Code>
            <span className="text-xs text-muted-foreground">
              Found in your Steam profile URL: steamcommunity.com/profiles/
              <span className="font-semibold">76561198012345678</span>
            </span>
          </Stack>

          <Stack gap={1}>
            <span className="font-medium">SteamID3 (shorter number)</span>
            <Code>52079950</Code>
            <span className="text-xs text-muted-foreground">
              The account ID portion, also known as &quot;Friend ID&quot;
            </span>
          </Stack>
        </Stack>

        <Separator />
        <Stack gap={1} align="start">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">How to find your Steam ID: </span>
            Open Steam → View your profile → The URL contains your SteamID64, or right-click and copy your profile URL.
          </p>
          <Button asChild variant="link" size="inline">
            <a href="https://steamcommunity.com/my/profile" target="_blank" rel="noopener noreferrer">
              Open your Steam profile
              <span className="text-xs">↗</span>
            </a>
          </Button>
        </Stack>
      </Card>
    </Disclosure>
  );
}

export function AddSteamAccountForm() {
  const [steamIdInput, setSteamIdInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputId = useId();
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
      onError: (error) => {
        toast.error("Failed to add Steam account", { description: error.message });
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
            <span className="text-positive">
              {availableSlots} slot{availableSlots !== 1 ? "s" : ""} available
            </span>
          ) : (
            <span className="text-destructive">No slots available</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex items-start gap-3">
          <Field label="Steam ID" labelDisplay="hidden" htmlFor={inputId} error={validationError} className="flex-1">
            <Input
              id={inputId}
              type="text"
              placeholder="SteamID64, account ID, or profile link"
              value={steamIdInput}
              onChange={(e) => handleInputChange(e.target.value)}
              disabled={addSteamAccountMutation.isPending}
            />
          </Field>
          <Button type="submit" disabled={!canSubmit}>
            {addSteamAccountMutation.isPending ? <Spinner /> : <Plus />}
            Add
          </Button>
        </form>
        <SteamIdFormatHelper />
      </CardContent>
    </Card>
  );
}
