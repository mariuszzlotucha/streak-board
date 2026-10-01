import { useCheckoffDeltas } from "@/components/hooks/useCheckoffDeltas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { applyDeltas, rankStandings, UNKNOWN_MEMBER, type StandingInput } from "@/lib/leaderboard-rules";

interface LeaderboardProps {
  rows: StandingInput[];
  viewerId: string;
}

/**
 * Every member of the group with their total and position (equal totals share the position). The totals are the
 * server's plus the viewer's optimistic change from the check-off controls, ranked again, so a tap moves the board at
 * once. Each value sits alone in its own element: React inserts a comment between adjacent text nodes in server HTML.
 * The store is empty on the server and in the first client render, so the server HTML equals the first client render.
 */
export default function Leaderboard({ rows, viewerId }: LeaderboardProps) {
  const deltas = useCheckoffDeltas();
  const standings = rankStandings(applyDeltas(rows, deltas), viewerId);

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
