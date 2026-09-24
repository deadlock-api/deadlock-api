import { Field } from "~/components/ui/field";
import { Textarea } from "~/components/ui/textarea";

interface TemplateInputProps {
  template: string;
  onTemplateChange: (value: string) => void;
  /** What is wrong with the template; nothing is generated while it is set. */
  error?: string | null;
  ref?: React.Ref<HTMLTextAreaElement>;
}

export function TemplateInput({ template, onTemplateChange, error = null, ref }: TemplateInputProps) {
  return (
    <Field
      label="Command Template"
      htmlFor="template"
      description="Type the reply and add variables from the list below, at the cursor."
      error={error}
    >
      <Textarea
        ref={ref}
        id="template"
        value={template}
        onChange={(e) => onTemplateChange(e.target.value)}
        placeholder="Example: {steam_account_name} has {wins_today}W - {losses_today}L today"
        rows={3}
      />
    </Field>
  );
}
