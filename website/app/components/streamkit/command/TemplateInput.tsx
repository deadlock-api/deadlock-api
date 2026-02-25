import { useId } from "react";
import { Label } from "~/components/ui/label";

interface TemplateInputProps {
  template: string;
  setTemplate: (value: string) => void;
}

export function TemplateInput({ template, setTemplate }: TemplateInputProps) {
  return (
    <div>
      <Label htmlFor="template">Command Template</Label>
      <div className="relative mt-1">
        <textarea
          id={useId()}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px] shadow-xs"
          placeholder="Example: {steam_account_name} has {wins_today}W - {losses_today}L today"
          rows={3}
        />
      </div>
    </div>
  );
}
