import { ChevronDown } from "lucide-react";

import { CopyButton } from "~/components/copy-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

interface ChatBotInstructionsProps {
  generatedUrl: string;
}

export function ChatBotInstructions({ generatedUrl }: ChatBotInstructionsProps) {
  const chatBots = [
    { name: "StreamElements", command: `$(customapi ${generatedUrl || "https://your-command-url"})` },
    { name: "Fossabot", command: `$(customapi ${generatedUrl || "https://your-command-url"})` },
    { name: "Nightbot", command: `$(urlfetch ${generatedUrl || "https://your-command-url"})` },
  ];

  return (
    <Collapsible className="rounded-md border border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-sm font-medium transition-colors hover:bg-muted/50">
        How to use?
        <ChevronDown className="size-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border p-3 pt-3">
          <p className="mb-3 text-sm text-muted-foreground">
            Use the generated URL in your favorite chat bot to create dynamic commands:
          </p>
          <Tabs defaultValue={chatBots[0].name}>
            <TabsList>
              {chatBots.map(({ name }) => (
                <TabsTrigger key={name} value={name}>
                  {name}
                </TabsTrigger>
              ))}
            </TabsList>
            {chatBots.map(({ name, command }) => (
              <TabsContent key={name} value={name}>
                <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                  <code className="text-sm break-all whitespace-pre-wrap text-primary">{command}</code>
                  <CopyButton size="sm" text={command} className="ml-4 shrink-0" />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
