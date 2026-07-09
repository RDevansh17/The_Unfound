export function HeroMap() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 hero-atmosphere" />
      <div className="absolute inset-0 grid-noise" />
      <div className="animate-drift absolute -right-16 top-10 h-72 w-72 rounded-full bg-teal-bright/25 blur-3xl" />
      <div className="animate-pulse-soft absolute bottom-10 left-8 h-56 w-56 rounded-full bg-signal/20 blur-3xl" />

      <svg
        className="absolute inset-0 h-full w-full opacity-70"
        viewBox="0 0 800 700"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <g stroke="rgba(232,242,240,0.12)" strokeWidth="1">
          <path d="M40 120C180 80 260 180 400 150C540 120 620 40 760 90" />
          <path d="M20 280C160 240 280 320 420 290C560 260 650 200 780 250" />
          <path d="M60 450C200 400 300 520 450 480C600 440 680 360 760 420" />
          <path d="M80 600C220 560 340 640 480 610C620 580 700 520 760 560" />
          <path d="M140 40C180 180 120 300 200 420C280 540 240 620 300 680" />
          <path d="M360 20C390 160 340 300 410 430C480 560 450 640 500 690" />
          <path d="M560 30C600 170 540 290 620 420C700 550 660 630 720 690" />
        </g>

        <path
          d="M120 520C210 420 280 360 360 300C440 240 520 210 620 160"
          stroke="url(#trail)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="420"
          style={{ animation: "draw-line 2.8s ease forwards" }}
        />

        <defs>
          <linearGradient id="trail" x1="120" y1="520" x2="620" y2="160">
            <stop stopColor="#2EC4B6" />
            <stop offset="1" stopColor="#B8F24A" />
          </linearGradient>
        </defs>

        {[
          [180, 460],
          [300, 340],
          [430, 250],
          [560, 190],
          [640, 150],
        ].map(([x, y], i) => (
          <g key={`${x}-${y}`}>
            <circle
              cx={x}
              cy={y}
              r={18 + i * 2}
              fill="rgba(184,242,74,0.08)"
              className="animate-pulse-soft"
              style={{ animationDelay: `${i * 0.35}s` }}
            />
            <circle cx={x} cy={y} r="5" fill="#B8F24A" />
          </g>
        ))}
      </svg>

      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0a1c24] via-[#0a1c24]/55 to-transparent" />
      <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[#0a1c24]/80 to-transparent" />
    </div>
  );
}
