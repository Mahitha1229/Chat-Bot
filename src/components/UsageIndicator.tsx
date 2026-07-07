interface UsageIndicatorProps {
  usage: {
    minuteUsed: number;
    minuteLimit: number;
    dayUsed: number;
    dayLimit: number;
    minuteResetInSeconds: number;
  } | null;
}

const UsageIndicator = ({ usage }: UsageIndicatorProps) => {
  if (!usage) return null;

  const minutePct = Math.min(100, (usage.minuteUsed / usage.minuteLimit) * 100);
  const dayPct = Math.min(100, (usage.dayUsed / usage.dayLimit) * 100);
  const worstPct = Math.max(minutePct, dayPct);

  const color =
    worstPct >= 90 ? "bg-destructive" : worstPct >= 70 ? "bg-amber-500" : "bg-primary";

  const textColor =
    worstPct >= 90 ? "text-destructive" : worstPct >= 70 ? "text-amber-500" : "text-muted-foreground";

  return (
    <div
      className="hidden md:flex flex-col gap-0.5 w-28"
      title={`${usage.minuteUsed}/${usage.minuteLimit} requests this minute · ${usage.dayUsed}/${usage.dayLimit} today`}
    >
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${minutePct}%` }}
        />
      </div>
      <span className={`text-[10px] leading-none ${textColor}`}>
        {usage.minuteUsed}/{usage.minuteLimit} per min
      </span>
    </div>
  );
};

export default UsageIndicator;