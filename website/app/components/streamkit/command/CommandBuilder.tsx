import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { CACHE_DURATIONS } from "~/constants/cache";
import { API_ORIGIN } from "~/lib/constants";
import { useDebouncedState } from "~/lib/utils";
import { queryKeys } from "~/queries/query-keys";
import type { CommandBuilderProps, Variable } from "~/types/streamkit/command";

import { ChatBotInstructions } from "./ChatBotInstructions";
import { CommandPreview } from "./CommandPreview";
import { ExtraArguments } from "./ExtraArguments";
import { TemplateInput } from "./TemplateInput";
import { UrlDisplay } from "./UrlDisplay";
import { VariablesList } from "./VariablesList";

export function CommandBuilder({ region, accountId }: CommandBuilderProps) {
  const [template, debouncedTemplate, setTemplate] = useDebouncedState("", 500);
  const [extraArgs, setExtraArgs] = useState<{ [key: string]: string }>({});

  const { data, error } = useQuery<Variable[]>({
    queryKey: queryKeys.streamkit.availableVariables(),
    queryFn: async () => {
      try {
        const res = await fetch(`${API_ORIGIN}/v1/commands/variables/available`);
        if (!res.ok) {
          throw new Error(`Failed to fetch variables: ${res.status} ${res.statusText}`);
        }
        return await res.json();
      } catch (error) {
        console.error("Failed to fetch variables:", error);
        throw error;
      }
    },
    staleTime: CACHE_DURATIONS.FOREVER,
  });

  const variables = useMemo(() => {
    if (error) return [];
    return data?.filter((v) => !v.name.endsWith("_img")) ?? [];
  }, [data, error]);

  const generateUrl = (steamId: string, r: string, tpl: string) => {
    if (!steamId || !r) {
      return "";
    }
    const baseUrl = `${API_ORIGIN}/v1/commands`;
    const url = new URL(`${baseUrl}/resolve`);
    url.searchParams.set("region", r);
    url.searchParams.set("account_id", steamId);
    if (tpl) {
      url.searchParams.set("template", tpl);
    }
    for (const [key, value] of Object.entries(extraArgs)) {
      if (value) url.searchParams.set(key, value);
    }
    return url.toString();
  };

  const usedExtraArgs = () => {
    const argSet: Set<string> = new Set();
    for (const match of template.matchAll(/{([^}]+)}/g)) {
      for (const arg of variables.find((v) => v.name === match[1])?.extra_args || []) {
        argSet.add(arg);
      }
    }
    return Array.from(argSet);
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
    queryKey: queryKeys.streamkit.preview(debouncedGeneratedUrl),
    queryFn: async () => {
      try {
        if (!debouncedGeneratedUrl) return "";
        const res = await fetch(debouncedGeneratedUrl);
        if (!res.ok) {
          throw new Error(`Failed to fetch preview: ${res.status} ${res.statusText}`);
        }
        return await res.text();
      } catch (error) {
        console.error("Failed to fetch preview:", error);
        throw error;
      }
    },
    staleTime: 60 * 1000,
  });

  const previewError = previewData
    ? null
    : previewRequestError
      ? "Failed to load preview. Please check the generated URL."
      : null;

  const handleExtraArgChange = (arg: string, value: string) => {
    setExtraArgs({ ...extraArgs, [arg]: value });
  };

  return (
    <div className="flex flex-col gap-6">
      <TemplateInput template={template} setTemplate={setTemplate} />
      <VariablesList variables={variables} onVariableClick={insertVariable} />
      <ExtraArguments extraArgs={extraArgs} usedArgs={usedExtraArgs()} onExtraArgChange={handleExtraArgChange} />
      <UrlDisplay generatedUrl={generatedUrl} />
      <CommandPreview preview={previewData || null} previewError={previewError} loading={previewLoading} />
      <ChatBotInstructions generatedUrl={generatedUrl} />
    </div>
  );
}
