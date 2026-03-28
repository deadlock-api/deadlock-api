import { motion } from "framer-motion";
import Fuse from "fuse.js";
import { useMemo, useRef, useState } from "react";

import { cn } from "~/lib/utils";

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

  return (
    <div className="relative w-full">
      <div className="cursor-target flex items-center border border-muted-foreground/30 bg-black/40 backdrop-blur-sm transition-all focus-within:border-primary/60 focus-within:shadow-[0_0_8px_rgba(250,68,84,0.15)]">
        <span className="pl-3 font-mono text-sm text-primary/60 select-none">{">"}</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full bg-transparent px-2 py-2.5 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/30 disabled:opacity-30"
          autoComplete="off"
        />
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full border border-muted-foreground/20 bg-[#0d1117]/95 shadow-lg backdrop-blur-sm">
          {results.map((item, i) => (
            <motion.button
              key={item.id}
              type="button"
              whileTap={{ scale: 0.97, transition: { duration: 0 } }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSubmit(item)}
              className={cn(
                "cursor-target w-full px-3 py-3 text-left font-mono text-sm transition-colors",
                i === selectedIndex ? "bg-primary/15 text-primary" : "text-foreground/70 hover:bg-primary/10",
              )}
            >
              {item.name}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
