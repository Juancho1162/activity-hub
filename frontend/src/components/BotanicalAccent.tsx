/** A decorative sprout, independent of activity or progress. */
export function BotanicalAccent() {
  return <svg className="botanical-accent" viewBox="0 0 40 40" width="60" height="60" aria-hidden="true" focusable="false" shapeRendering="crispEdges">
    <path fill="var(--primary)" d="M19 14h2v18h-2zM15 18h4v2h-4zM21 12h4v2h-4z" />
    <path fill="var(--primary)" d="M7 10h6v2h4v2h2v6h-6v-2H9v-2H7zM25 5h8v6h-2v4h-4v2h-6v-6h2V7h2z" />
    <path fill="var(--primary-foreground)" opacity=".35" d="M9 12h4v2h2v2h-4v-2H9zM27 7h4v2h-4v2h-2V9h2z" />
  </svg>
}
