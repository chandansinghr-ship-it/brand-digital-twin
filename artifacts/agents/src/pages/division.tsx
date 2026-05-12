import React, { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { divisions, agentsByDivision } from "@workspace/agency-agents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight, HomeIcon } from "lucide-react";
import NotFound from "./not-found";

export default function Division() {
  const params = useParams();
  const divisionSlug = params.divisionSlug;
  const division = divisions.find((d) => d.slug === divisionSlug);
  const agents = divisionSlug ? agentsByDivision.get(divisionSlug) || [] : [];
  
  const [filter, setFilter] = useState("");

  const filteredAgents = useMemo(() => {
    if (!filter) return agents;
    const lower = filter.toLowerCase();
    return agents.filter(a => 
      a.title.toLowerCase().includes(lower) || 
      a.description.toLowerCase().includes(lower) ||
      (a.vibe && a.vibe.toLowerCase().includes(lower))
    );
  }, [agents, filter]);

  if (!division) {
    return <NotFound />;
  }

  return (
    <div className="container max-w-screen-2xl py-8 px-4 md:px-8">
      <div className="flex items-center text-sm text-muted-foreground mb-8">
        <Link href="/" className="hover:text-foreground transition-colors flex items-center gap-1">
          <HomeIcon className="w-4 h-4" />
          Home
        </Link>
        <ChevronRight className="w-4 h-4 mx-1" />
        <span className="text-foreground font-medium">{division.label}</span>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight lg:text-4xl mb-2">
            {division.label} Division
          </h1>
          <p className="text-lg text-muted-foreground">
            {agents.length} agents available
          </p>
        </div>
        <div className="w-full md:w-80 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${division.label} agents...`}
              className="pl-9"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAgents.map((agent) => (
          <Link key={agent.slug} href={`/agent/${agent.slug}`}>
            <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md cursor-pointer flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg leading-tight mb-1">{agent.title}</CardTitle>
                {agent.vibe && (
                  <div className="text-xs font-medium text-primary bg-primary/10 w-fit px-2 py-1 rounded-md">
                    {agent.vibe}
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex-1">
                <CardDescription className="text-sm text-foreground/80 line-clamp-4">
                  {agent.description}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      
      {filteredAgents.length === 0 && (
        <div className="text-center py-20 border rounded-lg bg-muted/20">
          <h3 className="text-lg font-medium text-muted-foreground">No agents found matching "{filter}"</h3>
        </div>
      )}
    </div>
  );
}
