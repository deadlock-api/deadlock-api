import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { CACHE_DURATIONS } from "~/constants/cache";
import { API_ORIGIN } from "~/lib/constants";
import {
  checkCommandTemplate,
  commandTemplateArgs,
  insertCommandVariable,
  isCommandTemplateValid,
} from "~/lib/streamkit-command";
import { snakeToPretty, useDebouncedState } from "~/lib/utils";
import { queryKeys } from "~/queries/query-keys";
import type { CommandBuilderProps, Variable } from "~/types/streamkit/command";

import { ChatBotInstructions } from "./ChatBotInstructions";
import { CommandPreview } from "./CommandPreview";
import { ExtraArguments } from "./ExtraArguments";
import { TemplateInput } from "./TemplateInput";
import { UrlDisplay } from "./UrlDisplay";
import { VariablesList } from "./VariablesList";

async function fetchVariables(): Promise<Variable[]> {
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
}

async function fetchPreview(url: string): Promise<string> {
  try {
    if (!url) return "";
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch preview: ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } catch (error) {
    console.error("Failed to fetch preview:", error);
    throw error;
  }
}

const TEMPLATE_URL_SYNC_MS = 500;

export function CommandBuilder({ region, accountId }: CommandBuilderProps) {
  const navigate = useNavigate();
  // The template lives in the page URL too, so a reload or a shared link keeps it.
  const urlTemplate = useSearch({ strict: false, select: (search) => (search as { template?: unknown }).template });
  const [template, debouncedTemplate, setTemplate] = useDebouncedState(
    urlTemplate == null ? "" : String(urlTemplate),
    TEMPLATE_URL_SYNC_MS,
  );
  const [edited, setEdited] = useState(false);
  const [extraArgs, setExtraArgs] = useState<{ [key: string]: string }>({});
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const { data, error } = useQuery<Variable[]>({
    queryKey: queryKeys.streamkit.availableVariables(),
    queryFn: fetchVariables,
    staleTime: CACHE_DURATIONS.FOREVER,
  });

  const allVariables = error ? [] : data;
  const variables = allVariables?.filter((v) => !v.name.endsWith("_img")) ?? [];

  useEffect(() => {
    // External sync: the page URL follows the template once typing pauses.
    const current = urlTemplate == null ? "" : String(urlTemplate);
    if (debouncedTemplate === current) return;
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, template: debouncedTemplate || undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [debouncedTemplate, urlTemplate, navigate]);

  // Only a template that resolves in full makes a URL: an empty one, `{foo}` or `{hero_kd}` without a hero would
  // answer chat with nothing or with the braces themselves.
  const generateUrl = (tpl: string) => {
    if (!accountId || !region || !isCommandTemplateValid(checkCommandTemplate(tpl, allVariables, extraArgs))) {
      return "";
    }
    const url = new URL(`${API_ORIGIN}/v1/commands/resolve`);
    url.searchParams.set("region", region);
    url.searchParams.set("account_id", accountId);
    url.searchParams.set("template", tpl);
    // Only the arguments the template's variables take: one left from a removed variable stayed in the URL.
    for (const arg of commandTemplateArgs(tpl, variables)) {
      if (extraArgs[arg]) url.searchParams.set(arg, extraArgs[arg]);
    }
    return url.toString();
  };

  const check = checkCommandTemplate(template, allVariables, extraArgs);
  const usedArgs = commandTemplateArgs(template, variables);
  const generatedUrl = generateUrl(template);
  const debouncedGeneratedUrl = generateUrl(debouncedTemplate);

  const templateError = check.empty
    ? edited
      ? "The template is empty. Type a reply or add a variable below."
      : null
    : check.unknown.length > 0
      ? `Unknown ${check.unknown.length === 1 ? "variable" : "variables"} ${check.unknown.map((name) => `{${name}}`).join(", ")}: the bot would send ${check.unknown.length === 1 ? "it" : "them"} as typed. Pick variables from the list below.`
      : null;
  const argErrors = Object.fromEntries(
    check.missing.map(({ arg, variables: needing }) => [
      arg,
      `${needing.map((name) => `{${name}}`).join(", ")} ${needing.length === 1 ? "needs" : "need"} ${arg === "hero_name" ? "a hero" : `a ${snakeToPretty(arg)}`}.`,
    ]),
  );

  const changeTemplate = (value: string) => {
    setEdited(true);
    setTemplate(value);
  };

  const insertVariable = (varName: string) => {
    const textarea = templateRef.current;
    // The selection survives the click on the variable button, so the token goes where the caret was.
    const next = insertCommandVariable(
      template,
      varName,
      textarea?.selectionStart ?? template.length,
      textarea?.selectionEnd ?? template.length,
    );
    flushSync(() => changeTemplate(next.template));
    // Back to the template with the caret after the token, so the next click (or typing) continues from there.
    textarea?.focus();
    textarea?.setSelectionRange(next.caret, next.caret);
  };

  const {
    data: previewData,
    error: previewRequestError,
    isLoading: previewLoading,
  } = useQuery<string>({
    queryKey: queryKeys.streamkit.preview(debouncedGeneratedUrl),
    queryFn: () => fetchPreview(debouncedGeneratedUrl),
    enabled: debouncedGeneratedUrl !== "",
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

  const invalid = !isCommandTemplateValid(check);

  return (
    <div className="flex flex-col gap-6">
      <TemplateInput ref={templateRef} template={template} onTemplateChange={changeTemplate} error={templateError} />
      <VariablesList variables={variables} onVariableClick={insertVariable} />
      <ExtraArguments
        extraArgs={extraArgs}
        usedArgs={usedArgs}
        onExtraArgChange={handleExtraArgChange}
        errors={argErrors}
      />
      <UrlDisplay
        generatedUrl={generatedUrl}
        placeholder={
          invalid && !check.empty
            ? "No URL until the template above is fixed."
            : "No URL available yet. Write a template to generate one."
        }
      />
      <CommandPreview
        preview={debouncedGeneratedUrl ? previewData || null : null}
        previewError={debouncedGeneratedUrl ? previewError : null}
        loading={debouncedGeneratedUrl !== "" && previewLoading}
      />
      <ChatBotInstructions generatedUrl={generatedUrl} />
    </div>
  );
}
