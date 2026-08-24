export type AuPairResult = {
  name: string;
  age: number;
  location: string;
  nationality: string;
  languages: string[];
  start: string;
  duration: string;
  experience: string;
  lastLogin: string;
  initials: string;
  bg: string;
  hasStory?: boolean;
};

type AuPairResultCardProps = {
  profile: AuPairResult;
};

export function AuPairResultCard({ profile }: AuPairResultCardProps) {
  return (
    <article className="grid cursor-pointer gap-5 rounded-[1.75rem] border border-black/10 bg-[#fbfcfb] p-4 transition hover:bg-white hover:shadow-lg hover:shadow-black/5 md:grid-cols-[260px_1fr]">
      <div className={`relative min-h-[320px] rounded-[1.5rem] ${profile.bg} p-4`}>
        {profile.hasStory ? (
          <button
            type="button"
            aria-label={`Open ${profile.name} story`}
            className="absolute left-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg font-bold shadow-sm ring-4 ring-white/60 transition hover:scale-105"
          >
            {profile.initials}
          </button>
        ) : null}
      </div>

      <div className="flex flex-col justify-between gap-6 py-2">
        <div>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h3 className="text-3xl font-bold tracking-[-0.03em]">
                {profile.name}, {profile.age}
              </h3>
              <p className="mt-1 text-sm font-semibold text-[#26302d]/48">
                {profile.location}
              </p>
            </div>

            <span className="w-fit rounded-full bg-[#eef3f1] px-3 py-1 text-xs font-bold text-[#78939b]">
              Last login: {profile.lastLogin}
            </span>
          </div>

          <p className="mt-5 max-w-2xl text-base leading-7 text-[#26302d]/68">
            {profile.experience}
          </p>
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#f0f2ef] px-3 py-1.5 text-xs font-bold text-[#26302d]/58">
              {profile.nationality}
            </span>
            <span className="rounded-full bg-[#f0f2ef] px-3 py-1.5 text-xs font-bold text-[#26302d]/58">
              Starts {profile.start}
            </span>
            <span className="rounded-full bg-[#f0f2ef] px-3 py-1.5 text-xs font-bold text-[#26302d]/58">
              {profile.duration}
            </span>
            {profile.languages.map((language) => (
              <span
                key={language}
                className="rounded-full bg-[#f2eee8] px-3 py-1.5 text-xs font-bold text-[#26302d]/58"
              >
                {language}
              </span>
            ))}
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
