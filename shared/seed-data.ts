/**
 * Client Leadership Resource Bank content — verbatim from the client's
 * revision table (调试.md attachment, 2026-09-19). This REPLACES all previous
 * data (request 3: "删除目前所有数据，一切以下方内容为准").
 *
 * startedAt/endsAt stay null: the sheet provides free-text application
 * timelines (carried verbatim in the timeline field).
 *
 * Program images (request 3): one image per card fetched from the program's
 * original website is NOT implemented — see .omo/questions.md entry
 * "Program images" for the reasons (anti-scraping/legality, mainland-China
 * network reachability, no stable per-program CDN). Cards use the tonal
 * placeholder tiles until the client supplies image URLs.
 */

import type { EntryDraft } from './types';

export const SEED_ENTRIES: EntryDraft[] = [
  {
    name: "Student Leaders Board (SLB)",
    summary:
      "The Duke Kunshan Student Leaders Board (SLB) is a body of student leaders, endorsed by peers and appointed by the University, to represent and serve student interests and needs in collaboration and consultation with the University leadership. Members of the SLB identify students’ needs and concerns, provide insights for campus decision-makers, create or co-create initiatives and programs, and engage in constructive and collaborative dialogue to promote the overall welfare and experience of student peers and the DKU community.",
    url: "https://campus-life.dukekunshan.edu.cn/student-leader-board/home/",
    audience: [
      "Be a full-time, actively enrolled DKU student",
      "Be in good academic and conduct standing",
      "Be physically present on the DKU campus throughout the whole-year of service",
    ],
    startsAt: null,
    endsAt: null,
    timeline: "Board Members: Session 2 Open\nCabinet Officers: Session 4 Open",
    category: 'on-campus',
    imageUrl: '/seed/on-campus.svg',
    quality: 95,
  },
  {
    name: "Orientation Leader (OL)",
    summary:
      "Students who guide new students through pre-arrival, Orientation Week, and the first 7 weeks of DKU102",
    url: "https://dukekunshan.edu.cn/leadership/orientation-leader",
    audience: ["OLs: Sophomore & above"],
    startsAt: null,
    endsAt: null,
    timeline: "Session 3 Week 6 - Session 4 Week 1",
    category: 'on-campus',
    imageUrl: '/seed/on-campus.svg',
    quality: 90,
  },
  {
    name: "Residence Assistant (RA)",
    summary:
      "Resident Assistants (RAs) are upperclass undergraduate or graduate students whose role is to help residents feel at home while living in our residence halls by creating opportunities to live, learn, and lead. To assist in residents’ academic and social integration at DKU, RAs host events that extend learning beyond the classroom, enhance a sense of belonging in their area, and encourage self-discovery. RAs serve as role model student leaders who take time to get to know and promote individual residents’ growth and development. They represent the depth and breadth of diversity in our student body. Additionally, RAs serve in a critical after-hours “on duty” capacity, responding to various inconveniences, emergencies, and crises.",
    url: "https://campus-life.dukekunshan.edu.cn/residence-life/get-involved/",
    audience: ["RAs: Candidates must be upperclass undergraduate or graduate students at DKU"],
    startsAt: null,
    endsAt: null,
    timeline: "Session 3 Week 6 - Session 4 Week 1",
    category: 'on-campus',
    imageUrl: '/seed/on-campus.svg',
    quality: 85,
  },
  {
    name: "Peer Mentors",
    summary:
      "Direct mentoring to ~10 first year students. Attending professional development training sessions. Developing projects related to students’ academic and campus life. Assisting with the UG Advising office Operations.",
    url: "https://academic-advising.dukekunshan.edu.cn/peer-mentors-list/",
    audience: [
      "Minimum cumulative GPA of 3.0 (students whose GPA below 3.0 are also encouraged to apply)",
      "Demonstrate effective verbal and written skills in English",
      "Enthusiastic about helping others",
      "Maintain professional conduct and appearance",
      "Commit to serve for at least one year in this role",
    ],
    startsAt: null,
    endsAt: null,
    timeline: "April Open",
    category: 'on-campus',
    imageUrl: '/seed/on-campus.svg',
    quality: 80,
  },
  {
    name: "Princeton in Asia (PiA)",
    summary:
      "Providing graduates with social service and employment opportunities across Asia, including China, Singapore, Japan, South Korea, and other regions. DKU graduates demonstrate significant advantages in multicultural adaptability.",
    url: "https://www.princetoninasia.org/",
    audience: ["Graduate students"],
    startsAt: null,
    endsAt: null,
    timeline: "October - December",
    category: 'fellowships',
    imageUrl: '/seed/fellowships.svg',
    quality: 95,
  },
  {
    name: "Millennium Fellowship",
    summary:
      "Undergraduate Leadership Program under the United Nations Academic Impact initiative. This is one of DKU's most popular programs among students and serves as an excellent endorsement of leadership skills during undergraduate studies.",
    url: "https://www.millenniumfellows.org/",
    audience: ["Undergraduate students"],
    startsAt: null,
    endsAt: null,
    timeline: "August - November",
    category: 'fellowships',
    imageUrl: '/seed/fellowships.svg',
    quality: 95,
  },
  {
    name: "Fulbright Program",
    summary:
      "A flagship international educational exchange program sponsored by the U.S. government, supporting students to conduct independent research or creative projects in 140+ countries.",
    url: "https://us.fulbrightonline.org/",
    audience: ["Seniors & Alumni"],
    startsAt: null,
    endsAt: null,
    timeline: "October due",
    category: 'fellowships',
    imageUrl: '/seed/fellowships.svg',
    quality: 90,
  },
  {
    name: "Horizon Program",
    summary:
      "An elite youth development initiative hosted by Tsinghua University. It allows DKU students to engage as young scholars within top-tier domestic and international academic circles.",
    url: "https://mp.weixin.qq.com/s/MsjAIVQBN_uH73Q7OVHH3w",
    audience: ["Undergraduate"],
    startsAt: null,
    endsAt: null,
    timeline: "July - August",
    category: 'fellowships',
    imageUrl: '/seed/fellowships.svg',
    quality: 90,
  },
  {
    name: "Erasmus Mundus",
    summary:
      "Full scholarships are available for master's programs offering mobility across multiple European universities. DKU graduates may apply as “third-country students” to receive substantial funding.",
    url: "https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en",
    audience: ["Seniors & Alumni"],
    startsAt: null,
    endsAt: null,
    timeline: "December - February",
    category: 'fellowships',
    imageUrl: '/seed/fellowships.svg',
    quality: 90,
  },
  {
    name: "Rhodes Scholarships",
    summary:
      "The oldest and perhaps most prestigious international scholarship, supporting exceptional students at the University of Oxford. It seeks leaders with moral force and character.",
    url: "https://www.rhodeshouse.ox.ac.uk/",
    audience: ["Seniors & Alumni (Aged 18-24/27)"],
    startsAt: null,
    endsAt: null,
    timeline: "September - October",
    category: 'fellowships',
    imageUrl: '/seed/fellowships.svg',
    quality: 90,
  },
  {
    name: "Schwarzman Scholars",
    summary:
      "Based at Tsinghua University, this program is designed to build a network of future global leaders who understand China's role in global trends. A perfect match for DKU's dual-background.",
    url: "https://www.schwarzmanscholars.org/",
    audience: ["Seniors & Alumni (Aged 18-28)"],
    startsAt: null,
    endsAt: null,
    timeline: "September due",
    category: 'fellowships',
    imageUrl: '/seed/fellowships.svg',
    quality: 90,
  },
  {
    name: "Yenching Academy",
    summary:
      "An interdisciplinary Master’s program at Peking University for outstanding graduates. It focuses on China’s past, present, and future within a global context.",
    url: "https://yenchingacademy.pku.edu.cn/",
    audience: ["Seniors & Alumni (Preferably under 28)"],
    startsAt: null,
    endsAt: null,
    timeline: "Mainland Chinese Candidates: June 1-8\nChina's HMT & Int'l: Sep - Dec",
    category: 'fellowships',
    imageUrl: '/seed/fellowships.svg',
    quality: 85,
  },
  {
    name: "DAAD Scholarships",
    summary:
      "Funded by the German government, providing various scholarships for international graduates to pursue Master’s or PhD degrees at top German universities.",
    url: "https://www.daad.de/en/",
    audience: ["Seniors, Alumni & PhDs"],
    startsAt: null,
    endsAt: null,
    timeline: "October - January",
    category: 'fellowships',
    imageUrl: '/seed/fellowships.svg',
    quality: 85,
  },
  {
    name: "Watson Institute",
    summary:
      "An incubator and training ground for next-generation leaders and social entrepreneurs. They partner with foundations (like Truist, Ford, Western Union) to provide Fellowships that include seed funding, mentorship, and intensive training",
    url: "https://watson.is/",
    audience: ["Individuals with an early-stage social venture or project"],
    startsAt: null,
    endsAt: null,
    timeline: "January - June",
    category: 'fellowships',
    imageUrl: '/seed/fellowships.svg',
    quality: 85,
  },
  {
    name: "Morehead-Cain Global Fellows Program",
    summary:
      "A highly selective, fully funded one-year fellowship for exceptional student leaders from around the world to study at the University of North Carolina at Chapel Hill. The program combines rigorous academics (30-36 credit hours per year), leadership development workshops, and cultural immersion. Fellows receive full funding for tuition, fees, living expenses, and enrichment opportunities. Upon completion, students receive an official UNC transcript and a certificate from the Morehead-Cain Foundation, and they return to their home institution to graduate",
    url: "https://global.moreheadcain.org/",
    audience: [
      "Current undergraduates",
      "Completed at least two years of study",
      "Expected to graduate after January 2028",
    ],
    startsAt: null,
    endsAt: null,
    timeline: "November – March",
    category: 'fellowships',
    imageUrl: '/seed/fellowships.svg',
    quality: 85,
  },
  {
    name: "McCall MacBain Scholarships",
    summary:
      "Canada's leadership-driven scholarship for master's and professional degrees at McGill University. Full scholarships cover tuition, fees, living stipend, and leadership development programming.",
    url: "https://mccallmacbainscholars.org/",
    audience: ["Seniors & Alumni (first bachelor's degree earned in 2021 or later)"],
    startsAt: null,
    endsAt: null,
    timeline: "August – September",
    category: 'fellowships',
    imageUrl: '/seed/fellowships.svg',
    quality: 85,
  },
  {
    name: "Harvard HSYLC",
    summary:
      "The largest annual summer summit for high school students in China, organized by Harvard HAUSCR. It introduces the Harvard \"Seminar\" style and liberal arts education to Chinese students, featuring courses taught by current Harvard undergrads.",
    url: "https://www.hsylc.cn/",
    audience: ["Students in China"],
    startsAt: null,
    endsAt: null,
    timeline: "June due",
    category: 'experiential',
    imageUrl: '/seed/experiential.svg',
    quality: 90,
  },
  {
    name: "A Better Community (ABC 美好社会咨询社)",
    summary:
      "An innovative platform connecting professionals and university students with NGOs. Volunteers provide pro-bono management consulting services (strategy, HR, branding, etc.) to help non-profits operate more effectively.",
    url: "https://www.theabconline.org/",
    audience: [
      "Must have professional proficiency in Chinese (reading/writing/speaking) as the working language with clients is Chinese",
    ],
    startsAt: null,
    endsAt: null,
    timeline: "Open year-round\nQuarterly rolling admissions",
    category: 'experiential',
    imageUrl: '/seed/experiential.svg',
    quality: 85,
  },
  {
    name: "LEAD Program",
    summary:
      "A leadership development program hosted by NYU Shanghai's Center for Student Belonging, designed to inspire students to turn ideas into action through facilitated dialogues on identity, race, gender, and inclusion. Students can participate in dialogue sessions, then apply their learning through research or creative projects during breaks, and eventually take on leadership roles as program ambassadors.",
    url: "https://shanghai.nyu.edu/cn/news/learning-lead",
    audience: [
      "NYU Shanghai students (currently)",
      "Cross-institutional participation may be possible via invitation",
    ],
    startsAt: null,
    endsAt: null,
    timeline: "Check NYU Shanghai announcements each semester",
    category: 'experiential',
    imageUrl: '/seed/experiential.svg',
    quality: 85,
  },
  {
    name: "Yenching Global Symposium",
    summary:
      "A flagship annual event hosted by the Yenching Academy of Peking University. It brings together selected delegates from around the world to Beijing (or online) for interdisciplinary dialogues on China-related topics.",
    url: "https://www.yenchingglobalsymposium.com/",
    audience: ["Bachelor's degree, born after May 1995 for the 2026 intake"],
    startsAt: null,
    endsAt: null,
    timeline: "January due",
    category: 'events',
    imageUrl: '/seed/events.svg',
    quality: 90,
  },
  {
    name: "International Studying Leadership Conference (ISLC)",
    summary:
      "The 24th annual conference hosted by Hult International Business School at Ashridge House, UK. Theme: \"Evolving Leadership: Learning from the Past, Shaping the Future.\" Features academic sessions on leadership theory, development, and research.",
    url: "https://www.hult.edu/islc2026/",
    audience: ["Scholars, researchers, and practitioners"],
    startsAt: null,
    endsAt: null,
    timeline: "December 6–8, 2026",
    category: 'events',
    imageUrl: '/seed/events.svg',
    quality: 85,
  },
  {
    name: "Florida International Leadership Conference (FILC)",
    summary:
      "An annual student conference organized by the Florida Association of International Educators, bringing together international students and U.S. study/service abroad students for leadership training and networking.",
    url: "https://faie.org/2026-filc/",
    audience: ["International students and study-abroad students"],
    startsAt: null,
    endsAt: null,
    timeline: "March 2027; Applications open November 2026",
    category: 'events',
    imageUrl: '/seed/events.svg',
    quality: 85,
  },
  {
    name: "‘Climate X’ Leadership Training Program",
    summary:
      "A program, established by the Global Alliance of Universities on Climate, aims to empower youth with the knowledge, skills, and tools, helping them globally envision a sustainable future, take meaningful action, and unlock their potential as talents for the carbon-neutral future.",
    url: "https://climatexleadership.gauc.net/",
    audience: ["College students who are passionate about Climate Action and Sustainability"],
    startsAt: null,
    endsAt: null,
    timeline: "July to August, Rolling admission",
    category: 'training',
    imageUrl: '/seed/training.svg',
    quality: 90,
  },
  {
    name: "Art and Practice of Leadership Development",
    summary:
      "A one-week on-campus executive program at Harvard Kennedy School. Features the Adaptive Leadership framework by Ron Heifetz, participant case studies, and peer consultation. Designed for leadership development professionals.",
    url: "https://www.hks.harvard.edu/educational-programs/executive-education/art-and-practice-leadership-development",
    audience: ["Experienced leadership development professionals, HR leaders, consultants"],
    startsAt: null,
    endsAt: null,
    timeline: "On-campus program; Application deadline varies; Available in 2026",
    category: 'training',
    imageUrl: '/seed/training.svg',
    quality: 85,
  },
];
