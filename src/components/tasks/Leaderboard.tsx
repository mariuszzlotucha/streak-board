import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { rankStandings, UNKNOWN_MEMBER, type StandingInput } from "@/lib/leaderboard-rules";

interface LeaderboardProps {
  rows: StandingInput[];
  viewerId: string;
}

/**
 * Every member of the group with their total and position (equal totals share the position). Each value sits alone in
 * its own element: React inserts a comment between adjacent text nodes in server HTML. Keep it a pure function of its
 * props: its server HTML has to equal its first client render.
 */
export default function Leaderboard({ rows, viewerId }: LeaderboardProps) {
  const standings = rankStandings(rows, viewerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="font-heading text-xl font-semibold">Leaderboard</h2>
        </CardTitle>
        <CardDescription>Total streak points in your group</CardDescription>
      </CardHeader>
      <CardContent>
        <ol aria-label="Leaderboard" className="divide-y">
          {standings.map((standing) => (
            <li key={standing.userId} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 first:pt-0 last:pb-0">
              <span className="min-w-6 text-sm font-semibold tabular-nums">{standing.position}</span>
              <span className="min-w-0 text-sm break-all">{standing.email ?? UNKNOWN_MEMBER}</span>
              {standing.isYou && (
                <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs font-medium">You</span>
              )}
              <span className="ml-auto text-sm font-semibold tabular-nums">{standing.total}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
