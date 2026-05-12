import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { SearchIcon, GithubIcon, Hexagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import SearchPalette from "./search";
import { UPSTREAM_REPO_URL } from "@workspace/agency-agents";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (e.key === "/") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center">
          <div className="mr-4 flex">
            <Link href="/" className="mr-6 flex items-center space-x-2">
              <Hexagon className="h-6 w-6 text-primary" />
              <span className="font-bold inline-block tracking-tight text-lg">Agency Agents</span>
            </Link>
          </div>
          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <div className="w-full flex-1 md:w-auto md:flex-none">
              <Button
                variant="outline"
                className="relative h-9 w-full justify-start rounded-[0.5rem] text-sm text-muted-foreground sm:pr-12 md:w-64 lg:w-80"
                onClick={() => setSearchOpen(true)}
              >
                <span className="hidden lg:inline-flex">Search agents, divisions, vibes...</span>
                <span className="inline-flex lg:hidden">Search...</span>
                <kbd className="pointer-events-none absolute right-1.5 top-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </Button>
            </div>
            <nav className="flex items-center">
              <a
                href={UPSTREAM_REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-2"
              >
                <Button variant="ghost" size="icon" className="w-9 h-9">
                  <GithubIcon className="h-4 w-4" />
                  <span className="sr-only">GitHub</span>
                </Button>
              </a>
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t py-6 md:py-0">
        <div className="container flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row max-w-screen-2xl">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            Built with Replit. Content imported from{" "}
            <a
              href={UPSTREAM_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              github.com/msitarzewski/agency-agents
            </a>
            {" "}under MIT license.
          </p>
        </div>
      </footer>
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
