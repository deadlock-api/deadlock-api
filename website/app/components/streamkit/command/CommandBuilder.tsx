import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useDebouncedState } from "~/lib/utils";
import type { CommandBuilderProps, Variable } from "~/types/streamkit/command";
import { ChatBotInstructions } from "./ChatBotInstructions";
import { CommandPreview } from "./CommandPreview";
import { ExtraArguments } from "./ExtraArguments";
import { TemplateInput } from "./TemplateInput";
import { UrlDisplay } from "./UrlDisplay";
import { VariablesList } from "./VariablesList";

export default function CommandBuilder({ region, accountId }: CommandBuilderProps) {
  const [template, debouncedTemplate, setTemplate] = useDebouncedState("", 500);
  const [extraArgs, setExtraArgs] = useState<{ [key: string]: string }>({});
  const [variables, setVariables] = useState<Variable[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const { data, error } = useQuery<Variable[]>({
    queryKey: ["available-variables"],
    queryFn: () => fetch("https://api.deadlock-api.com/v1/commands/variables/available").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (data) setVariables(data.filter((v) => !v.name.endsWith("_img")));
    if (error) {
      setVariables([]);
      console.error(error);
    }
  }, [data, error]);

  const generateUrl = (steamId: string, region: string, template: string) => {
    if (!steamId || !region) {
      return "";
    }
    const baseUrl = "https://api.deadlock-api.com/v1/commands";
    const url = new URL(`${baseUrl}/resolve`);
    url.searchParams.set("region", region);
    url.searchParams.set("account_id", steamId);
    if (template) {
      url.searchParams.set("template", template);
    }
    for (const [key, value] of Object.entries(extraArgs)) {
      if (value) url.searchParams.set(key, value);
    }
    return url.toString();
  };

  const usedExtraArgs = () => {
    const extraArgs: Set<string> = new Set();
    for (const match of template.matchAll(/{([^}]+)}/g)) {
      for (const arg of variables.find((v) => v.name === match[1])?.extra_args || []) {
        extraArgs.add(arg);
      }
    }
    return Array.from(extraArgs);
  };

  const generatedUrl = generateUrl(accountId, region, template);
  const debouncedGeneratedUrl = generateUrl(accountId, region, debouncedTemplate);

  const insertVariable = (varName: string) => {
    const cursorPos = (document.getElementById("template") as HTMLTextAreaElement)?.selectionStart || template.length;
    const newTemplate = `${template.slice(0, cursorPos)}{${varName}}${template.slice(cursorPos)}`;
    setTemplate(newTemplate);
  };

  const {
    data: previewData,
    error: previewRequestError,
    isLoading: previewLoading,
  } = useQuery<string>({
    queryKey: ["preview", debouncedGeneratedUrl],
    queryFn: async () => {
      if (!debouncedGeneratedUrl) return "";
      const res = await fetch(debouncedGeneratedUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch preview: ${res.statusText}`);
      }
      return await res.text();
    },
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (previewData) {
      setPreview(previewData);
      setPreviewError(null);
    } else if (previewRequestError) {
      console.error(`Failed to fetch preview: ${previewRequestError}`);
      setPreviewError("Failed to load preview. Please check the generated URL.");
      setPreview(null);
    }
  }, [previewData, previewRequestError]);

  const handleExtraArgChange = (arg: string, value: string) => {
    setExtraArgs({ ...extraArgs, [arg]: value });
  };

  return (
    <div className="mt-4 space-y-6">
      <TemplateInput template={template} setTemplate={setTemplate} />
      <VariablesList variables={variables} onVariableClick={insertVariable} />
      <ExtraArguments extraArgs={extraArgs} usedArgs={usedExtraArgs()} onExtraArgChange={handleExtraArgChange} />
      <UrlDisplay generatedUrl={generatedUrl} />
      <CommandPreview preview={preview} previewError={previewError} loading={previewLoading} />
      <ChatBotInstructions generatedUrl={generatedUrl} />
    </div>
  );
}
