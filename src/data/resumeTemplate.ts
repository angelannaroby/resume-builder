import type { Bullet, Resume } from "@/domain/resume";

const b = (...t: string[]): Bullet[] =>
  t.map((text) => ({ text, hidden: false }));

export const resumeTemplate: Resume = {
  name: "Your Name",
  headline: "Frontend Developer | React | TypeScript",
  email: "you@example.com",
  phone: "+49 000 00000000",
  location: "Germany",
  relocation: "Open to relocation",
  linkedin: "linkedin.com/in/your-profile",
  github: "github.com/your-profile",
  portfolio: "your-portfolio.example",
  summary:
    "Frontend developer experienced in building production web applications with React and TypeScript. Comfortable taking features from requirements and design through API integration, testing and release while collaborating with product, backend and QA teams.",
  skills: [
    {
      label: "Core Frontend",
      items:
        "React, TypeScript, JavaScript, HTML, CSS/SCSS, Material UI, Responsive Design, Accessibility",
    },
    {
      label: "State, Forms & Data",
      items:
        "TanStack Query, React Hook Form, REST APIs, GraphQL, Axios, i18n",
    },
    {
      label: "Testing & Tooling",
      items:
        "Vitest, Playwright, Git, Vite, CI/CD, Agile/Scrum",
    },
  ],
  jobs: [
    {
      title: "Frontend Developer",
      org: "Example Software GmbH",
      dates: "January 2024 - Present",
      location: "Germany",
      bullets: b(
        "Owned end-to-end frontend delivery of React and TypeScript features for a production web application.",
        "Created reusable UI components and integrated REST APIs with automated tests.",
        "Worked with product, backend and QA colleagues in iterative release cycles.",
      ).concat([{
        text: "Created storyboards and short demo videos to explain user workflows and product features.",
        hidden: true,
      }]),
    },
    {
      title: "Software Engineer - Frontend",
      org: "Example Technology Ltd.",
      dates: "January 2022 - December 2023",
      location: "Germany",
      bullets: b(
        "Developed responsive data-heavy interfaces and reusable frontend components.",
        "Improved maintainability through component refactoring, testing and documentation.",
      ),
    },
  ],
  education: [
    {
      degree: "MSc Computer Science",
      org: "Example University",
      dates: "2022 - 2024",
      location: "Germany",
      details: "",
      thesis: "Optional thesis title and short description",
    },
  ],
  extras: [
    { label: "English", text: "Professional proficiency" },
    { label: "German", text: "Intermediate" },
    {
      label: "Work Authorisation",
      text: "Add your own work-authorisation information locally",
    },
  ],
};
