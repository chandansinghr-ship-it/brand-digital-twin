import React, { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { agents, divisions, Agent } from "@workspace/agency-agents";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export default function SearchPalette({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [, setLocation] = useLocation();

  const handleSelect = (agent: Agent) => {
    onOpenChange(false);
    setLocation(`/agent/${agent.slug}`);
  };

  const handleSelectDivision = (slug: string) => {
    onOpenChange(false);
    setLocation(`/division/${slug}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Divisions">
          {divisions.map((div) => (
            <CommandItem
              key={div.slug}
              onSelect={() => handleSelectDivision(div.slug)}
            >
              <span>{div.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Agents">
          {agents.map((agent) => (
            <CommandItem
              key={agent.slug}
              onSelect={() => handleSelect(agent)}
              value={`${agent.title} ${agent.description} ${agent.vibe} ${agent.divisionLabel}`}
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">{agent.title}</span>
                <span className="text-xs text-muted-foreground truncate">{agent.vibe || agent.divisionLabel}</span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
