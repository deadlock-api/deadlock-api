import { useCallback, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

interface ChatBotInstructionsProps {
  generatedUrl: string;
}

export function ChatBotInstructions({ generatedUrl }: ChatBotInstructionsProps) {
  const [copiedBot, setCopiedBot] = useState<string | null>(null);

  const handleCopy = useCallback((name: string, command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedBot(name);
    setTimeout(() => setCopiedBot(null), 2000);
  }, []);

  const chatBots = [
    { name: "StreamElements", command: `$(customapi ${generatedUrl || "https://your-command-url"})` },
    { name: "Fossabot", command: `$(customapi ${generatedUrl || "https://your-command-url"})` },
    { name: "Nightbot", command: `$(urlfetch ${generatedUrl || "https://your-command-url"})` },
  ];

  return (
    <div>
      <h3 className="block text-sm font-medium text-foreground">How to use?</h3>
      <Card className="mt-2">
        <CardContent className="pt-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Use the generated URL in your favorite chat bot to create dynamic commands. Below are examples of how to use
            it with popular bots:
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
                <div className="flex items-center justify-between rounded-md bg-card border p-3">
                  <code className="text-primary text-sm whitespace-pre-wrap break-all">{command}</code>
                  <Button size="sm" onClick={() => handleCopy(name, command)} className="ml-4 shrink-0">
                    {copiedBot === name ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
