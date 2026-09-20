import Fuse from "fuse.js";
import { useId, useMemo, useRef, useState } from "react";

import { OptionRow } from "~/components/ui/option-row";
import { Popover, PopoverAnchor, PopoverContent } from "~/components/ui/popover";
import { SearchInput } from "~/components/ui/search-input";

interface GuessInputProps {
  options: { id: string | number; name: string }[];
  onSubmit: (id: string | number, name: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function GuessInput({ options, onSubmit, disabled, placeholder = "TYPE YOUR GUESS..." }: GuessInputProps) {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const fuse = useMemo(() => new Fuse(options, { keys: ["name"], threshold: 0.3 }), [options]);

  const results = useMemo(
    () => (value.length > 0 ? fuse.search(value, { limit: 6 }).map((r) => r.item) : []),
    [value, fuse],
  );

  function handleValueChange(newValue: string) {
    setValue(newValue);
    setSelectedIndex(0);
    setShowDropdown(newValue.length > 0);
  }

  function handleSubmit(item: (typeof options)[0]) {
    onSubmit(item.id, item.name);
    setValue("");
    setShowDropdown(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSubmit(results[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  const isOpen = showDropdown && results.length > 0;

  return (
    <Popover open={isOpen} onOpenChange={setShowDropdown}>
      <PopoverAnchor asChild>
        <SearchInput
          ref={inputRef}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SearchInput already renders a native text input; this is the WAI-ARIA combobox pattern
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={isOpen ? `${listId}-${selectedIndex}` : undefined}
          value={value}
          onValueChange={handleValueChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          onBlur={() => setShowDropdown(false)}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={placeholder}
          className="cursor-target w-full font-mono"
          autoComplete="off"
        />
      </PopoverAnchor>
      {/* Portalled out of the page, so it names the games' theme scope itself. */}
      <PopoverContent
        align="start"
        className="theme-terminal w-(--radix-popover-trigger-width) p-1 font-mono"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.target === inputRef.current && e.preventDefault()}
      >
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the popup list of a custom combobox; a native select or datalist cannot carry it */}
        <div role="listbox" id={listId} aria-label={placeholder}>
          {results.map((item, i) => (
            <OptionRow
              key={item.id}
              id={`${listId}-${i}`}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the ARIA listbox above; a native option only exists inside a native select
              role="option"
              aria-selected={i === selectedIndex}
              tabIndex={-1}
              selected={false}
              active={i === selectedIndex}
              // Keeps the focus in the input, which owns the keyboard cursor of the list.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSubmit(item)}
              className="cursor-target py-2.5"
            >
              {item.name}
            </OptionRow>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
