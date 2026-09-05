import { CopyButton } from "~/components/copy-button";
import { HighlightedCode, type HighlightLanguage } from "~/components/HighlightedCode";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

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
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed">
        Connect your AI assistant and ask questions about the data in plain language. The server is read-only, free, and
        needs no account or API key. It exposes every table in the snapshot and updates itself with each dump.
      </p>

      <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <span className="shrink-0 text-xs font-semibold tracking-wider text-muted-foreground uppercase">MCP URL</span>
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{MCP_URL}</code>
        <CopyButton iconOnly text={MCP_URL} title="Copy MCP URL" />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Set it up in your assistant</p>
        <Tabs defaultValue={CLIENTS[0].id} orientation="vertical" className="gap-6">
          <TabsList variant="line" className="shrink-0">
            {CLIENTS.map((c) => (
              <TabsTrigger
                key={c.id}
                value={c.id}
                // nested inside the horizontal snippet tabs, whose group/tabs styles also match
                // these triggers and mangle the active-line indicator — force the vertical geometry
                className="after:inset-y-0! after:-right-1! after:left-auto! after:h-auto! after:w-0.5!"
              >
                {c.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {CLIENTS.map((c) => (
            <TabsContent key={c.id} value={c.id}>
              <ol className="space-y-3">
                {c.steps.map((step, i) => (
                  <li key={step.text} className="flex gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm leading-relaxed">{step.text}</p>
                      {step.code && (
                        <div className="flex items-start gap-2">
                          <div className="relative min-w-0 flex-1">
                            <HighlightedCode
                              code={step.code.value}
                              language={step.code.language}
                              className="text-sm break-all whitespace-pre-wrap"
                            />
                            <CopyButton
                              iconOnly
                              text={step.code.value}
                              title="Copy"
                              className="absolute top-1 right-1 size-6 bg-background/60 backdrop-blur"
                            />
                          </div>
                          {step.button && (
                            <Button asChild size="sm" className="h-9 shrink-0">
                              <a href={step.button.href}>{step.button.label}</a>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
