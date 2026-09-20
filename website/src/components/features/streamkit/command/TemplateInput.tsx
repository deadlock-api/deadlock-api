import { Field } from "~/components/ui/field";
import { Textarea } from "~/components/ui/textarea";

interface TemplateInputProps {
  template: string;
  setTemplate: (value: string) => void;
}

export function TemplateInput({ template, setTemplate }: TemplateInputProps) {
  return (
    <Field label="Command Template" htmlFor="template">
      <Textarea
        id="template"
        aria-label="Command Template"
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        placeholder="Example: {steam_account_name} has {wins_today}W - {losses_today}L today"
        rows={3}
      />
    </Field>
  );
}
