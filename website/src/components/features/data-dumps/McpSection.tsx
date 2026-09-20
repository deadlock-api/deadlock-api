import { useState } from "react";

import { CopyableUrl } from "~/components/patterns/code/CopyableCode";
import { HighlightedCode, type HighlightLanguage } from "~/components/patterns/code/HighlightedCode";
import { Step, Steps } from "~/components/patterns/content/Steps";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Inline, Stack } from "~/components/ui/stack";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Text } from "~/components/ui/text";

export const MCP_URL = "https://api.deadlock-api.com/v1/mcp";
const NAME = "deadlock";

const CURSOR_INSTALL_LINK = `cursor://anysphere.cursor-deeplink/mcp/install?name=${NAME}&config=${btoa(
  JSON.stringify({ url: MCP_URL }),
)}`;
const VSCODE_INSTALL_LINK = `vscode:mcp/install?${encodeURIComponent(
  JSON.stringify({ name: NAME, type: "http", url: MCP_URL }),
)}`;

type Step = {
  text: string;
  code?: { language: HighlightLanguage; value: string };
  button?: { label: string; href: string };
};

type Client = { id: string; name: string; steps: Step[] };

const CLIENTS: Client[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    steps: [
      {
        text: "Run this once in your terminal:",
        code: { language: "bash", value: `claude mcp add --transport http ${NAME} ${MCP_URL}` },
      },
      { text: "Start claude and ask a question about the data." },
    ],
  },
  {
    id: "claude",
    name: "Claude Desktop / claude.ai",
    steps: [
      { text: "Open Settings → Connectors." },
      { text: "Click Add custom connector." },
      { text: "Paste the MCP URL above and click Add. No login or API key is needed." },
      { text: "In a chat, enable the Deadlock connector from the tools menu and ask away." },
    ],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    steps: [
      { text: "Open Settings → Apps & Connectors → Advanced settings and turn on Developer mode." },
      { text: "Back in Apps & Connectors, click Create." },
      { text: "Paste the MCP URL above and choose No authentication." },
      { text: "In a chat, pick the Deadlock connector from the Developer mode tools menu." },
    ],
  },
  {
    id: "codex",
    name: "Codex CLI",
    steps: [
      {
        text: "Run this once in your terminal:",
        code: { language: "bash", value: `codex mcp add ${NAME} --url ${MCP_URL}` },
      },
      { text: "Start codex and ask a question about the data." },
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    steps: [
      {
        text: "Click the button, or add this to ~/.cursor/mcp.json:",
        code: { language: "json", value: `{ "mcpServers": { "${NAME}": { "url": "${MCP_URL}" } } }` },
        button: { label: "Add to Cursor", href: CURSOR_INSTALL_LINK },
      },
      { text: "Confirm the new server in Cursor Settings → MCP, then ask the agent about the data." },
    ],
  },
  {
    id: "vscode",
    name: "VS Code",
    steps: [
      {
        text: "Click the button, or run this in your terminal:",
        code: {
          language: "bash",
          value: `code --add-mcp '{"name":"${NAME}","type":"http","url":"${MCP_URL}"}'`,
        },
        button: { label: "Add to VS Code", href: VSCODE_INSTALL_LINK },
      },
      { text: "Open Copilot Chat in Agent mode and ask a question about the data." },
    ],
  },
];

export function McpInstructions() {
  const [client, setClient] = useState(CLIENTS[0].id);
  return (
    <Stack gap={4}>
      <Text as="p" className="leading-relaxed">
        Connect your AI assistant and ask questions about the data in plain language. The server is read-only, free, and
        needs no account or API key. It exposes every table in the snapshot and updates itself with each dump.
      </Text>

      <CopyableUrl label="MCP URL" value={MCP_URL} />

      <Stack gap={2}>
        <Text as="p" variant="label" className="font-medium">
          Set it up in your assistant
        </Text>
        <Tabs value={client} onValueChange={setClient} orientation="vertical" className="gap-6 max-sm:flex-col">
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="w-full sm:hidden" aria-label="AI assistant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENTS.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TabsList variant="line" aria-label="AI assistant" className="hidden shrink-0 sm:flex">
            {CLIENTS.map((c) => (
              <TabsTrigger key={c.id} value={c.id}>
                {c.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {CLIENTS.map((c) => (
            <TabsContent key={c.id} value={c.id}>
              <Steps>
                {c.steps.map((step) => (
                  <Step key={step.text} title={step.text}>
                    {step.code && (
                      <Inline align="start" wrap="nowrap">
                        <HighlightedCode
                          code={step.code.value}
                          language={step.code.language}
                          size="lg"
                          overflow="wrap"
                          actions="copy"
                          copyLabel="Copy"
                          className="flex-1"
                        />
                        {step.button && (
                          <Button asChild className="shrink-0">
                            <a href={step.button.href}>{step.button.label}</a>
                          </Button>
                        )}
                      </Inline>
                    )}
                  </Step>
                ))}
              </Steps>
            </TabsContent>
          ))}
        </Tabs>
      </Stack>
    </Stack>
  );
}
