export type FamilyResult = {
  name: string;
  location: string;
  children: string;
  start: string;
  duration: string;
  description: string;
  lastLogin: string;
  initials: string;
  bg: string;
  hasStory?: boolean;
};

type FamilyResultCardProps = {
  family: FamilyResult;
};

export function FamilyResultCard({ family }: FamilyResultCardProps) {
  return (
    <article className="grid cursor-pointer gap-5 rounded-[1.75rem] border border-black/10 bg-[#fbfcfb] p-4 transition hover:bg-white hover:shadow-lg hover:shadow-black/5 md:grid-cols-[260px_1fr]">
      <div className={`relative min-h-[320px] rounded-[1.5rem] ${family.bg} p-4`}>
        {family.hasStory ? (
          <button
            type="button"
            aria-label={`Open ${family.name} story`}
            className="absolute left-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg font-bold shadow-sm ring-4 ring-white/60 transition hover:scale-105"
          >
            {family.initials}
          </button>
        ) : null}
      </div>

      <div className="flex flex-col justify-between gap-6 py-2">
        <div>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h3 className="text-3xl font-bold tracking-[-0.03em]">
                {family.name}
              </h3>
              <p className="mt-1 text-sm font-semibold text-[#26302d]/48">
                {family.location}
              </p>
            </div>

            <span className="w-fit rounded-full bg-[#f2eee8] px-3 py-1 text-xs font-bold text-[#9b7458]">
              Last login: {family.lastLogin}
            </span>
          </div>

          <p className="mt-4 text-sm font-bold text-[#26302d]/60">
            {family.children}
          </p>

          <p className="mt-5 max-w-2xl text-base leading-7 text-[#26302d]/68">
            {family.description}
          </p>
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#f0f2ef] px-3 py-1.5 text-xs font-bold text-[#26302d]/58">
              Starts {family.start}
            </span>
            <span className="rounded-full bg-[#f0f2ef] px-3 py-1.5 text-xs font-bold text-[#26302d]/58">
              {family.duration}
            </span>
          </div>

          <div className="mt-6 flex justify-end">
            <button className="rounded-full bg-[#8a9ca3] px-5 py-3 text-sm font-bold text-white">
              View profile
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
